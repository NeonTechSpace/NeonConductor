import type { OrchestratorStepRecord, PlanRecord } from '@/app/backend/persistence/types';
import type { EntityId, OrchestratorStartInput, OrchestratorSwarmRole } from '@/app/backend/runtime/contracts';
import {
    abortDelegatedChildRun,
    resolveDelegatedChildRootExecutionContext,
    startDelegatedChildLaneRun,
    waitForRunTerminal,
    type DelegatedChildRootExecutionContext,
} from '@/app/backend/runtime/services/common/delegatedChildLane';
import type { ApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';
import type { WorkerPresetId } from '@/shared/workerPresetCatalog';

export interface OrchestratorChildRunStart {
    childThreadId: EntityId<'thr'>;
    childSessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
}

function toSingleLine(value: string): string {
    return value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(' ');
}

function buildChildThreadTitle(step: OrchestratorStepRecord): string {
    const titleSource = toSingleLine(step.description);
    const titleSuffix = titleSource.length > 0 ? titleSource : 'Delegated worker task';
    const title = `Step ${String(step.sequence)}: ${titleSuffix}`;
    return title.length <= 88 ? title : `${title.slice(0, 85).trimEnd()}...`;
}

export function buildSwarmChildThreadTitle(input: {
    step?: OrchestratorStepRecord;
    role: OrchestratorSwarmRole;
}): string {
    if (!input.step) {
        return `Swarm ${input.role}: final synthesis`;
    }

    const titleSource = toSingleLine(input.step.description);
    const titleSuffix = titleSource.length > 0 ? titleSource : 'Swarm worker task';
    const title = `Step ${String(input.step.sequence)} ${input.role}: ${titleSuffix}`;
    return title.length <= 88 ? title : `${title.slice(0, 85).trimEnd()}...`;
}

export function buildStepPrompt(
    approvedArtifact: ApprovedPlanExecutionArtifact,
    step: OrchestratorStepRecord
): string {
    return [
        `Execute step ${String(step.sequence)} from approved orchestrator plan.`,
        '',
        'Plan summary:',
        approvedArtifact.summaryMarkdown,
        '',
        'Step task:',
        step.description,
    ].join('\n');
}

export function buildSwarmStepPrompt(input: {
    approvedArtifact: ApprovedPlanExecutionArtifact;
    step?: OrchestratorStepRecord;
    role: OrchestratorSwarmRole;
    sharedContextMarkdown: string;
}): string {
    const roleInstruction =
        input.role === 'explorer'
            ? 'Investigate the step before implementation. Return concrete findings, relevant files, risks, and recommended implementation guidance. Do not edit files.'
            : input.role === 'implementer'
              ? 'Implement the step using the approved plan and the shared swarm context. Keep changes bounded to this step.'
              : input.role === 'reviewer'
                ? 'Review the implemented step for correctness, security, maintainability, and missing validation. Do not edit files.'
                : input.role === 'verifier'
                  ? 'Verify the implemented step with available checks or explain skipped checks. Do not edit files.'
                  : 'Synthesize the completed swarm run. Summarize what each lane established, what changed, validation status, residual risks, and operator-facing next steps. Do not edit files.';

    return [
        `Swarm role: ${input.role}`,
        roleInstruction,
        '',
        'Approved plan summary:',
        input.approvedArtifact.summaryMarkdown,
        '',
        input.step ? 'Step task:' : 'Synthesis target:',
        input.step?.description ?? 'Produce final conductor synthesis for the entire swarm run.',
        '',
        'Shared swarm context:',
        input.sharedContextMarkdown.trim().length > 0 ? input.sharedContextMarkdown : 'No prior swarm context recorded.',
    ].join('\n');
}

function resolveWorkerRoute(role: OrchestratorSwarmRole): {
    topLevelTab: 'agent';
    modeKey: string;
    workerPresetId?: WorkerPresetId;
} {
    switch (role) {
        case 'explorer':
            return { topLevelTab: 'agent', modeKey: 'research', workerPresetId: 'code_explorer' };
        case 'implementer':
            return { topLevelTab: 'agent', modeKey: 'code' };
        case 'reviewer':
            return { topLevelTab: 'agent', modeKey: 'research', workerPresetId: 'patch_reviewer' };
        case 'verifier':
            return { topLevelTab: 'agent', modeKey: 'research', workerPresetId: 'ui_verifier' };
        case 'synthesizer':
            return { topLevelTab: 'agent', modeKey: 'research' };
    }
}

export async function resolveOrchestratorRootExecutionContext(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
}): Promise<DelegatedChildRootExecutionContext | null> {
    return resolveDelegatedChildRootExecutionContext(input);
}

export { abortDelegatedChildRun, waitForRunTerminal };

export async function startDelegatedChildRun(input: {
    profileId: string;
    orchestratorRunId: EntityId<'orch'>;
    rootContext: DelegatedChildRootExecutionContext;
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    step?: OrchestratorStepRecord;
    startInput: OrchestratorStartInput;
    childTitle?: string;
    prompt?: string;
    role?: OrchestratorSwarmRole;
}): Promise<{ accepted: true; started: OrchestratorChildRunStart } | { accepted: false; reason: string }> {
    const route = input.role ? resolveWorkerRoute(input.role) : { topLevelTab: 'agent' as const, modeKey: 'code' };
    return startDelegatedChildLaneRun({
        profileId: input.profileId,
        owner: {
            kind: 'orchestrator',
            orchestratorRunId: input.orchestratorRunId,
        },
        rootContext: input.rootContext,
        rootSessionId: input.plan.sessionId,
        childTitle: input.childTitle ?? (input.step ? buildChildThreadTitle(input.step) : 'Swarm synthesis'),
        prompt:
            input.prompt ??
            (input.step
                ? buildStepPrompt(input.approvedArtifact, input.step)
                : buildSwarmStepPrompt({
                      approvedArtifact: input.approvedArtifact,
                      role: 'synthesizer',
                      sharedContextMarkdown: '',
                  })),
        topLevelTab: route.topLevelTab,
        modeKey: route.modeKey,
        runtimeOptions: input.startInput.runtimeOptions,
        ...(input.startInput.providerId ? { providerId: input.startInput.providerId } : {}),
        ...(input.startInput.modelId ? { modelId: input.startInput.modelId } : {}),
        ...(input.rootContext.bucket.workspaceFingerprint
            ? { workspaceFingerprint: input.rootContext.bucket.workspaceFingerprint }
            : {}),
        ...(route.workerPresetId ? { workerPresetId: route.workerPresetId } : {}),
        planId: input.approvedArtifact.planId,
        planRevisionId: input.approvedArtifact.approvedRevisionId,
        ...(input.startInput.planPhaseId ? { planPhaseId: input.startInput.planPhaseId } : {}),
        ...(input.startInput.planPhaseRevisionId
            ? { planPhaseRevisionId: input.startInput.planPhaseRevisionId }
            : {}),
    });
}

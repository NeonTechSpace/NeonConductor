import type { OrchestratorStepRecord, PlanRecord } from '@/app/backend/persistence/types';
import type { EntityId, OrchestratorStartInput } from '@/app/backend/runtime/contracts';
import {
    abortDelegatedChildRun,
    resolveDelegatedChildRootExecutionContext,
    startDelegatedChildLaneRun,
    waitForRunTerminal,
    type DelegatedChildRootExecutionContext,
} from '@/app/backend/runtime/services/common/delegatedChildLane';
import type { ApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';

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
    step: OrchestratorStepRecord;
    startInput: OrchestratorStartInput;
}): Promise<{ accepted: true; started: OrchestratorChildRunStart } | { accepted: false; reason: string }> {
    return startDelegatedChildLaneRun({
        profileId: input.profileId,
        owner: {
            kind: 'orchestrator',
            orchestratorRunId: input.orchestratorRunId,
        },
        rootContext: input.rootContext,
        rootSessionId: input.plan.sessionId,
        childTitle: buildChildThreadTitle(input.step),
        prompt: buildStepPrompt(input.approvedArtifact, input.step),
        modeKey: 'code',
        runtimeOptions: input.startInput.runtimeOptions,
        ...(input.startInput.providerId ? { providerId: input.startInput.providerId } : {}),
        ...(input.startInput.modelId ? { modelId: input.startInput.modelId } : {}),
        ...(input.rootContext.bucket.workspaceFingerprint
            ? { workspaceFingerprint: input.rootContext.bucket.workspaceFingerprint }
            : {}),
        planId: input.approvedArtifact.planId,
        planRevisionId: input.approvedArtifact.approvedRevisionId,
    });
}

import { err, ok, type Result } from 'neverthrow';

import type {
    OrchestratorRunRecord,
    OrchestratorStepRecord,
    PlanItemRecord,
    PlanRecord,
} from '@/app/backend/persistence/types';
import { orchestratorLazyStore, planStore } from '@/app/backend/persistence/stores';
import type { EntityId, OrchestratorLazyStartInput, OrchestratorStartInput, PlanRecordView } from '@/app/backend/runtime/contracts';
import { abortOrchestratorRun } from '@/app/backend/runtime/services/orchestrator/abort';
import { ActiveOrchestratorRunRegistry } from '@/app/backend/runtime/services/orchestrator/activeRunRegistry';
import type { OrchestratorExecutionError } from '@/app/backend/runtime/services/orchestrator/errors';
import { executeOrchestratorSteps } from '@/app/backend/runtime/services/orchestrator/executionLoop';
import {
    appendAndLogOrchestratorStarted,
    logRejectedOrchestratorStart,
    prepareOrchestratorStart,
} from '@/app/backend/runtime/services/orchestrator/start';
import {
    getLatestOrchestratorBySession,
    getOrchestratorStatus,
    type OrchestratorStatusResult,
} from '@/app/backend/runtime/services/orchestrator/status';
import type { ApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';
import { approvePlan } from '@/app/backend/runtime/services/plan/approval';

export class OrchestratorExecutionService {
    private readonly activeRuns = new ActiveOrchestratorRunRegistry();

    async start(
        input: OrchestratorStartInput & {
            approvedArtifact?: ApprovedPlanExecutionArtifact;
        }
    ): Promise<
        Result<
            { started: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] },
            OrchestratorExecutionError
        >
    > {
        const prepared = await prepareOrchestratorStart(input);
        if (prepared.isErr()) {
            logRejectedOrchestratorStart(input, prepared.error);
            return err(prepared.error);
        }
        const { plan, approvedArtifact, planItems, run, steps } = prepared.value;

        await appendAndLogOrchestratorStarted({
            profileId: input.profileId,
            sessionId: plan.sessionId,
            planId: plan.id,
            revisionId: approvedArtifact.approvedRevisionId,
            revisionNumber: approvedArtifact.approvedRevisionNumber,
            runId: run.id,
            stepCount: steps.length,
        });
        this.activeRuns.begin(run.id, {
            profileId: input.profileId,
            sessionId: plan.sessionId,
            childSessionIds: new Set(),
        });

        void this.execute({
            plan,
            approvedArtifact,
            planItems,
            orchestratorRunId: run.id,
            steps,
            startInput: input,
        }).finally(() => {
            this.activeRuns.finish(run.id);
        });

        return prepared.map(() => ({
            started: true,
            run,
            steps,
        }));
    }

    async startLazy(
        input: OrchestratorLazyStartInput
    ): Promise<
        Result<
            { started: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[]; plan: PlanRecordView },
            OrchestratorExecutionError
        >
    > {
        const summaryMarkdown = [
            'Goal-driven Lazy orchestrator objective.',
            '',
            'Objective:',
            input.objectiveMarkdown,
            '',
            'Success criteria:',
            input.successCriteriaMarkdown ?? 'The objective is complete, verified, and summarized for the operator.',
            '',
            'Constraints:',
            input.constraintsMarkdown ?? 'Use NeonConductor run contracts, permissions, sandboxing, and receipts.',
            '',
            'Evidence requirements:',
            input.evidenceRequirementsMarkdown ?? 'Record orientation, decisions, verification notes, and final walkthrough.',
        ].join('\n');
        const plan = await planStore.create({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: 'orchestrator',
            modeKey: 'orchestrate',
            planningDepth: 'advanced',
            sourcePrompt: input.objectiveMarkdown,
            summaryMarkdown,
            questions: [],
            advancedSnapshot: {
                evidenceMarkdown: input.evidenceRequirementsMarkdown ?? 'Evidence will be gathered during Lazy orientation.',
                observationsMarkdown: input.constraintsMarkdown ?? 'No additional operator constraints were provided.',
                rootCauseMarkdown: input.objectiveMarkdown,
                phases: [
                    {
                        id: 'lazy-orientation',
                        sequence: 1,
                        title: 'Orientation',
                        goalMarkdown: 'Discover relevant context before implementation.',
                        exitCriteriaMarkdown: 'Orientation evidence is recorded.',
                    },
                    {
                        id: 'lazy-execution',
                        sequence: 2,
                        title: 'Execution',
                        goalMarkdown: 'Execute the task tree through NeonConductor child lanes.',
                        exitCriteriaMarkdown: 'Tasks are implemented and verified.',
                    },
                ],
            },
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        const approved = await approvePlan(input.profileId, plan.id, plan.currentRevisionId);
        if (approved.isErr() || !approved.value.found) {
            const message = approved.isErr()
                ? approved.error.message
                : 'Lazy objective plan could not be approved after creation.';
            return err({
                code: 'approved_revision_unavailable',
                message,
            });
        }

        const started = await this.start({
            profileId: input.profileId,
            planId: plan.id,
            runtimeOptions: input.runtimeOptions,
            executionStrategy: 'lazy',
            lazyObjective: {
                objectiveMarkdown: input.objectiveMarkdown,
                ...(input.successCriteriaMarkdown ? { successCriteriaMarkdown: input.successCriteriaMarkdown } : {}),
                ...(input.constraintsMarkdown ? { constraintsMarkdown: input.constraintsMarkdown } : {}),
                ...(input.evidenceRequirementsMarkdown
                    ? { evidenceRequirementsMarkdown: input.evidenceRequirementsMarkdown }
                    : {}),
                allowedCapabilityGroups: input.allowedCapabilityGroups,
                researchDepth: input.researchDepth,
                packagePolicy: input.packagePolicy,
            },
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.modelId ? { modelId: input.modelId } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        if (started.isErr()) {
            return err(started.error);
        }
        return ok({
            ...started.value,
            plan: approved.value.plan,
        });
    }

    async resolveLazyCheckpoint(
        input: { profileId: string; checkpointId: EntityId<'lchk'>; status: 'resolved' | 'cancelled'; responseMarkdown?: string }
    ): Promise<{ resolved: false; reason: 'not_found' } | { resolved: true; latest: OrchestratorStatusResult }> {
        const checkpoint = await orchestratorLazyStore.resolveCheckpoint(input.checkpointId, {
            status: input.status,
            ...(input.responseMarkdown ? { responseMarkdown: input.responseMarkdown } : {}),
        });
        if (!checkpoint) {
            return { resolved: false, reason: 'not_found' };
        }
        return {
            resolved: true,
            latest: await getOrchestratorStatus(input.profileId, checkpoint.orchestratorRunId),
        };
    }

    async getStatus(
        profileId: string,
        orchestratorRunId: EntityId<'orch'>
    ): Promise<OrchestratorStatusResult> {
        return getOrchestratorStatus(profileId, orchestratorRunId);
    }

    async getLatestBySession(profileId: string, sessionId: EntityId<'sess'>): Promise<OrchestratorStatusResult> {
        return getLatestOrchestratorBySession(profileId, sessionId);
    }

    async abort(
        profileId: string,
        orchestratorRunId: EntityId<'orch'>
    ): Promise<
        | { aborted: false; reason: 'not_found' }
        | {
              aborted: true;
              runId: EntityId<'orch'>;
              latest: OrchestratorStatusResult;
          }
    > {
        const result = await abortOrchestratorRun({
            profileId,
            orchestratorRunId,
            activeRuns: this.activeRuns,
        });

        if (!result.aborted) {
            return result;
        }

        return {
            ...result,
            latest: await getOrchestratorStatus(profileId, orchestratorRunId),
        };
    }

    private async execute(input: {
        plan: PlanRecord;
        approvedArtifact: ApprovedPlanExecutionArtifact;
        planItems: PlanItemRecord[];
        orchestratorRunId: EntityId<'orch'>;
        steps: OrchestratorStepRecord[];
        startInput: OrchestratorStartInput;
    }): Promise<void> {
        await executeOrchestratorSteps({
            ...input,
            activeRuns: this.activeRuns,
            executionStrategy: input.startInput.executionStrategy ?? 'sequential',
        });
    }
}

export const orchestratorExecutionService = new OrchestratorExecutionService();

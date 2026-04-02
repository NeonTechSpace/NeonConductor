import { err, type Result } from 'neverthrow';

import type {
    OrchestratorRunRecord,
    OrchestratorStepRecord,
    PlanItemRecord,
    PlanRecord,
} from '@/app/backend/persistence/types';
import type { EntityId, OrchestratorStartInput } from '@/app/backend/runtime/contracts';
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
} from '@/app/backend/runtime/services/orchestrator/status';
import type { ApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';

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

    async getStatus(
        profileId: string,
        orchestratorRunId: EntityId<'orch'>
    ): Promise<{ found: false } | { found: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] }> {
        return getOrchestratorStatus(profileId, orchestratorRunId);
    }

    async getLatestBySession(
        profileId: string,
        sessionId: EntityId<'sess'>
    ): Promise<{ found: false } | { found: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] }> {
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
              latest: { found: false } | { found: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] };
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
            executionStrategy: input.startInput.executionStrategy ?? 'delegate',
        });
    }
}

export const orchestratorExecutionService = new OrchestratorExecutionService();

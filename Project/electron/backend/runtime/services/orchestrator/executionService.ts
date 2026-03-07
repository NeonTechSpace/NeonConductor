import { err, type Result } from 'neverthrow';

import type { OrchestratorRunRecord, OrchestratorStepRecord, PlanItemRecord, PlanRecord } from '@/app/backend/persistence/types';
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
import { getLatestOrchestratorBySession, getOrchestratorStatus } from '@/app/backend/runtime/services/orchestrator/status';


export class OrchestratorExecutionService {
    private readonly activeRuns = new ActiveOrchestratorRunRegistry();

    async start(
        input: OrchestratorStartInput
    ): Promise<Result<{ started: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] }, OrchestratorExecutionError>> {
        const prepared = await prepareOrchestratorStart(input);
        if (prepared.isErr()) {
            logRejectedOrchestratorStart(input, prepared.error);
            return err(prepared.error);
        }
        const { plan, planItems, run, steps } = prepared.value;

        await appendAndLogOrchestratorStarted({
            profileId: input.profileId,
            sessionId: plan.sessionId,
            planId: plan.id,
            runId: run.id,
            stepCount: steps.length,
        });
        this.activeRuns.begin(run.id, {
            profileId: input.profileId,
            sessionId: plan.sessionId,
        });

        void this.executeSequentially({
            plan,
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
    ): Promise<{ aborted: false; reason: 'not_found' } | { aborted: true; runId: EntityId<'orch'> }> {
        return abortOrchestratorRun({
            profileId,
            orchestratorRunId,
            activeRuns: this.activeRuns,
        });
    }

    private async executeSequentially(input: {
        plan: PlanRecord;
        planItems: PlanItemRecord[];
        orchestratorRunId: EntityId<'orch'>;
        steps: OrchestratorStepRecord[];
        startInput: OrchestratorStartInput;
    }): Promise<void> {
        await executeOrchestratorSteps({
            ...input,
            activeRuns: this.activeRuns,
        });
    }
}

export const orchestratorExecutionService = new OrchestratorExecutionService();

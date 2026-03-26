import { orchestratorStore, planStore, threadStore } from '@/app/backend/persistence/stores';
import type {
    OrchestratorRunRecord,
    OrchestratorStepRecord,
    PlanItemRecord,
    PlanRecord,
} from '@/app/backend/persistence/types';
import type { OrchestratorStartInput } from '@/app/backend/runtime/contracts';
import {
    errOrchestrator,
    okOrchestrator,
    type OrchestratorExecutionError,
    validateOrchestratorStart,
} from '@/app/backend/runtime/services/orchestrator/errors';
import { appendOrchestratorStartedEvent } from '@/app/backend/runtime/services/orchestrator/events';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

export interface PreparedOrchestratorStart {
    plan: PlanRecord;
    planItems: PlanItemRecord[];
    run: OrchestratorRunRecord;
    steps: OrchestratorStepRecord[];
}

export async function prepareOrchestratorStart(
    input: OrchestratorStartInput
): Promise<Result<PreparedOrchestratorStart, OrchestratorExecutionError>> {
    const validation = validateOrchestratorStart(await planStore.getById(input.profileId, input.planId), input.planId);
    if (validation.isErr()) {
        return errOrchestrator(validation.error.code, validation.error.message);
    }

    const plan = validation.value;
    const sessionThread = await threadStore.getBySessionId(input.profileId, plan.sessionId);
    if (!sessionThread) {
        return errOrchestrator('session_not_found', `Session "${plan.sessionId}" was not found for orchestration.`);
    }
    if (sessionThread.thread.delegatedFromOrchestratorRunId) {
        return errOrchestrator(
            'delegation_not_allowed',
            'Delegated worker lanes cannot start orchestrator strategies.'
        );
    }
    if (sessionThread.thread.id !== sessionThread.thread.rootThreadId) {
        return errOrchestrator(
            'delegation_not_allowed',
            'Only the root orchestrator thread may start orchestrator strategies.'
        );
    }

    const planItems = await planStore.listItems(plan.id);
    const stepDescriptions =
        planItems.length > 0 ? planItems.map((item) => item.description) : [plan.summaryMarkdown || plan.sourcePrompt];
    const created = await orchestratorStore.createRun({
        profileId: input.profileId,
        sessionId: plan.sessionId,
        planId: plan.id,
        executionStrategy: input.executionStrategy ?? 'delegate',
        stepDescriptions,
    });

    return okOrchestrator({
        plan,
        planItems,
        run: created.run,
        steps: created.steps,
    });
}

export function logRejectedOrchestratorStart(input: OrchestratorStartInput, error: OrchestratorExecutionError): void {
    appLog.warn({
        tag: 'orchestrator',
        message: 'Rejected orchestrator.start request.',
        profileId: input.profileId,
        planId: input.planId,
        code: error.code,
        error: error.message,
    });
}

export async function appendAndLogOrchestratorStarted(input: {
    profileId: string;
    sessionId: PlanRecord['sessionId'];
    planId: PlanRecord['id'];
    runId: OrchestratorRunRecord['id'];
    stepCount: number;
}): Promise<void> {
    await appendOrchestratorStartedEvent({
        profileId: input.profileId,
        sessionId: input.sessionId,
        planId: input.planId,
        orchestratorRunId: input.runId,
        stepCount: input.stepCount,
    });

    appLog.info({
        tag: 'orchestrator',
        message: 'Started orchestrator run.',
        profileId: input.profileId,
        sessionId: input.sessionId,
        planId: input.planId,
        orchestratorRunId: input.runId,
        stepCount: input.stepCount,
    });
}

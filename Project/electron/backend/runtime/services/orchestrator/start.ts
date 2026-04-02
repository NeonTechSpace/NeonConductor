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
import type { ApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';
import { resolveApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

export interface PreparedOrchestratorStart {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    planItems: PlanItemRecord[];
    run: OrchestratorRunRecord;
    steps: OrchestratorStepRecord[];
}

export async function prepareOrchestratorStart(
    input: OrchestratorStartInput & {
        approvedArtifact?: ApprovedPlanExecutionArtifact;
    }
): Promise<Result<PreparedOrchestratorStart, OrchestratorExecutionError>> {
    const validation = validateOrchestratorStart(await planStore.getById(input.profileId, input.planId), input.planId);
    if (validation.isErr()) {
        return errOrchestrator(validation.error.code, validation.error.message);
    }

    const plan = validation.value;
    const approvedArtifact = input.approvedArtifact ?? (await resolveApprovedPlanExecutionArtifact(plan));
    if (!approvedArtifact) {
        return errOrchestrator(
            'approved_revision_unavailable',
            `Approved revision content could not be resolved for plan "${plan.id}".`
        );
    }

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
        approvedArtifact.items.length > 0
            ? approvedArtifact.items.map((item) => item.description)
            : [approvedArtifact.summaryMarkdown];
    const created = await orchestratorStore.createRun({
        profileId: input.profileId,
        sessionId: plan.sessionId,
        planId: plan.id,
        planRevisionId: approvedArtifact.approvedRevisionId,
        ...(input.planPhaseId ? { planPhaseId: input.planPhaseId } : {}),
        ...(input.planPhaseRevisionId ? { planPhaseRevisionId: input.planPhaseRevisionId } : {}),
        executionStrategy: input.executionStrategy ?? 'delegate',
        stepDescriptions,
    });

    return okOrchestrator({
        plan,
        approvedArtifact,
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
    revisionId: ApprovedPlanExecutionArtifact['approvedRevisionId'];
    revisionNumber: ApprovedPlanExecutionArtifact['approvedRevisionNumber'];
    runId: OrchestratorRunRecord['id'];
    stepCount: number;
}): Promise<void> {
    await appendOrchestratorStartedEvent({
        profileId: input.profileId,
        sessionId: input.sessionId,
        planId: input.planId,
        revisionId: input.revisionId,
        revisionNumber: input.revisionNumber,
        orchestratorRunId: input.runId,
        stepCount: input.stepCount,
    });

    appLog.info({
        tag: 'orchestrator',
        message: 'Started orchestrator run.',
        profileId: input.profileId,
        sessionId: input.sessionId,
        planId: input.planId,
        revisionId: input.revisionId,
        revisionNumber: input.revisionNumber,
        orchestratorRunId: input.runId,
        stepCount: input.stepCount,
    });
}

import type { EntityId } from '@/app/backend/runtime/contracts';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

export async function appendOrchestratorStartedEvent(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    orchestratorRunId: EntityId<'orch'>;
    stepCount: number;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'orchestrator',
            domain: 'orchestrator',
            entityId: input.orchestratorRunId,
            eventType: 'orchestrator.started',
            payload: {
                profileId: input.profileId,
                sessionId: input.sessionId,
                planId: input.planId,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                orchestratorRunId: input.orchestratorRunId,
                stepCount: input.stepCount,
            },
        })
    );
}

export async function appendOrchestratorAbortedEvent(input: {
    profileId: string;
    orchestratorRunId: EntityId<'orch'>;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'orchestrator',
            domain: 'orchestrator',
            entityId: input.orchestratorRunId,
            eventType: 'orchestrator.aborted',
            payload: {
                profileId: input.profileId,
                orchestratorRunId: input.orchestratorRunId,
            },
        })
    );
}

export async function appendOrchestratorStepStartedEvent(input: {
    orchestratorRunId: EntityId<'orch'>;
    stepId: EntityId<'step'>;
    sequence: number;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'orchestrator',
            domain: 'orchestrator',
            entityId: input.orchestratorRunId,
            eventType: 'orchestrator.step.started',
            payload: {
                orchestratorRunId: input.orchestratorRunId,
                stepId: input.stepId,
                sequence: input.sequence,
            },
        })
    );
}

export async function appendOrchestratorStepCompletedEvent(input: {
    orchestratorRunId: EntityId<'orch'>;
    stepId: EntityId<'step'>;
    sequence: number;
    runId: EntityId<'run'>;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'orchestrator',
            domain: 'orchestrator',
            entityId: input.orchestratorRunId,
            eventType: 'orchestrator.step.completed',
            payload: {
                orchestratorRunId: input.orchestratorRunId,
                stepId: input.stepId,
                sequence: input.sequence,
                runId: input.runId,
            },
        })
    );
}

export async function appendOrchestratorCompletedEvent(input: {
    orchestratorRunId: EntityId<'orch'>;
    planId: EntityId<'plan'>;
    stepCount: number;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'orchestrator',
            domain: 'orchestrator',
            entityId: input.orchestratorRunId,
            eventType: 'orchestrator.completed',
            payload: {
                orchestratorRunId: input.orchestratorRunId,
                planId: input.planId,
                stepCount: input.stepCount,
            },
        })
    );
}

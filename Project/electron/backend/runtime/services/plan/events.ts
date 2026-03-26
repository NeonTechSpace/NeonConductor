import type { EntityId, TopLevelTab } from '@/app/backend/runtime/contracts';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

export async function appendPlanStartedEvent(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    planId: EntityId<'plan'>;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.started',
            payload: {
                profileId: input.profileId,
                sessionId: input.sessionId,
                topLevelTab: input.topLevelTab,
                planId: input.planId,
            },
        })
    );
}

export async function appendPlanQuestionRequestedEvents(input: {
    planId: EntityId<'plan'>;
    questions: Array<{
        id: string;
        question: string;
    }>;
}): Promise<void> {
    for (const question of input.questions) {
        await runtimeEventLogService.append(
            runtimeStatusEvent({
                entityType: 'plan',
                domain: 'plan',
                entityId: input.planId,
                eventType: 'plan.question.requested',
                payload: {
                    planId: input.planId,
                    questionId: question.id,
                    question: question.question,
                },
            })
        );
    }
}

export async function appendPlanQuestionAnsweredEvent(input: {
    planId: EntityId<'plan'>;
    questionId: string;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.question.answered',
            payload: {
                planId: input.planId,
                questionId: input.questionId,
            },
        })
    );
}

export async function appendPlanApprovedEvent(input: { profileId: string; planId: EntityId<'plan'> }): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.approved',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
            },
        })
    );
}

export async function appendPlanImplementationStartedEvent(
    input:
        | {
              profileId: string;
              planId: EntityId<'plan'>;
              mode: 'agent.code';
              runId: EntityId<'run'>;
          }
        | {
              profileId: string;
              planId: EntityId<'plan'>;
              mode: 'orchestrator.orchestrate';
              orchestratorRunId: EntityId<'orch'>;
          }
): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.implementation.started',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                mode: input.mode,
                ...('runId' in input ? { runId: input.runId } : { orchestratorRunId: input.orchestratorRunId }),
            },
        })
    );
}

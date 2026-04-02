import type { EntityId, TopLevelTab } from '@/app/backend/runtime/contracts';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

export async function appendPlanStartedEvent(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
    planningDepth?: 'simple' | 'advanced';
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
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
                ...(input.planningDepth ? { planningDepth: input.planningDepth } : {}),
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

export async function appendPlanRevisedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.revised',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanAdvancedPlanningEnteredEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    priorRevisionId: EntityId<'prev'>;
    priorRevisionNumber: number;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
    previousPlanningDepth: 'simple' | 'advanced';
    planningDepth: 'advanced';
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.advanced_planning.entered',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                priorRevisionId: input.priorRevisionId,
                priorRevisionNumber: input.priorRevisionNumber,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                previousPlanningDepth: input.previousPlanningDepth,
                planningDepth: input.planningDepth,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanCancelledEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    previousStatus: 'awaiting_answers' | 'draft' | 'approved' | 'failed';
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
    approvedRevisionId?: EntityId<'prev'> | undefined;
    approvedRevisionNumber?: number | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.cancelled',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                previousStatus: input.previousStatus,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
                ...(input.approvedRevisionId ? { approvedRevisionId: input.approvedRevisionId } : {}),
                ...(input.approvedRevisionNumber !== undefined
                    ? { approvedRevisionNumber: input.approvedRevisionNumber }
                    : {}),
            },
        })
    );
}

export async function appendPlanDraftGenerationStartedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    priorRevisionId: EntityId<'prev'>;
    priorRevisionNumber: number;
    generationMode: 'model' | 'deterministic_fallback';
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.draft_generation.started',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                priorRevisionId: input.priorRevisionId,
                priorRevisionNumber: input.priorRevisionNumber,
                generationMode: input.generationMode,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanDraftGeneratedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    priorRevisionId: EntityId<'prev'>;
    priorRevisionNumber: number;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    generationMode: 'model' | 'deterministic_fallback';
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.draft_generated',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                priorRevisionId: input.priorRevisionId,
                priorRevisionNumber: input.priorRevisionNumber,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                generationMode: input.generationMode,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanApprovedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.approved',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanPhaseExpandedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    phaseId: EntityId<'pph'>;
    phaseRevisionId: EntityId<'pprv'>;
    phaseOutlineId: string;
    phaseSequence: number;
    phaseTitle: string;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.phase.expanded',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                phaseId: input.phaseId,
                phaseRevisionId: input.phaseRevisionId,
                phaseOutlineId: input.phaseOutlineId,
                phaseSequence: input.phaseSequence,
                phaseTitle: input.phaseTitle,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanPhaseRevisedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    phaseId: EntityId<'pph'>;
    phaseRevisionId: EntityId<'pprv'>;
    phaseOutlineId: string;
    phaseSequence: number;
    phaseTitle: string;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.phase.revised',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                phaseId: input.phaseId,
                phaseRevisionId: input.phaseRevisionId,
                phaseOutlineId: input.phaseOutlineId,
                phaseSequence: input.phaseSequence,
                phaseTitle: input.phaseTitle,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanPhaseApprovedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    phaseId: EntityId<'pph'>;
    phaseRevisionId: EntityId<'pprv'>;
    phaseOutlineId: string;
    phaseSequence: number;
    phaseTitle: string;
    revisionNumber: number;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.phase.approved',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                phaseId: input.phaseId,
                phaseRevisionId: input.phaseRevisionId,
                phaseOutlineId: input.phaseOutlineId,
                phaseSequence: input.phaseSequence,
                phaseTitle: input.phaseTitle,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanPhaseImplementationStartedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    phaseId: EntityId<'pph'>;
    phaseRevisionId: EntityId<'pprv'>;
    phaseOutlineId: string;
    phaseSequence: number;
    phaseTitle: string;
    revisionNumber: number;
    mode: 'agent.code' | 'orchestrator.orchestrate';
    runId?: EntityId<'run'>;
    orchestratorRunId?: EntityId<'orch'>;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.phase.implementation.started',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                phaseId: input.phaseId,
                phaseRevisionId: input.phaseRevisionId,
                phaseOutlineId: input.phaseOutlineId,
                phaseSequence: input.phaseSequence,
                phaseTitle: input.phaseTitle,
                revisionNumber: input.revisionNumber,
                mode: input.mode,
                ...(input.runId ? { runId: input.runId } : {}),
                ...(input.orchestratorRunId ? { orchestratorRunId: input.orchestratorRunId } : {}),
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanPhaseImplementationCompletedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    phaseId: EntityId<'pph'>;
    phaseRevisionId: EntityId<'pprv'>;
    phaseOutlineId: string;
    phaseSequence: number;
    phaseTitle: string;
    revisionNumber: number;
    mode?: 'agent.code' | 'orchestrator.orchestrate';
    runId?: EntityId<'run'>;
    orchestratorRunId?: EntityId<'orch'>;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.phase.implementation.completed',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                phaseId: input.phaseId,
                phaseRevisionId: input.phaseRevisionId,
                phaseOutlineId: input.phaseOutlineId,
                phaseSequence: input.phaseSequence,
                phaseTitle: input.phaseTitle,
                revisionNumber: input.revisionNumber,
                ...(input.mode ? { mode: input.mode } : {}),
                ...(input.runId ? { runId: input.runId } : {}),
                ...(input.orchestratorRunId ? { orchestratorRunId: input.orchestratorRunId } : {}),
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanPhaseImplementationFailedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    phaseId: EntityId<'pph'>;
    phaseRevisionId: EntityId<'pprv'>;
    phaseOutlineId: string;
    phaseSequence: number;
    phaseTitle: string;
    revisionNumber: number;
    mode?: 'agent.code' | 'orchestrator.orchestrate';
    errorMessage: string;
    runId?: EntityId<'run'>;
    orchestratorRunId?: EntityId<'orch'>;
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.phase.implementation.failed',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                phaseId: input.phaseId,
                phaseRevisionId: input.phaseRevisionId,
                phaseOutlineId: input.phaseOutlineId,
                phaseSequence: input.phaseSequence,
                phaseTitle: input.phaseTitle,
                revisionNumber: input.revisionNumber,
                ...(input.mode ? { mode: input.mode } : {}),
                errorMessage: input.errorMessage,
                ...(input.runId ? { runId: input.runId } : {}),
                ...(input.orchestratorRunId ? { orchestratorRunId: input.orchestratorRunId } : {}),
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanPhaseCancelledEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    phaseId: EntityId<'pph'>;
    phaseRevisionId: EntityId<'pprv'>;
    phaseOutlineId: string;
    phaseSequence: number;
    phaseTitle: string;
    revisionNumber: number;
    previousStatus?: 'draft' | 'approved' | 'implementing';
    variantId?: EntityId<'pvar'> | undefined;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.phase.cancelled',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                phaseId: input.phaseId,
                phaseRevisionId: input.phaseRevisionId,
                phaseOutlineId: input.phaseOutlineId,
                phaseSequence: input.phaseSequence,
                phaseTitle: input.phaseTitle,
                revisionNumber: input.revisionNumber,
                ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
                ...(input.variantId ? { variantId: input.variantId } : {}),
            },
        })
    );
}

export async function appendPlanImplementationStartedEvent(
    input:
        | {
              profileId: string;
              planId: EntityId<'plan'>;
              revisionId: EntityId<'prev'>;
              revisionNumber: number;
              variantId?: EntityId<'pvar'> | undefined;
              mode: 'agent.code';
              runId: EntityId<'run'>;
          }
        | {
              profileId: string;
              planId: EntityId<'plan'>;
              revisionId: EntityId<'prev'>;
              revisionNumber: number;
              variantId?: EntityId<'pvar'> | undefined;
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
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
                ...(input.variantId ? { variantId: input.variantId } : {}),
                mode: input.mode,
                ...('runId' in input ? { runId: input.runId } : { orchestratorRunId: input.orchestratorRunId }),
            },
        })
    );
}

export async function appendPlanVariantCreatedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    sourceRevisionId: EntityId<'prev'>;
    sourceRevisionNumber: number;
    variantId: EntityId<'pvar'>;
    variantName: string;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.variant_created',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                sourceRevisionId: input.sourceRevisionId,
                sourceRevisionNumber: input.sourceRevisionNumber,
                variantId: input.variantId,
                variantName: input.variantName,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
            },
        })
    );
}

export async function appendPlanVariantActivatedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    variantId: EntityId<'pvar'>;
    variantName: string;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.variant_activated',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                variantId: input.variantId,
                variantName: input.variantName,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
            },
        })
    );
}

export async function appendPlanResumedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    sourceRevisionId: EntityId<'prev'>;
    sourceRevisionNumber: number;
    variantId: EntityId<'pvar'>;
    variantName: string;
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.resumed',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                sourceRevisionId: input.sourceRevisionId,
                sourceRevisionNumber: input.sourceRevisionNumber,
                variantId: input.variantId,
                variantName: input.variantName,
                revisionId: input.revisionId,
                revisionNumber: input.revisionNumber,
            },
        })
    );
}

export async function appendPlanFollowUpRaisedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    followUpId: EntityId<'pfu'>;
    kind: 'missing_context' | 'missing_file';
    variantId: EntityId<'pvar'>;
    variantName: string;
    sourceRevisionId?: EntityId<'prev'> | undefined;
    promptMarkdown: string;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.follow_up_raised',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                followUpId: input.followUpId,
                kind: input.kind,
                variantId: input.variantId,
                variantName: input.variantName,
                ...(input.sourceRevisionId ? { sourceRevisionId: input.sourceRevisionId } : {}),
                promptMarkdown: input.promptMarkdown,
            },
        })
    );
}

export async function appendPlanFollowUpResolvedEvent(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    followUpId: EntityId<'pfu'>;
    status: 'resolved' | 'dismissed';
    kind: 'missing_context' | 'missing_file';
    variantId: EntityId<'pvar'>;
    variantName: string;
    responseMarkdown?: string;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'plan',
            domain: 'plan',
            entityId: input.planId,
            eventType: 'plan.follow_up_resolved',
            payload: {
                planId: input.planId,
                profileId: input.profileId,
                followUpId: input.followUpId,
                status: input.status,
                kind: input.kind,
                variantId: input.variantId,
                variantName: input.variantName,
                ...(input.responseMarkdown ? { responseMarkdown: input.responseMarkdown } : {}),
            },
        })
    );
}

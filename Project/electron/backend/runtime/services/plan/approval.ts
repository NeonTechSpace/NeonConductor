import { planStore } from '@/app/backend/persistence/stores';
import type { EntityId, PlanRecordView } from '@/app/backend/runtime/contracts';
import { errPlan, okPlan, type PlanServiceError } from '@/app/backend/runtime/services/plan/errors';
import { appendPlanApprovedEvent } from '@/app/backend/runtime/services/plan/events';
import { hasUnansweredRequiredQuestions } from '@/app/backend/runtime/services/plan/intake';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

export async function approvePlan(
    profileId: string,
    planId: EntityId<'plan'>,
    revisionId: EntityId<'prev'>
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const existing = await planStore.getById(profileId, planId);
    if (!existing) {
        return okPlan({ found: false });
    }

    const hasUnanswered = hasUnansweredRequiredQuestions({
        questions: existing.questions,
        answers: existing.answers,
    });
    if (hasUnanswered) {
        return errPlan('unanswered_questions', 'Cannot approve plan before answering all clarifying questions.');
    }
    if (existing.currentRevisionId !== revisionId) {
        return errPlan(
            'revision_conflict',
            `Cannot approve stale plan revision "${revisionId}". Approve the current revision instead.`
        );
    }

    const shouldResetImplementationState =
        existing.status === 'failed' || existing.status === 'implemented' || existing.status === 'cancelled';
    const approved = await planStore.approve(planId, revisionId, {
        resetImplementationState: shouldResetImplementationState,
    });
    if (!approved) {
        return errPlan('revision_conflict', 'Cannot approve a revision that does not belong to this plan.');
    }
    const items = shouldResetImplementationState
        ? await planStore.resetItemsForFreshImplementation(planId)
        : await planStore.listItems(planId);

    await appendPlanApprovedEvent({
        profileId,
        planId,
        revisionId,
        revisionNumber: approved.currentRevisionNumber,
    });

    appLog.info({
        tag: 'plan',
        message: 'Approved plan.',
        profileId,
        planId,
        revisionId,
    });

    return okPlan({
        found: true,
        plan: requirePlanView(approved, items, 'plan.approve'),
    });
}

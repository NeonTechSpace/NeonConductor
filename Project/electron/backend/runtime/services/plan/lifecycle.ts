import { planStore } from '@/app/backend/persistence/stores';
import type {
    PlanAnswerQuestionInput,
    PlanCancelInput,
    PlanRecordView,
    PlanReviseInput,
} from '@/app/backend/runtime/contracts';
import {
    appendPlanCancelledEvent,
    appendPlanQuestionAnsweredEvent,
    appendPlanRevisedEvent,
} from '@/app/backend/runtime/services/plan/events';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';

export async function answerPlanQuestion(
    input: PlanAnswerQuestionInput
): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
    const updated = await planStore.setAnswer(input.planId, input.questionId, input.answer);
    if (!updated || updated.profileId !== input.profileId) {
        return { found: false };
    }

    await appendPlanQuestionAnsweredEvent({
        planId: input.planId,
        questionId: input.questionId,
    });

    const items = await planStore.listItems(input.planId);
    return {
        found: true,
        plan: requirePlanView(updated, items, 'plan.answerQuestion'),
    };
}

export async function revisePlan(
    input: PlanReviseInput
): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
    const descriptions = input.items
        .map((item) => item.description.trim())
        .filter((description) => description.length > 0);
    const revised = await planStore.revise(input.planId, input.summaryMarkdown, descriptions);
    if (!revised || revised.profileId !== input.profileId) {
        return { found: false };
    }

    await appendPlanRevisedEvent({
        profileId: input.profileId,
        planId: input.planId,
        revisionId: revised.currentRevisionId,
        revisionNumber: revised.currentRevisionNumber,
    });

    const items = await planStore.listItems(input.planId);

    return {
        found: true,
        plan: requirePlanView(revised, items, 'plan.revise'),
    };
}

export async function cancelPlan(
    input: PlanCancelInput
): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
    const existing = await planStore.getById(input.profileId, input.planId);
    if (!existing) {
        return { found: false };
    }

    if (
        existing.status !== 'awaiting_answers' &&
        existing.status !== 'draft' &&
        existing.status !== 'approved' &&
        existing.status !== 'failed'
    ) {
        return { found: false };
    }

    const cancelled = await planStore.cancel(input.planId);
    if (!cancelled || cancelled.profileId !== input.profileId) {
        return { found: false };
    }

    await appendPlanCancelledEvent({
        profileId: input.profileId,
        planId: input.planId,
        previousStatus: existing.status,
        revisionId: cancelled.currentRevisionId,
        revisionNumber: cancelled.currentRevisionNumber,
        ...(cancelled.approvedRevisionId ? { approvedRevisionId: cancelled.approvedRevisionId } : {}),
        ...(cancelled.approvedRevisionNumber !== undefined
            ? { approvedRevisionNumber: cancelled.approvedRevisionNumber }
            : {}),
    });

    const items = await planStore.listItems(input.planId);
    return {
        found: true,
        plan: requirePlanView(cancelled, items, 'plan.cancel'),
    };
}

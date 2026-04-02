import { planStore } from '@/app/backend/persistence/stores';
import type {
    PlanAnswerQuestionInput,
    PlanCancelInput,
    PlanRecordView,
    PlanReviseInput,
} from '@/app/backend/runtime/contracts';
import { errPlan, okPlan, type PlanServiceError } from '@/app/backend/runtime/services/plan/errors';
import {
    appendPlanCancelledEvent,
    appendPlanQuestionAnsweredEvent,
    appendPlanRevisedEvent,
} from '@/app/backend/runtime/services/plan/events';
import { abortRunningResearchWorkers, ensureNoRunningResearchBatch } from '@/app/backend/runtime/services/plan/researchLifecycle';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';

import type { Result } from 'neverthrow';

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

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    return {
        found: true,
        plan: requirePlanView(projection, 'plan.answerQuestion'),
    };
}

export async function revisePlan(
    input: PlanReviseInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const existing = await planStore.getById(input.profileId, input.planId);
    if (!existing) {
        return okPlan({ found: false });
    }

    const researchValidation = await ensureNoRunningResearchBatch({
        plan: existing,
        actionLabel: 'revise the plan',
    });
    if (researchValidation.isErr()) {
        return errPlan(researchValidation.error.code, researchValidation.error.message);
    }

    const descriptions = input.items
        .map((item) => item.description.trim())
        .filter((description) => description.length > 0);
    const revised = await planStore.revise(input.planId, input.summaryMarkdown, descriptions, {
        ...(input.advancedSnapshot ? { advancedSnapshot: input.advancedSnapshot } : {}),
    });
    if (!revised || revised.profileId !== input.profileId) {
        return errPlan('revision_conflict', 'Unable to persist the requested plan revision.');
    }

    await appendPlanRevisedEvent({
        profileId: input.profileId,
        planId: input.planId,
        revisionId: revised.currentRevisionId,
        revisionNumber: revised.currentRevisionNumber,
        variantId: revised.currentVariantId,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.revise'),
    });
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

    const activeResearchBatch = await planStore.getActiveResearchBatchByRevision(existing.currentRevisionId);
    if (activeResearchBatch) {
        await abortRunningResearchWorkers({
            profileId: input.profileId,
            researchBatchId: activeResearchBatch.id,
        });
        const abortedResearchBatch = await planStore.abortResearchBatch(existing.id, activeResearchBatch.id);
        if (!abortedResearchBatch) {
            return { found: false };
        }
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
        variantId: cancelled.currentVariantId,
        ...(cancelled.approvedRevisionId ? { approvedRevisionId: cancelled.approvedRevisionId } : {}),
        ...(cancelled.approvedRevisionNumber !== undefined
            ? { approvedRevisionNumber: cancelled.approvedRevisionNumber }
            : {}),
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    return {
        found: true,
        plan: requirePlanView(projection, 'plan.cancel'),
    };
}

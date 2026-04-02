import { planStore } from '@/app/backend/persistence/stores';
import type {
    PlanActivateVariantInput,
    PlanCreateVariantInput,
    PlanRaiseFollowUpInput,
    PlanRecordView,
    PlanResolveFollowUpInput,
    PlanResumeFromRevisionInput,
} from '@/app/backend/runtime/contracts';
import {
    errPlan,
    okPlan,
    type PlanServiceError,
} from '@/app/backend/runtime/services/plan/errors';
import {
    appendPlanFollowUpRaisedEvent,
    appendPlanFollowUpResolvedEvent,
    appendPlanRevisedEvent,
    appendPlanResumedEvent,
    appendPlanVariantActivatedEvent,
    appendPlanVariantCreatedEvent,
} from '@/app/backend/runtime/services/plan/events';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

export async function createPlanVariant(
    input: PlanCreateVariantInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const existing = await planStore.getById(input.profileId, input.planId);
    if (!existing) {
        return okPlan({ found: false });
    }

    const sourceRevision = await planStore.getRevisionById(input.sourceRevisionId);
    if (!sourceRevision || sourceRevision.planId !== input.planId) {
        return errPlan('revision_conflict', 'Cannot branch from a revision that does not belong to this plan.');
    }

    const created = await planStore.createVariant(input.planId, input.sourceRevisionId);
    if (!created || created.profileId !== input.profileId) {
        return errPlan('revision_conflict', 'Unable to create a recovery variant for this plan.');
    }

    await appendPlanRevisedEvent({
        profileId: input.profileId,
        planId: input.planId,
        revisionId: created.currentRevisionId,
        revisionNumber: created.currentRevisionNumber,
        variantId: created.currentVariantId,
    });
    const createdVariant = await planStore.getVariantById(created.currentVariantId);
    await appendPlanVariantCreatedEvent({
        profileId: input.profileId,
        planId: input.planId,
        sourceRevisionId: sourceRevision.id,
        sourceRevisionNumber: sourceRevision.revisionNumber,
        variantId: created.currentVariantId,
        variantName: createdVariant?.name ?? 'variant',
        revisionId: created.currentRevisionId,
        revisionNumber: created.currentRevisionNumber,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the updated recovery variant state.');
    }

    appLog.info({
        tag: 'plan',
        message: 'Created plan recovery variant.',
        profileId: input.profileId,
        planId: input.planId,
        sourceRevisionId: sourceRevision.id,
        variantId: created.currentVariantId,
    });

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.createVariant'),
    });
}

export async function activatePlanVariant(
    input: PlanActivateVariantInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const existing = await planStore.getById(input.profileId, input.planId);
    if (!existing) {
        return okPlan({ found: false });
    }

    const variant = await planStore.getVariantById(input.variantId);
    if (!variant || variant.planId !== input.planId) {
        return errPlan('revision_conflict', 'Cannot activate a variant that does not belong to this plan.');
    }

    const activated = await planStore.activateVariant(input.planId, input.variantId);
    if (!activated || activated.profileId !== input.profileId) {
        return errPlan('revision_conflict', 'Unable to activate the selected plan variant.');
    }

    await appendPlanVariantActivatedEvent({
        profileId: input.profileId,
        planId: input.planId,
        variantId: variant.id,
        variantName: variant.name,
        revisionId: activated.currentRevisionId,
        revisionNumber: activated.currentRevisionNumber,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the updated activated variant state.');
    }
    appLog.info({
        tag: 'plan',
        message: 'Activated plan variant.',
        profileId: input.profileId,
        planId: input.planId,
        variantId: variant.id,
    });

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.activateVariant'),
    });
}

export async function resumePlanFromRevision(
    input: PlanResumeFromRevisionInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const existing = await planStore.getById(input.profileId, input.planId);
    if (!existing) {
        return okPlan({ found: false });
    }

    const sourceRevision = await planStore.getRevisionById(input.sourceRevisionId);
    if (!sourceRevision || sourceRevision.planId !== input.planId) {
        return errPlan('revision_conflict', 'Cannot resume from a revision that does not belong to this plan.');
    }

    if (input.variantId) {
        const variant = await planStore.getVariantById(input.variantId);
        if (!variant || variant.planId !== input.planId) {
            return errPlan('revision_conflict', 'Cannot resume into a variant that does not belong to this plan.');
        }
    }

    const resumed = await planStore.resumeFromRevision(input.planId, input.sourceRevisionId, input.variantId);
    if (!resumed || resumed.profileId !== input.profileId) {
        return errPlan('revision_conflict', 'Unable to resume the selected historical revision.');
    }
    const resumedVariant = await planStore.getVariantById(resumed.currentVariantId);
    await appendPlanRevisedEvent({
        profileId: input.profileId,
        planId: input.planId,
        revisionId: resumed.currentRevisionId,
        revisionNumber: resumed.currentRevisionNumber,
        variantId: resumed.currentVariantId,
    });
    await appendPlanResumedEvent({
        profileId: input.profileId,
        planId: input.planId,
        sourceRevisionId: sourceRevision.id,
        sourceRevisionNumber: sourceRevision.revisionNumber,
        variantId: resumed.currentVariantId,
        variantName: resumedVariant?.name ?? 'variant',
        revisionId: resumed.currentRevisionId,
        revisionNumber: resumed.currentRevisionNumber,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the updated resumed variant state.');
    }

    appLog.info({
        tag: 'plan',
        message: 'Resumed plan from historical revision.',
        profileId: input.profileId,
        planId: input.planId,
        sourceRevisionId: sourceRevision.id,
        revisionId: resumed.currentRevisionId,
    });

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.resumeFromRevision'),
    });
}

export async function raisePlanFollowUp(
    input: PlanRaiseFollowUpInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const existing = await planStore.getById(input.profileId, input.planId);
    if (!existing) {
        return okPlan({ found: false });
    }

    const updated = await planStore.raiseFollowUp({
        planId: input.planId,
        kind: input.kind,
        promptMarkdown: input.promptMarkdown,
        ...(input.sourceRevisionId ? { sourceRevisionId: input.sourceRevisionId } : {}),
    });
    if (!updated || updated.profileId !== input.profileId) {
        return errPlan('revision_conflict', 'Unable to create the requested follow-up item.');
    }

    const followUp = (await planStore.listFollowUps(input.planId)).at(-1);
    if (followUp) {
        const followUpVariant = await planStore.getVariantById(followUp.variantId);
        await appendPlanFollowUpRaisedEvent({
            profileId: input.profileId,
            planId: input.planId,
            followUpId: followUp.id,
            kind: followUp.kind,
            variantId: followUp.variantId,
            variantName: followUpVariant?.name ?? 'variant',
            sourceRevisionId: followUp.sourceRevisionId,
            promptMarkdown: followUp.promptMarkdown,
        });
    }

    appLog.info({
        tag: 'plan',
        message: 'Raised plan follow-up.',
        profileId: input.profileId,
        planId: input.planId,
        kind: input.kind,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the updated follow-up state.');
    }
    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.raiseFollowUp'),
    });
}

export async function resolvePlanFollowUp(
    input: PlanResolveFollowUpInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const existing = await planStore.getById(input.profileId, input.planId);
    if (!existing) {
        return okPlan({ found: false });
    }

    const followUp = await planStore.getFollowUpById(input.followUpId);
    if (!followUp || followUp.planId !== input.planId) {
        return errPlan('revision_conflict', 'Cannot resolve a follow-up item that does not belong to this plan.');
    }

    const updated = await planStore.resolveFollowUp({
        planId: input.planId,
        followUpId: input.followUpId,
        status: input.status,
        ...(input.responseMarkdown ? { responseMarkdown: input.responseMarkdown } : {}),
    });
    if (!updated || updated.profileId !== input.profileId) {
        return errPlan('revision_conflict', 'Unable to update the requested follow-up item.');
    }

    const variant = await planStore.getVariantById(followUp.variantId);
    await appendPlanFollowUpResolvedEvent({
        profileId: input.profileId,
        planId: input.planId,
        followUpId: followUp.id,
        status: input.status,
        kind: followUp.kind,
        variantId: followUp.variantId,
        variantName: variant?.name ?? 'variant',
        ...(input.responseMarkdown ? { responseMarkdown: input.responseMarkdown } : {}),
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the updated follow-up state.');
    }

    appLog.info({
        tag: 'plan',
        message: 'Resolved plan follow-up.',
        profileId: input.profileId,
        planId: input.planId,
        followUpId: input.followUpId,
        status: input.status,
    });

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.resolveFollowUp'),
    });
}

import type {
    ModeExecutionPlanArtifactState,
    ModeExecutionPlanFollowUpView,
    ModeExecutionPlanHistoryEntryView,
    ModeExecutionPlanRecoveryBannerView,
    ModeExecutionPlanResearchArtifactState,
    ModeExecutionPlanStatusTone,
    ModeExecutionPlanTimelineActionView,
    ModeExecutionPlanVariantView,
    ModeExecutionPlanView,
} from '@/web/components/conversation/panels/modeExecutionPanelState';

import type {
    EntityId,
    PlanFollowUpView,
    PlanHistoryEntry,
    PlanHistoryEntryAction,
    PlanRecoveryBanner,
    PlanRecoveryBannerAction,
    PlanVariantView,
} from '@/shared/contracts';

export function hasUnansweredRequiredPlanQuestions(plan: ModeExecutionPlanView): boolean {
    return plan.questions.some((question) => question.required && (question.answer?.trim().length ?? 0) === 0);
}

export function canGenerateDraft(plan: ModeExecutionPlanView): boolean {
    if (hasUnansweredRequiredPlanQuestions(plan)) {
        return false;
    }

    return plan.status === 'awaiting_answers' || plan.status === 'draft' || plan.status === 'failed';
}

function readPlanStatusLabel(status: ModeExecutionPlanView['status']): string {
    switch (status) {
        case 'awaiting_answers':
            return 'Waiting for answers';
        case 'draft':
            return 'Draft ready for review';
        case 'approved':
            return 'Ready to implement';
        case 'implementing':
            return 'Implementation in progress';
        case 'implemented':
            return 'Implemented';
        case 'failed':
            return 'Implementation failed';
        case 'cancelled':
            return 'Cancelled';
    }
}

function readPlanStatusDescription(plan: ModeExecutionPlanView): string {
    switch (plan.status) {
        case 'awaiting_answers':
            return 'Finish the required intake answers before generating a stronger draft.';
        case 'draft':
            return 'The current revision is editable, approvable, and ready for another refinement pass.';
        case 'approved':
            return 'Execution should use the approved revision, not the editable draft snapshot.';
        case 'implementing':
            return 'Implementation is actively running from the approved revision.';
        case 'implemented':
            return 'The approved plan has already completed execution.';
        case 'failed':
            return 'The last implementation attempt failed. Revise the plan or approve a replacement revision.';
        case 'cancelled':
            return 'This plan was cancelled. Its revision history remains available for review.';
    }
}

function readStatusTone(status: ModeExecutionPlanView['status']): ModeExecutionPlanStatusTone {
    switch (status) {
        case 'approved':
        case 'implemented':
            return 'success';
        case 'implementing':
            return 'info';
        case 'awaiting_answers':
            return 'warning';
        case 'failed':
            return 'destructive';
        case 'draft':
        case 'cancelled':
            return 'neutral';
    }
}

function readRevisionLabel(revisionNumber: number, revisionId: string): string {
    return `Revision ${String(revisionNumber)} (${revisionId})`;
}

function readVariantLabel(
    variant: ModeExecutionPlanVariantView | undefined,
    fallbackId: string | undefined
): string | undefined {
    if (variant) {
        return variant.name.trim().length > 0 ? variant.name : (fallbackId ?? variant.revisionLabel);
    }

    return fallbackId;
}

function mapHistoryAction(
    action: PlanHistoryEntryAction | PlanRecoveryBannerAction
): ModeExecutionPlanTimelineActionView {
    switch (action.kind) {
        case 'switch_to_approved_variant':
            return {
                label: action.label,
                kind: 'switch_to_variant',
                ...(action.variantId ? { variantId: action.variantId } : {}),
            };
        case 'resume_editing':
            return {
                label: action.label,
                kind: 'resume_editing',
            };
        case 'resolve_follow_up':
            return {
                label: action.label,
                kind: 'resolve_follow_up',
                ...(action.followUpId ? { followUpId: action.followUpId } : {}),
            };
        default:
            return {
                label: action.label,
                kind: action.kind,
                ...(action.revisionId ? { revisionId: action.revisionId } : {}),
                ...(action.variantId ? { variantId: action.variantId } : {}),
                ...(action.followUpId ? { followUpId: action.followUpId } : {}),
            };
    }
}

function mapVariantView(
    variant: PlanVariantView,
    input: { currentVariantId: EntityId<'pvar'>; approvedVariantId?: EntityId<'pvar'> }
): ModeExecutionPlanVariantView {
    return {
        id: variant.id,
        name: variant.name,
        revisionId: variant.currentRevisionId,
        revisionNumber: variant.currentRevisionNumber,
        revisionLabel: readRevisionLabel(variant.currentRevisionNumber, variant.currentRevisionId),
        isCurrent: variant.id === input.currentVariantId,
        isApproved: variant.id === input.approvedVariantId,
        createdAt: variant.createdAt,
        ...(variant.archivedAt ? { archivedAt: variant.archivedAt } : {}),
    };
}

function mapFollowUpView(
    followUp: PlanFollowUpView,
    revisionLabelById: Map<EntityId<'prev'>, string>
): ModeExecutionPlanFollowUpView {
    return {
        id: followUp.id,
        kind: followUp.kind,
        status: followUp.status,
        promptMarkdown: followUp.promptMarkdown,
        ...(followUp.responseMarkdown ? { responseMarkdown: followUp.responseMarkdown } : {}),
        ...(followUp.sourceRevisionId
            ? {
                  sourceRevisionLabel:
                      revisionLabelById.get(followUp.sourceRevisionId) ?? `Revision ${followUp.sourceRevisionId}`,
              }
            : {}),
        createdAt: followUp.createdAt,
        ...(followUp.resolvedAt ? { resolvedAt: followUp.resolvedAt } : {}),
        ...(followUp.dismissedAt ? { dismissedAt: followUp.dismissedAt } : {}),
    };
}

function mapHistoryEntryView(
    entry: PlanHistoryEntry,
    input: {
        revisionLabelById: Map<EntityId<'prev'>, string>;
        variantNameById: Map<EntityId<'pvar'>, string>;
        followUpById: Map<EntityId<'pfu'>, ModeExecutionPlanFollowUpView>;
    }
): ModeExecutionPlanHistoryEntryView {
    const followUpStatus = entry.followUpId ? input.followUpById.get(entry.followUpId)?.status : undefined;
    const kind: ModeExecutionPlanHistoryEntryView['kind'] =
        entry.kind === 'revision_created' || entry.kind === 'plan_started' || entry.kind === 'plan_resumed'
            ? 'revision'
            : entry.kind === 'revision_approved'
              ? 'approval'
              : entry.kind === 'implementation_started' ||
                  entry.kind === 'implementation_completed' ||
                  entry.kind === 'implementation_failed'
                ? 'implementation'
                : entry.kind === 'plan_cancelled'
                  ? 'cancellation'
                  : entry.kind === 'follow_up_raised'
                    ? 'follow_up_raised'
                    : entry.kind === 'follow_up_resolved'
                      ? followUpStatus === 'dismissed'
                          ? 'follow_up_dismissed'
                          : 'follow_up_resolved'
                      : entry.kind === 'phase_verification_recorded' || entry.kind === 'phase_replan_started'
                        ? 'phase_revision_created'
                        : entry.kind;
    const revisionLabel =
        entry.revisionId && entry.revisionNumber !== undefined
            ? readRevisionLabel(entry.revisionNumber, entry.revisionId)
            : entry.revisionId
              ? (input.revisionLabelById.get(entry.revisionId) ?? `Revision ${entry.revisionId}`)
              : undefined;
    const variantLabel =
        entry.variantName ?? (entry.variantId ? input.variantNameById.get(entry.variantId) : undefined);
    const followUp = entry.followUpId ? input.followUpById.get(entry.followUpId) : undefined;

    return {
        id: entry.id,
        kind,
        title: entry.title,
        description: entry.detail ?? entry.title,
        timestamp: entry.createdAt,
        ...(revisionLabel ? { revisionLabel } : {}),
        ...(variantLabel ? { variantLabel } : {}),
        ...(followUp ? { followUpLabel: `${followUp.kind.replace('_', ' ')} · ${followUp.status}` } : {}),
        ...(entry.actions ? { actions: entry.actions.map(mapHistoryAction) } : {}),
    };
}

function mapRecoveryBanner(banner: PlanRecoveryBanner | undefined): ModeExecutionPlanRecoveryBannerView | undefined {
    if (!banner) {
        return undefined;
    }

    return {
        title: banner.title,
        message: banner.message,
        actions: banner.actions.map(mapHistoryAction),
    };
}

function sortHistoryEntriesNewestFirst(
    entries: ModeExecutionPlanHistoryEntryView[]
): ModeExecutionPlanHistoryEntryView[] {
    return [...entries].sort((left, right) => {
        const leftTimestamp = left.timestamp ? Date.parse(left.timestamp) : Number.NEGATIVE_INFINITY;
        const rightTimestamp = right.timestamp ? Date.parse(right.timestamp) : Number.NEGATIVE_INFINITY;
        if (Number.isNaN(leftTimestamp) || Number.isNaN(rightTimestamp) || leftTimestamp === rightTimestamp) {
            return 0;
        }

        return rightTimestamp - leftTimestamp;
    });
}

function buildFallbackHistoryEntries(
    plan: ModeExecutionPlanView,
    state: {
        currentRevisionLabel: string;
        approvedRevisionLabel: string | undefined;
        currentVariantLabel: string;
        approvedVariantLabel: string | undefined;
        hasOpenFollowUps: boolean;
        followUps: ModeExecutionPlanFollowUpView[];
    }
): ModeExecutionPlanHistoryEntryView[] {
    const entries: ModeExecutionPlanHistoryEntryView[] = [];

    if (state.approvedRevisionLabel && plan.approvedRevisionId) {
        const approvalEntry: ModeExecutionPlanHistoryEntryView = {
            id: `approval-${plan.approvedRevisionId}`,
            kind: 'approval',
            title: 'Approved revision',
            description: `The plan was approved on ${state.approvedRevisionLabel}.`,
            revisionLabel: state.approvedRevisionLabel,
            ...(state.approvedVariantLabel ? { variantLabel: state.approvedVariantLabel } : {}),
        };
        entries.push(approvalEntry);
    }

    entries.push({
        id: `revision-${plan.currentRevisionId}`,
        kind: 'revision',
        title: 'Current revision',
        description: `The active draft is ${state.currentRevisionLabel}.`,
        revisionLabel: state.currentRevisionLabel,
        variantLabel: state.currentVariantLabel,
        actions: [
            {
                label: 'Resume From Here',
                kind: 'resume_from_here',
                revisionId: plan.currentRevisionId,
            },
            {
                label: 'Branch From Here',
                kind: 'branch_from_here',
                revisionId: plan.currentRevisionId,
            },
        ],
    });

    if (plan.status === 'cancelled') {
        entries.push({
            id: `cancellation-${plan.id}`,
            kind: 'cancellation',
            title: 'Plan cancelled',
            description: 'The plan was cancelled, but its revision history remains available for recovery.',
        });
    } else if (plan.status === 'failed') {
        entries.push({
            id: `implementation-${plan.id}`,
            kind: 'implementation',
            title: 'Implementation failed',
            description: 'The latest implementation attempt failed and the plan remains recoverable.',
        });
    } else if (plan.status === 'implemented') {
        entries.push({
            id: `implementation-${plan.id}`,
            kind: 'implementation',
            title: 'Implementation completed',
            description: 'The approved plan completed execution.',
        });
    }

    if (state.hasOpenFollowUps) {
        for (const followUp of state.followUps) {
            if (followUp.status !== 'open') {
                continue;
            }

            entries.push({
                id: `follow-up-${followUp.id}`,
                kind: 'follow_up_raised',
                title: 'Open follow-up',
                description: followUp.promptMarkdown,
                followUpLabel: `${followUp.kind.replace('_', ' ')} · ${followUp.status}`,
                actions: [
                    {
                        label: 'View Follow-Up',
                        kind: 'view_follow_up',
                        followUpId: followUp.id,
                    },
                ],
            });
        }
    }

    return entries;
}

function deriveRecoveryBanner(input: {
    plan: ModeExecutionPlanView;
    currentRevisionLabel: string;
    currentVariantLabel: string;
    approvedVariantLabel: string | undefined;
    approvedVariantId: EntityId<'pvar'> | undefined;
    approvedRevisionLabel: string | undefined;
    hasOpenFollowUps: boolean;
    openFollowUpCount: number;
}): ModeExecutionPlanRecoveryBannerView | undefined {
    const actions: ModeExecutionPlanTimelineActionView[] = [];

    if (input.plan.status === 'failed' || input.plan.status === 'cancelled') {
        actions.push({
            label: 'Resume Editing',
            kind: 'resume_editing',
        });
    }

    if (input.hasOpenFollowUps) {
        const openFollowUpId = input.plan.followUps.find((followUp) => followUp.status === 'open')?.id;
        actions.push({
            label: 'Resolve Follow-Up',
            kind: 'resolve_follow_up',
            ...(openFollowUpId ? { followUpId: openFollowUpId } : {}),
        });
    }

    if (input.approvedVariantId && input.approvedVariantId !== input.plan.currentVariantId) {
        actions.push({
            label: 'Switch To Approved Variant',
            kind: 'switch_to_variant',
            variantId: input.approvedVariantId,
        });
    }

    if (actions.length === 0) {
        return undefined;
    }

    if (input.hasOpenFollowUps) {
        return {
            title: 'Recovery required',
            message: `There ${input.openFollowUpCount === 1 ? 'is 1 open follow-up' : `are ${String(input.openFollowUpCount)} open follow-ups`} that should be resolved before approving this plan.`,
            actions,
        };
    }

    if (input.plan.status === 'failed') {
        return {
            title: 'Recovery required',
            message: `The latest implementation failed on ${input.currentRevisionLabel}. Review the history and resume from a safe revision or branch a new variant.`,
            actions,
        };
    }

    if (input.plan.status === 'cancelled') {
        return {
            title: 'Plan cancelled',
            message:
                'This plan was cancelled. You can resume from history or branch a new variant without losing prior revisions.',
            actions,
        };
    }

    if (input.approvedVariantLabel && input.approvedVariantId !== input.plan.currentVariantId) {
        return {
            title: 'Approval review needed',
            message: `The current draft is on ${input.currentVariantLabel}, while the last approved variant is ${input.approvedVariantLabel}.`,
            actions,
        };
    }

    return undefined;
}

export function resolveModeExecutionPlanArtifactState(input: {
    activePlan: ModeExecutionPlanView | undefined;
}): ModeExecutionPlanArtifactState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    const plan = input.activePlan;
    const planVariants = Array.isArray(plan.variants) ? plan.variants : [];
    const planFollowUps = Array.isArray(plan.followUps) ? plan.followUps : [];
    const planHistory = Array.isArray(plan.history) ? plan.history : [];
    const planResearchBatches = Array.isArray(plan.researchBatches) ? plan.researchBatches : [];
    const currentRevisionResearchBatches = planResearchBatches.filter(
        (batch) => batch.planRevisionId === plan.currentRevisionId
    );
    const hasRunningResearchBatch = currentRevisionResearchBatches.some((batch) => batch.status === 'running');
    const revisionLabelById = new Map<EntityId<'prev'>, string>();
    revisionLabelById.set(
        plan.currentRevisionId,
        readRevisionLabel(plan.currentRevisionNumber, plan.currentRevisionId)
    );
    if (plan.approvedRevisionId && plan.approvedRevisionNumber !== undefined) {
        revisionLabelById.set(
            plan.approvedRevisionId,
            readRevisionLabel(plan.approvedRevisionNumber, plan.approvedRevisionId)
        );
    }
    for (const variant of planVariants) {
        revisionLabelById.set(
            variant.currentRevisionId,
            readRevisionLabel(variant.currentRevisionNumber, variant.currentRevisionId)
        );
    }

    const variants = planVariants.map((variant) =>
        mapVariantView(variant, {
            currentVariantId: plan.currentVariantId,
            ...(plan.approvedVariantId ? { approvedVariantId: plan.approvedVariantId } : {}),
        })
    );
    const variantNameById = new Map(variants.map((variant) => [variant.id, variant.name]));
    const followUps = planFollowUps.map((followUp) => mapFollowUpView(followUp, revisionLabelById));
    const followUpById = new Map(followUps.map((followUp) => [followUp.id, followUp]));
    const openFollowUps = followUps.filter((followUp) => followUp.status === 'open');
    const currentVariant = variants.find((variant) => variant.id === plan.currentVariantId);
    const approvedVariant = plan.approvedVariantId
        ? variants.find((variant) => variant.id === plan.approvedVariantId)
        : undefined;
    const approvedRevisionLabel = plan.approvedRevisionId
        ? readRevisionLabel(plan.approvedRevisionNumber ?? plan.currentRevisionNumber, plan.approvedRevisionId)
        : undefined;
    const currentRevisionLabel = readRevisionLabel(plan.currentRevisionNumber, plan.currentRevisionId);
    const hasApprovedRevision = Boolean(plan.approvedRevisionId);
    const approvedRevisionMatchesCurrent = plan.approvedRevisionId === plan.currentRevisionId;
    const currentVariantLabel = readVariantLabel(currentVariant, plan.currentVariantName) ?? 'Current variant';
    const approvedVariantLabel = plan.approvedVariantId
        ? readVariantLabel(approvedVariant, plan.approvedVariantName ?? plan.approvedVariantId)
        : undefined;
    const planningDepth = plan.planningDepth ?? 'simple';
    const history = planHistory.length
        ? sortHistoryEntriesNewestFirst(
              planHistory.map((entry) =>
                  mapHistoryEntryView(entry, {
                      revisionLabelById,
                      variantNameById,
                      followUpById,
                  })
              )
          )
        : buildFallbackHistoryEntries(plan, {
              currentRevisionLabel,
              approvedRevisionLabel,
              currentVariantLabel,
              approvedVariantLabel,
              hasOpenFollowUps: openFollowUps.length > 0,
              followUps,
          });
    const recoveryBanner =
        mapRecoveryBanner(plan.recoveryBanner) ??
        deriveRecoveryBanner({
            plan,
            currentRevisionLabel,
            currentVariantLabel,
            approvedVariantLabel,
            approvedVariantId: plan.approvedVariantId,
            approvedRevisionLabel,
            hasOpenFollowUps: openFollowUps.length > 0,
            openFollowUpCount: openFollowUps.length,
        });

    return {
        planningDepth,
        statusLabel: readPlanStatusLabel(plan.status),
        statusDescription: readPlanStatusDescription(plan),
        statusTone: readStatusTone(plan.status),
        revisionLabel: currentRevisionLabel,
        approvedRevisionLabel,
        revisionComparisonLabel: hasApprovedRevision
            ? approvedRevisionMatchesCurrent
                ? 'The current revision is the approved revision.'
                : 'The current revision is ahead of the last approved revision.'
            : 'No approved revision has been recorded yet.',
        currentVariantLabel,
        approvedVariantLabel,
        variantComparisonLabel: approvedVariantLabel
            ? plan.currentVariantId === plan.approvedVariantId
                ? 'The current variant matches the approved variant.'
                : `The current variant is ${currentVariantLabel}, while the approved variant is ${approvedVariantLabel}.`
            : `The current variant is ${currentVariantLabel}.`,
        variants,
        followUps,
        history,
        recoveryBanner,
        currentVariantId: plan.currentVariantId,
        approvedVariantId: plan.approvedVariantId,
        hasOpenFollowUps: openFollowUps.length > 0,
        hasRunningResearchBatch,
        questionsEditable: plan.status === 'awaiting_answers',
        readyToImplement: plan.status === 'approved' && openFollowUps.length === 0,
        canGenerateDraft: canGenerateDraft(plan) && !hasRunningResearchBatch,
        canRevise:
            !hasRunningResearchBatch &&
            (plan.status === 'draft' ||
                plan.status === 'approved' ||
                plan.status === 'implemented' ||
                plan.status === 'failed' ||
                plan.status === 'cancelled'),
        canApprove:
            !hasRunningResearchBatch &&
            (plan.status === 'draft' || plan.status === 'failed' || plan.status === 'cancelled') &&
            openFollowUps.length === 0,
        canImplement: !hasRunningResearchBatch && plan.status === 'approved' && openFollowUps.length === 0,
        canCancel:
            plan.status === 'awaiting_answers' ||
            plan.status === 'draft' ||
            plan.status === 'approved' ||
            plan.status === 'failed',
        canEnterAdvancedPlanning:
            !hasRunningResearchBatch && planningDepth === 'simple' && plan.status !== 'implementing',
    };
}

export function resolveModeExecutionPlanResearchArtifactState(input: {
    activePlan: ModeExecutionPlanView | undefined;
}): ModeExecutionPlanResearchArtifactState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    const plan = input.activePlan;
    const researchBatches = Array.isArray(plan.researchBatches) ? plan.researchBatches : [];
    const currentRevisionBatches = researchBatches
        .filter((batch) => batch.planRevisionId === plan.currentRevisionId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const historicalBatches = researchBatches
        .filter((batch) => batch.planRevisionId !== plan.currentRevisionId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const activeBatch = currentRevisionBatches.find((batch) => batch.status === 'running');
    const hasRunningResearchBatch = Boolean(activeBatch);
    const isEditableAdvancedPlan =
        plan.planningDepth === 'advanced' && (plan.status === 'awaiting_answers' || plan.status === 'draft');

    return {
        currentRevisionBatches,
        historicalBatches,
        evidenceAttachments: Array.isArray(plan.evidenceAttachments) ? plan.evidenceAttachments : [],
        ...(plan.researchRecommendation ? { recommendation: plan.researchRecommendation } : {}),
        ...(plan.researchCapacity ? { capacity: plan.researchCapacity } : {}),
        ...(activeBatch ? { activeBatch } : {}),
        hasRunningResearchBatch,
        canStartResearch: isEditableAdvancedPlan && !hasRunningResearchBatch,
        canAbortActiveResearchBatch: hasRunningResearchBatch,
    };
}

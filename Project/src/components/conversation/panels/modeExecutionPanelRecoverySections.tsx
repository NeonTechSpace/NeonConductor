import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import type {
    ModeExecutionPlanArtifactState,
    ModeExecutionPlanFollowUpView,
    ModeExecutionPlanHistoryEntryView,
    ModeExecutionPlanTimelineActionView,
    ModeExecutionPlanVariantView,
    ModeExecutionPlanView,
} from '@/web/components/conversation/panels/modeExecutionPanelState';
import { Button } from '@/web/components/ui/button';

import type { EntityId } from '@/shared/contracts';

import type { ReactNode } from 'react';

interface PlanRecoveryBannerSectionProps {
    plan: ModeExecutionPlanView;
    artifactState: ModeExecutionPlanArtifactState;
    isPlanMutating: boolean;
    onEnterEditMode: () => void;
    onActivateVariant?: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
    onResolveFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
}

function readActionHandlerLabel(actionKind: ModeExecutionPlanTimelineActionView['kind']): string {
    switch (actionKind) {
        case 'resume_from_here':
            return 'Resume From Here';
        case 'branch_from_here':
            return 'Branch From Here';
        case 'view_follow_up':
            return 'View Follow-Up';
        case 'switch_to_variant':
            return 'Switch Variant';
        case 'resume_editing':
            return 'Resume Editing';
        case 'resolve_follow_up':
            return 'Resolve Follow-Up';
    }
}

function renderTimelineActionButton(
    plan: ModeExecutionPlanView,
    action: ModeExecutionPlanTimelineActionView,
    input: {
        isPlanMutating: boolean;
        onActivateVariant?: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
        onEnterEditMode?: () => void;
        onResolveFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
        onResumeFromRevision?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
        onCreateVariant?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
        onViewFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
    }
): ReactNode {
    const label = action.label || readActionHandlerLabel(action.kind);
    switch (action.kind) {
        case 'resume_editing':
            return (
                <Button
                    key={`${action.kind}-${label}`}
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isPlanMutating || !input.onEnterEditMode}
                    onClick={() => {
                        input.onEnterEditMode?.();
                    }}>
                    {label}
                </Button>
            );
        case 'resolve_follow_up':
            return (
                <Button
                    key={`${action.kind}-${label}`}
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isPlanMutating || !input.onResolveFollowUp || !action.followUpId}
                    onClick={() => {
                        if (action.followUpId) {
                            input.onResolveFollowUp?.(plan.id, action.followUpId);
                        }
                    }}>
                    {label}
                </Button>
            );
        case 'switch_to_variant':
            return (
                <Button
                    key={`${action.kind}-${label}`}
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isPlanMutating || !input.onActivateVariant || !action.variantId}
                    onClick={() => {
                        if (action.variantId) {
                            input.onActivateVariant?.(plan.id, action.variantId);
                        }
                    }}>
                    {label}
                </Button>
            );
        case 'resume_from_here':
            return (
                <Button
                    key={`${action.kind}-${label}`}
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isPlanMutating || !input.onResumeFromRevision || !action.revisionId}
                    onClick={() => {
                        if (action.revisionId) {
                            input.onResumeFromRevision?.(plan.id, action.revisionId);
                        }
                    }}>
                    {label}
                </Button>
            );
        case 'branch_from_here':
            return (
                <Button
                    key={`${action.kind}-${label}`}
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isPlanMutating || !input.onCreateVariant || !action.revisionId}
                    onClick={() => {
                        if (action.revisionId) {
                            input.onCreateVariant?.(plan.id, action.revisionId);
                        }
                    }}>
                    {label}
                </Button>
            );
        case 'view_follow_up':
            return (
                <Button
                    key={`${action.kind}-${label}`}
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={input.isPlanMutating || !input.onViewFollowUp || !action.followUpId}
                    onClick={() => {
                        if (action.followUpId) {
                            input.onViewFollowUp?.(plan.id, action.followUpId);
                        }
                    }}>
                    {label}
                </Button>
            );
    }
}

export function PlanRecoveryBannerSection({
    plan,
    artifactState,
    isPlanMutating,
    onEnterEditMode,
    onActivateVariant,
    onResolveFollowUp,
}: PlanRecoveryBannerSectionProps) {
    const banner = artifactState.recoveryBanner;
    if (!banner) {
        return null;
    }

    return (
        <section className='border-border/70 bg-background/80 rounded-2xl border p-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>{banner.title}</p>
                    <p className='text-muted-foreground text-xs'>{banner.message}</p>
                </div>
                <div className='flex flex-wrap gap-2'>
                    {banner.actions.map((action) =>
                        renderTimelineActionButton(plan, action, {
                            isPlanMutating,
                            ...(onActivateVariant ? { onActivateVariant } : {}),
                            onEnterEditMode,
                            ...(onResolveFollowUp ? { onResolveFollowUp } : {}),
                        })
                    )}
                </div>
            </div>
        </section>
    );
}

interface PlanVariantSwitcherSectionProps {
    plan: ModeExecutionPlanView;
    artifactState: ModeExecutionPlanArtifactState;
    isPlanMutating: boolean;
    onCreateVariant?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onActivateVariant?: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
}

function renderVariantPill(
    plan: ModeExecutionPlanView,
    variant: ModeExecutionPlanVariantView,
    input: PlanVariantSwitcherSectionProps
): ReactNode {
    const isCurrent = variant.id === input.artifactState.currentVariantId || variant.isCurrent;
    const isApproved = variant.id === input.artifactState.approvedVariantId || variant.isApproved;
    return (
        <div
            key={variant.id}
            className={`border-border/70 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                isCurrent ? 'bg-background' : 'bg-background/70'
            }`}>
            <div className='space-y-0.5'>
                <p className='font-medium'>
                    {variant.name}
                    {isCurrent ? <span className='text-muted-foreground'> · Current</span> : null}
                    {isApproved ? <span className='text-muted-foreground'> · Approved</span> : null}
                </p>
                <p className='text-muted-foreground text-[11px]'>
                    {variant.revisionLabel ??
                        (variant.revisionNumber !== undefined
                            ? `Revision ${String(variant.revisionNumber)}`
                            : 'Revision history entry')}
                </p>
            </div>
            {!isCurrent ? (
                <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={input.isPlanMutating || !input.onActivateVariant}
                    onClick={() => {
                        input.onActivateVariant?.(plan.id, variant.id);
                    }}>
                    Switch
                </Button>
            ) : null}
        </div>
    );
}

export function PlanVariantSwitcherSection({
    plan,
    artifactState,
    isPlanMutating,
    onCreateVariant,
    onActivateVariant,
}: PlanVariantSwitcherSectionProps) {
    const variants = artifactState.variants;
    const otherVariants = variants.filter((variant) => variant.id !== artifactState.currentVariantId);

    return (
        <section className='space-y-2'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                    <p className='text-sm font-semibold'>Variants</p>
                    <p className='text-muted-foreground text-xs'>
                        The active draft can branch from any historical revision without mutating older history.
                    </p>
                </div>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isPlanMutating || !onCreateVariant}
                    onClick={() => {
                        onCreateVariant?.(plan.id, plan.currentRevisionId);
                    }}>
                    Create Variant
                </Button>
            </div>
            <div className='grid gap-2'>
                <div className='border-border/70 bg-background rounded-xl border px-3 py-2 text-xs'>
                    <p className='text-muted-foreground text-[11px] tracking-wide uppercase'>Current variant</p>
                    <p className='font-medium'>{artifactState.currentVariantLabel}</p>
                </div>
                {artifactState.approvedVariantLabel ? (
                    <div className='border-border/70 bg-background rounded-xl border px-3 py-2 text-xs'>
                        <p className='text-muted-foreground text-[11px] tracking-wide uppercase'>Approved variant</p>
                        <p className='font-medium'>{artifactState.approvedVariantLabel}</p>
                    </div>
                ) : null}
                {otherVariants.length > 0 ? (
                    <div className='space-y-2'>
                        <p className='text-muted-foreground text-[11px] tracking-wide uppercase'>Other variants</p>
                        <div className='space-y-2'>
                            {otherVariants.map((variant) =>
                                renderVariantPill(plan, variant, {
                                    plan,
                                    artifactState,
                                    isPlanMutating,
                                    ...(onCreateVariant ? { onCreateVariant } : {}),
                                    ...(onActivateVariant ? { onActivateVariant } : {}),
                                })
                            )}
                        </div>
                    </div>
                ) : (
                    <p className='text-muted-foreground text-xs'>No alternate variants have been created yet.</p>
                )}
            </div>
            <p className='text-muted-foreground text-xs'>{artifactState.variantComparisonLabel}</p>
        </section>
    );
}

interface PlanHistorySectionProps {
    plan: ModeExecutionPlanView;
    artifactState: ModeExecutionPlanArtifactState;
    isPlanMutating: boolean;
    onCreateVariant?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onActivateVariant?: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
    onResumeFromRevision?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onViewFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
    onResolveFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
}

function renderHistoryActions(
    plan: ModeExecutionPlanView,
    actions: ModeExecutionPlanTimelineActionView[] | undefined,
    input: {
        isPlanMutating: boolean;
        onCreateVariant?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
        onActivateVariant?: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
        onResumeFromRevision?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
        onViewFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
        onResolveFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
    }
): ReactNode[] {
    if (!actions || actions.length === 0) {
        return [];
    }

    return actions
        .map((action) =>
            renderTimelineActionButton(plan, action, {
                isPlanMutating: input.isPlanMutating,
                ...(input.onActivateVariant ? { onActivateVariant: input.onActivateVariant } : {}),
                ...(input.onCreateVariant ? { onCreateVariant: input.onCreateVariant } : {}),
                ...(input.onResumeFromRevision ? { onResumeFromRevision: input.onResumeFromRevision } : {}),
                ...(input.onViewFollowUp ? { onViewFollowUp: input.onViewFollowUp } : {}),
                ...(input.onResolveFollowUp ? { onResolveFollowUp: input.onResolveFollowUp } : {}),
            })
        )
        .filter((element) => element !== null && element !== undefined);
}

function PlanFollowUpCard({
    plan,
    followUp,
    isPlanMutating,
    onViewFollowUp,
    onResolveFollowUp,
}: {
    plan: ModeExecutionPlanView;
    followUp: ModeExecutionPlanFollowUpView;
    isPlanMutating: boolean;
    onViewFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
    onResolveFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
}) {
    return (
        <article className='border-border/70 bg-background rounded-xl border p-3 text-xs'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='space-y-1'>
                    <p className='font-medium'>{followUp.kind.replace('_', ' ')}</p>
                    <p className='text-muted-foreground text-[11px]'>
                        {followUp.status}
                        {followUp.sourceRevisionLabel ? ` · ${followUp.sourceRevisionLabel}` : ''}
                    </p>
                </div>
                <div className='flex flex-wrap gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        disabled={isPlanMutating || !onViewFollowUp}
                        onClick={() => {
                            onViewFollowUp?.(plan.id, followUp.id);
                        }}>
                        View Follow-Up
                    </Button>
                    {followUp.status === 'open' ? (
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={isPlanMutating || !onResolveFollowUp}
                            onClick={() => {
                                onResolveFollowUp?.(plan.id, followUp.id);
                            }}>
                            Resolve Follow-Up
                        </Button>
                    ) : null}
                </div>
            </div>
            <div className='mt-2 space-y-2'>
                <MarkdownContent markdown={followUp.promptMarkdown} className='space-y-2' />
                {followUp.responseMarkdown ? (
                    <div className='border-border/70 bg-background rounded-lg border p-2 text-[11px]'>
                        <p className='text-muted-foreground mb-1 tracking-wide uppercase'>Response</p>
                        <MarkdownContent markdown={followUp.responseMarkdown} className='space-y-2' />
                    </div>
                ) : null}
            </div>
        </article>
    );
}

function PlanHistoryEntryCard({
    plan,
    entry,
    isPlanMutating,
    onCreateVariant,
    onActivateVariant,
    onResumeFromRevision,
    onViewFollowUp,
    onResolveFollowUp,
}: {
    plan: ModeExecutionPlanView;
    entry: ModeExecutionPlanHistoryEntryView;
    isPlanMutating: boolean;
    onCreateVariant?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onActivateVariant?: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
    onResumeFromRevision?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onViewFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
    onResolveFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
}) {
    return (
        <article className='border-border/70 bg-background rounded-xl border p-3 text-xs'>
            <div className='flex flex-wrap items-start justify-between gap-2'>
                <div className='space-y-1'>
                    <p className='font-medium'>{entry.title}</p>
                    <p className='text-muted-foreground text-[11px]'>{entry.description}</p>
                </div>
                {entry.timestamp ? <span className='text-muted-foreground text-[11px]'>{entry.timestamp}</span> : null}
            </div>
            <div className='mt-2 flex flex-wrap gap-2'>
                <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                    {entry.kind.replace('_', ' ')}
                </span>
                {entry.revisionLabel ? (
                    <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                        {entry.revisionLabel}
                    </span>
                ) : null}
                {entry.variantLabel ? (
                    <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                        {entry.variantLabel}
                    </span>
                ) : null}
                {entry.followUpLabel ? (
                    <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                        {entry.followUpLabel}
                    </span>
                ) : null}
            </div>
            {entry.actions && entry.actions.length > 0 ? (
                <div className='mt-3 flex flex-wrap gap-2'>
                    {renderHistoryActions(plan, entry.actions, {
                        isPlanMutating,
                        ...(onCreateVariant ? { onCreateVariant } : {}),
                        ...(onActivateVariant ? { onActivateVariant } : {}),
                        ...(onResumeFromRevision ? { onResumeFromRevision } : {}),
                        ...(onViewFollowUp ? { onViewFollowUp } : {}),
                        ...(onResolveFollowUp ? { onResolveFollowUp } : {}),
                    })}
                </div>
            ) : null}
        </article>
    );
}

export function PlanHistorySection({
    plan,
    artifactState,
    isPlanMutating,
    onCreateVariant,
    onActivateVariant,
    onResumeFromRevision,
    onViewFollowUp,
    onResolveFollowUp,
}: PlanHistorySectionProps) {
    return (
        <section className='space-y-2'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                    <p className='text-sm font-semibold'>History</p>
                    <p className='text-muted-foreground text-xs'>
                        Recovery history combines revisions, approvals, follow-ups, and variant changes in newest-first
                        order.
                    </p>
                </div>
            </div>
            {artifactState.followUps.length > 0 ? (
                <div className='space-y-2'>
                    <p className='text-muted-foreground text-[11px] tracking-wide uppercase'>Follow-ups</p>
                    <div className='space-y-2'>
                        {artifactState.followUps.map((followUp) => (
                            <PlanFollowUpCard
                                key={followUp.id}
                                plan={plan}
                                followUp={followUp}
                                isPlanMutating={isPlanMutating}
                                {...(onViewFollowUp ? { onViewFollowUp } : {})}
                                {...(onResolveFollowUp ? { onResolveFollowUp } : {})}
                            />
                        ))}
                    </div>
                </div>
            ) : null}
            {artifactState.history.length > 0 ? (
                <div className='space-y-2'>
                    <div className='space-y-2'>
                        {artifactState.history.map((entry) => (
                            <PlanHistoryEntryCard
                                key={entry.id}
                                plan={plan}
                                entry={entry}
                                isPlanMutating={isPlanMutating}
                                {...(onCreateVariant ? { onCreateVariant } : {})}
                                {...(onActivateVariant ? { onActivateVariant } : {})}
                                {...(onResumeFromRevision ? { onResumeFromRevision } : {})}
                                {...(onViewFollowUp ? { onViewFollowUp } : {})}
                                {...(onResolveFollowUp ? { onResolveFollowUp } : {})}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <p className='text-muted-foreground text-xs'>No history entries are available yet.</p>
            )}
        </section>
    );
}

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import type {
    ModeExecutionPhaseDraftState,
    ModeExecutionPhasePanelMode,
    ModeExecutionPlanPhaseRecordView,
    ModeExecutionPlanPhaseState,
} from '@/web/components/conversation/panels/modeExecutionPanelState';
import { Button } from '@/web/components/ui/button';

function readPhaseStatusLabel(status: ModeExecutionPlanPhaseRecordView['status']): string {
    switch (status) {
        case 'not_started':
            return 'Not started';
        case 'draft':
            return 'Draft';
        case 'approved':
            return 'Approved';
        case 'implementing':
            return 'Implementing';
        case 'implemented':
            return 'Implemented';
        case 'cancelled':
            return 'Cancelled';
    }
}

function readPhaseStatusToneClass(status: ModeExecutionPlanPhaseRecordView['status']): string {
    switch (status) {
        case 'approved':
        case 'implemented':
            return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
        case 'implementing':
            return 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-300';
        case 'draft':
            return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300';
        case 'cancelled':
            return 'border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300';
        case 'not_started':
            return 'border-border bg-background text-foreground';
    }
}

function readPhaseItemStatusLabel(status: ModeExecutionPlanPhaseRecordView['items'][number]['status']): string {
    switch (status) {
        case 'pending':
            return 'Pending';
        case 'running':
            return 'Running';
        case 'completed':
            return 'Completed';
        case 'failed':
            return 'Failed';
        case 'aborted':
            return 'Aborted';
    }
}

interface PlanPhaseDetailSectionProps {
    phaseState: ModeExecutionPlanPhaseState | undefined;
    phaseDraftState: ModeExecutionPhaseDraftState | undefined;
    phasePanelMode: ModeExecutionPhasePanelMode | undefined;
    isPlanMutating: boolean;
    onExpandNextPhase?: () => void;
    onEnterPhaseEditMode?: () => void;
    onPhaseSummaryDraftChange?: (next: string) => void;
    onPhaseItemsDraftChange?: (next: string) => void;
    onSavePhaseDraft?: () => void;
    onDiscardPhaseEdits?: () => void;
    onApprovePhase?: () => void;
    onImplementPhase?: () => void;
    onCancelPhase?: () => void;
}

export function PlanPhaseDetailSection({
    phaseState,
    phaseDraftState,
    phasePanelMode,
    isPlanMutating,
    onExpandNextPhase,
    onEnterPhaseEditMode,
    onPhaseSummaryDraftChange,
    onPhaseItemsDraftChange,
    onSavePhaseDraft,
    onDiscardPhaseEdits,
    onApprovePhase,
    onImplementPhase,
    onCancelPhase,
}: PlanPhaseDetailSectionProps) {
    const currentPhase = phaseState?.currentPhase;
    const nextRoadmapPhase = phaseState?.nextExpandablePhaseOutlineId
        ? phaseState.roadmapPhases.find((phase) => phase.id === phaseState.nextExpandablePhaseOutlineId)
        : undefined;
    const canExpandNextPhase = Boolean(phaseState?.canExpandNextPhase);
    const isEditing = phasePanelMode === 'edit' && Boolean(currentPhase) && Boolean(phaseDraftState);
    const canRevisePhase = currentPhase
        ? currentPhase.status !== 'not_started' &&
          currentPhase.status !== 'implemented' &&
          currentPhase.status !== 'cancelled'
        : false;
    const canApprovePhase = currentPhase?.status === 'draft';
    const canImplementPhase = currentPhase?.status === 'approved';
    const canCancelPhase =
        currentPhase?.status === 'draft' ||
        currentPhase?.status === 'approved' ||
        currentPhase?.status === 'implementing';

    return (
        <section className='border-border/70 bg-background/80 space-y-3 rounded-2xl border p-3 shadow-sm'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Current Phase Detail</p>
                    <p className='text-muted-foreground text-xs'>
                        The approved roadmap stays intact while one detailed phase is expanded, approved, and
                        implemented at a time.
                    </p>
                </div>
                {canExpandNextPhase ? (
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={isPlanMutating || !onExpandNextPhase}
                        onClick={() => {
                            onExpandNextPhase?.();
                        }}>
                        Expand Next Phase
                    </Button>
                ) : null}
            </div>

            {currentPhase ? (
                <div className='space-y-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${readPhaseStatusToneClass(currentPhase.status)}`}>
                            {readPhaseStatusLabel(currentPhase.status)}
                        </span>
                        <span className='border-border/70 bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                            Phase {String(currentPhase.phaseSequence)}
                        </span>
                        <span className='border-border/70 bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                            Revision {String(currentPhase.currentRevisionNumber)}
                        </span>
                        <span className='text-muted-foreground text-[11px]'>{currentPhase.title}</span>
                    </div>

                    <div className='border-border bg-background rounded-xl border p-3'>
                        <div className='space-y-1'>
                            <p className='text-xs font-semibold'>{currentPhase.title}</p>
                            <p className='text-muted-foreground text-[11px]'>
                                Anchored to roadmap phase {String(currentPhase.phaseSequence)}
                                {nextRoadmapPhase ? ` · ${nextRoadmapPhase.title}` : ''}
                            </p>
                        </div>
                        <div className='mt-3 space-y-3 text-xs'>
                            <div className='space-y-1'>
                                <p className='text-muted-foreground text-[11px] font-medium uppercase'>Goal</p>
                                <MarkdownContent markdown={currentPhase.goalMarkdown} className='space-y-2' />
                            </div>
                            <div className='space-y-1'>
                                <p className='text-muted-foreground text-[11px] font-medium uppercase'>
                                    Exit criteria
                                </p>
                                <MarkdownContent markdown={currentPhase.exitCriteriaMarkdown} className='space-y-2' />
                            </div>
                            <div className='space-y-1'>
                                <p className='text-muted-foreground text-[11px] font-medium uppercase'>Summary</p>
                                <MarkdownContent markdown={currentPhase.summaryMarkdown} className='space-y-2' />
                            </div>
                            <div className='space-y-1'>
                                <p className='text-muted-foreground text-[11px] font-medium uppercase'>
                                    Ordered items
                                </p>
                                <div className='space-y-2'>
                                    {currentPhase.items.map((item) => (
                                        <article
                                            key={item.id}
                                            className='border-border/70 bg-background rounded-xl border px-3 py-2 text-xs'>
                                            <div className='flex flex-wrap items-start justify-between gap-2'>
                                                <p className='font-medium'>
                                                    {String(item.sequence)}. {item.description}
                                                </p>
                                                <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                                                    {readPhaseItemStatusLabel(item.status)}
                                                </span>
                                            </div>
                                            {item.runId || item.errorMessage ? (
                                                <div className='text-muted-foreground mt-2 flex flex-wrap gap-2 text-[11px]'>
                                                    {item.runId ? (
                                                        <span className='rounded-full border px-2 py-0.5'>
                                                            Run {item.runId}
                                                        </span>
                                                    ) : null}
                                                    {item.errorMessage ? (
                                                        <span className='rounded-full border px-2 py-0.5'>
                                                            {item.errorMessage}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </article>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {isEditing && phaseDraftState ? (
                        <div className='border-border/70 bg-background/90 space-y-3 rounded-xl border p-3'>
                            <div className='space-y-1'>
                                <p className='text-sm font-semibold'>Edit Phase Detail</p>
                                <p className='text-muted-foreground text-xs'>
                                    Revise this phase without reopening the approved roadmap.
                                </p>
                            </div>
                            <div className='space-y-1'>
                                <p className='text-xs font-medium'>Phase Summary</p>
                                <textarea
                                    rows={6}
                                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                                    value={phaseDraftState.summaryDraft}
                                    disabled={isPlanMutating}
                                    onChange={(event) => {
                                        onPhaseSummaryDraftChange?.(event.target.value);
                                    }}
                                />
                            </div>
                            <div className='space-y-1'>
                                <p className='text-xs font-medium'>Ordered Items (one per line)</p>
                                <textarea
                                    rows={6}
                                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                                    value={phaseDraftState.itemsDraft}
                                    disabled={isPlanMutating}
                                    onChange={(event) => {
                                        onPhaseItemsDraftChange?.(event.target.value);
                                    }}
                                />
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={isPlanMutating || !onSavePhaseDraft}
                                    onClick={() => {
                                        onSavePhaseDraft?.();
                                    }}>
                                    Save Phase Draft
                                </Button>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='ghost'
                                    disabled={isPlanMutating || !onDiscardPhaseEdits}
                                    onClick={() => {
                                        onDiscardPhaseEdits?.();
                                    }}>
                                    Discard Edits
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    {!isEditing ? (
                        <div className='flex flex-wrap gap-2'>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={isPlanMutating || !onEnterPhaseEditMode || !canRevisePhase}
                                onClick={() => {
                                    onEnterPhaseEditMode?.();
                                }}>
                                Revise
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={isPlanMutating || !onApprovePhase || !canApprovePhase}
                                onClick={() => {
                                    onApprovePhase?.();
                                }}>
                                Approve
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                disabled={isPlanMutating || !onImplementPhase || !canImplementPhase}
                                onClick={() => {
                                    onImplementPhase?.();
                                }}>
                                Implement Phase
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                disabled={isPlanMutating || !onCancelPhase || !canCancelPhase}
                                onClick={() => {
                                    onCancelPhase?.();
                                }}>
                                Cancel
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className='border-border/70 bg-background rounded-xl border p-3 text-xs'>
                    <p className='font-medium'>No detailed phase is open yet.</p>
                    <p className='text-muted-foreground mt-1'>
                        Expand the next roadmap phase to create the first phase detail lane.
                    </p>
                    {nextRoadmapPhase ? (
                        <p className='text-muted-foreground mt-2 text-[11px]'>
                            Next eligible roadmap phase: <span className='font-medium'>{nextRoadmapPhase.title}</span>
                        </p>
                    ) : null}
                </div>
            )}
        </section>
    );
}

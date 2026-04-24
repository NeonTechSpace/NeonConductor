import { useEffect, useState } from 'react';

import type { MemoryPanelController, MemoryPanelViewModel } from '@/web/components/conversation/panels/memoryPanel.types';
import { Button } from '@/web/components/ui/button';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type {
    MemoryApplyReviewActionInput,
    MemoryOperatorRevisionReason,
    ProjectedMemoryRecord,
    RetrievedMemoryRecord,
} from '@/shared/contracts';

type MemoryReviewActionDraft =
    | Omit<Extract<MemoryApplyReviewActionInput, { action: 'update' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>
    | Omit<Extract<MemoryApplyReviewActionInput, { action: 'supersede' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>
    | Omit<Extract<MemoryApplyReviewActionInput, { action: 'forget' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>;

function SyncStateBadge({ syncState }: { syncState: ProjectedMemoryRecord['syncState'] }) {
    const label =
        syncState === 'in_sync'
            ? 'In sync'
            : syncState === 'not_projected'
              ? 'Not projected'
              : syncState === 'edited'
                ? 'Edited'
                : 'Parse error';
    const className =
        syncState === 'in_sync'
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : syncState === 'not_projected'
              ? 'bg-muted text-muted-foreground'
              : syncState === 'edited'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'bg-destructive/10 text-destructive';

    return (
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase ${className}`}>
            {label}
        </span>
    );
}

function ScopeBadge({ label }: { label: string }) {
    return (
        <span className='bg-background text-muted-foreground rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase'>
            {label}
        </span>
    );
}

function formatRetentionTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
}

function DerivedSummaryBadges({
    derivedSummary,
}: {
    derivedSummary?: RetrievedMemoryRecord['derivedSummary'];
}) {
    if (!derivedSummary) {
        return null;
    }

    return (
        <>
            {derivedSummary.hasTemporalHistory ? <ScopeBadge label='history' /> : null}
            {derivedSummary.linkedRunIds.length > 0 ? <ScopeBadge label='linked run' /> : null}
            {derivedSummary.linkedThreadIds.length > 0 ? <ScopeBadge label='linked thread' /> : null}
            {derivedSummary.linkedWorkspaceFingerprints.length > 0 ? <ScopeBadge label='linked workspace' /> : null}
            {derivedSummary.graphNeighborCount > 0 ? <ScopeBadge label={`${String(derivedSummary.graphNeighborCount)} neighbors`} /> : null}
            {derivedSummary.temporalStatus ? <ScopeBadge label={derivedSummary.temporalStatus} /> : null}
            {derivedSummary.strength ? <ScopeBadge label={`confidence ${derivedSummary.strength.confidenceScore.toFixed(2)}`} /> : null}
        </>
    );
}

function MemoryProjectionRoots({ viewModel }: { viewModel: MemoryPanelViewModel }) {
    return (
        <div className='mt-3 grid gap-2 md:grid-cols-2'>
            <div className='border-border bg-background/60 rounded-xl border px-3 py-3'>
                <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Global root</p>
                <p className='text-muted-foreground mt-1 text-xs break-all'>
                    {viewModel.projectionRoots.globalMemoryRoot}
                </p>
            </div>
            <div className='border-border bg-background/60 rounded-xl border px-3 py-3'>
                <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Workspace root</p>
                <p className='text-muted-foreground mt-1 text-xs break-all'>
                    {viewModel.projectionRoots.workspaceMemoryRoot ?? 'No workspace memory root for this context.'}
                </p>
            </div>
        </div>
    );
}

function RetrievedMemoryCard({ record }: { record: RetrievedMemoryRecord }) {
    const hasConflictingCurrentTruth = record.derivedSummary
        ? record.derivedSummary.conflictingCurrentMemoryIds.length > 0
        : false;
    const showsDifferentCurrentTruth =
        record.derivedSummary?.currentTruthMemoryId && record.derivedSummary.currentTruthMemoryId !== record.memoryId;
    const isGraphExpanded = record.matchReason === 'graph_expanded';

    return (
        <div className='border-border bg-background/70 rounded-xl border px-3 py-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium'>{record.title}</p>
                <ScopeBadge label={record.memoryType} />
                <ScopeBadge label={record.scopeKind} />
                <ScopeBadge label={record.matchReason} />
                <DerivedSummaryBadges derivedSummary={record.derivedSummary} />
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>{record.memoryId}</p>
            {record.annotations && record.annotations.length > 0 ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>{record.annotations.join(' ')}</p>
            ) : null}
            {hasConflictingCurrentTruth ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Conflicting current truth detected for this temporal subject.
                </p>
            ) : null}
            {showsDifferentCurrentTruth ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Current truth resolves to {record.derivedSummary?.currentTruthMemoryId}.
                </p>
            ) : null}
            {isGraphExpanded ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Added through derived graph expansion from a stronger contextual anchor.
                </p>
            ) : null}
            {record.derivedSummary?.strength ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Strength: recency {record.derivedSummary.strength.recencyScore.toFixed(2)}, evidence{' '}
                    {String(record.derivedSummary.strength.evidenceCount)}, reuse{' '}
                    {String(record.derivedSummary.strength.reuseCount)}, importance{' '}
                    {record.derivedSummary.strength.importanceScore.toFixed(2)}.
                </p>
            ) : null}
            {record.supportingEvidence.length > 0 ? (
                <div className='mt-2 space-y-1'>
                    {record.supportingEvidence.map((evidence) => (
                        <p key={evidence.id} className='text-muted-foreground text-[11px]'>
                            Evidence: {evidence.label}
                            {evidence.excerptText ? ` - ${evidence.excerptText}` : ''}
                        </p>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function ProjectedMemoryCard({
    controller,
    projectedMemory,
}: {
    controller: MemoryPanelController;
    projectedMemory: ProjectedMemoryRecord;
}) {
    const hasConflictingCurrentTruth = projectedMemory.derivedSummary
        ? projectedMemory.derivedSummary.conflictingCurrentMemoryIds.length > 0
        : false;
    const runtimeMetadata = (() => {
        if (projectedMemory.memory.metadata['source'] !== 'runtime_run_outcome') {
            return null;
        }

        const runStatus = projectedMemory.memory.metadata['runStatus'];
        const runId = projectedMemory.memory.metadata['runId'];
        if ((runStatus !== 'completed' && runStatus !== 'error') || typeof runId !== 'string' || runId.length === 0) {
            return null;
        }

        return {
            runStatus,
            runId,
        } as const;
    })();
    const consolidationMetadata =
        projectedMemory.memory.metadata['source'] === 'memory_consolidation'
            ? {
                  sourceConsolidationId:
                      typeof projectedMemory.memory.metadata['sourceConsolidationId'] === 'string'
                          ? projectedMemory.memory.metadata['sourceConsolidationId']
                          : null,
              }
            : null;

    return (
        <div className='border-border bg-background/70 rounded-xl border px-3 py-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium'>{projectedMemory.memory.title}</p>
                <SyncStateBadge syncState={projectedMemory.syncState} />
                <ScopeBadge label={projectedMemory.memory.memoryType} />
                <ScopeBadge label={projectedMemory.memory.scopeKind} />
                <ScopeBadge label={projectedMemory.memory.memoryRetentionClass} />
                <ScopeBadge label={projectedMemory.projectionTarget} />
                {projectedMemory.memory.retentionPinnedAt ? <ScopeBadge label='pinned' /> : null}
                {projectedMemory.memory.createdByKind === 'system' ? <ScopeBadge label='system' /> : null}
                {controller.viewModel.retrievedMemoryIdSet.has(projectedMemory.memory.id) ? (
                    <ScopeBadge label='retrieved' />
                ) : null}
                <DerivedSummaryBadges derivedSummary={projectedMemory.derivedSummary} />
                {runtimeMetadata ? (
                    <ScopeBadge label={runtimeMetadata.runStatus === 'completed' ? 'completed run' : 'failed run'} />
                ) : null}
                {consolidationMetadata ? <ScopeBadge label='consolidated' /> : null}
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>{projectedMemory.memory.summaryText ?? projectedMemory.memory.id}</p>
            {projectedMemory.memory.retentionExpiresAt ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Expires {formatRetentionTimestamp(projectedMemory.memory.retentionExpiresAt)}
                </p>
            ) : null}
            {projectedMemory.memory.retentionPinnedAt ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Pinned {formatRetentionTimestamp(projectedMemory.memory.retentionPinnedAt)}
                </p>
            ) : null}
            {projectedMemory.memory.retentionSupersedenceRationale ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Supersedence: {projectedMemory.memory.retentionSupersedenceRationale}
                </p>
            ) : null}
            {runtimeMetadata ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Automatic memory from {runtimeMetadata.runStatus === 'completed' ? 'completed' : 'failed'} run{' '}
                    {runtimeMetadata.runId}
                </p>
            ) : null}
            {consolidationMetadata ? (
                <p className='text-muted-foreground mt-1 text-[11px]'>
                    Consolidated system memory
                    {consolidationMetadata.sourceConsolidationId
                        ? ` from consolidation ${consolidationMetadata.sourceConsolidationId}`
                        : ''}.
                </p>
            ) : null}
            <p className='text-muted-foreground mt-2 text-[11px] break-all'>{projectedMemory.absolutePath}</p>
            {projectedMemory.parseError ? <p className='text-destructive mt-2 text-xs'>{projectedMemory.parseError}</p> : null}
            {projectedMemory.derivedSummary?.hasTemporalHistory ? (
                <p className='text-muted-foreground mt-2 text-[11px]'>
                    Temporal history: {projectedMemory.derivedSummary.predecessorMemoryIds.length} prior fact
                    {projectedMemory.derivedSummary.predecessorMemoryIds.length === 1 ? '' : 's'}
                    {projectedMemory.derivedSummary.successorMemoryId ? ', plus a newer replacement' : ''}.
                </p>
            ) : null}
            {hasConflictingCurrentTruth ? (
                <p className='text-muted-foreground mt-2 text-[11px]'>
                    Conflicting current truth detected for this temporal subject.
                </p>
            ) : null}
            {projectedMemory.derivedSummary?.strength ? (
                <p className='text-muted-foreground mt-2 text-[11px]'>
                    Strength: recency {projectedMemory.derivedSummary.strength.recencyScore.toFixed(2)}, evidence{' '}
                    {String(projectedMemory.derivedSummary.strength.evidenceCount)}, reuse{' '}
                    {String(projectedMemory.derivedSummary.strength.reuseCount)}, importance{' '}
                    {projectedMemory.derivedSummary.strength.importanceScore.toFixed(2)}, confidence{' '}
                    {projectedMemory.derivedSummary.strength.confidenceScore.toFixed(2)}.
                </p>
            ) : null}
            <div className='mt-3 flex flex-wrap gap-2'>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                        controller.onOpenMemoryReview({ memoryId: projectedMemory.memory.id, mode: 'review' });
                    }}>
                    Review
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                        controller.onOpenMemoryReview({ memoryId: projectedMemory.memory.id, mode: 'update' });
                    }}>
                    Edit
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                        controller.onOpenMemoryReview({ memoryId: projectedMemory.memory.id, mode: 'supersede' });
                    }}>
                    Supersede
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                        controller.onOpenMemoryReview({ memoryId: projectedMemory.memory.id, mode: 'forget' });
                    }}>
                    Forget
                </Button>
            </div>
        </div>
    );
}

function MemoryReviewDialog({ controller }: { controller: MemoryPanelController }) {
    const dialog = controller.reviewDialog;
    const details = dialog?.details;
    const [title, setTitle] = useState('');
    const [summaryText, setSummaryText] = useState('');
    const [bodyMarkdown, setBodyMarkdown] = useState('');
    const [revisionReason, setRevisionReason] = useState<MemoryOperatorRevisionReason>('correction');

    useEffect(() => {
        if (!details) {
            return;
        }
        setTitle(details.memory.title);
        setSummaryText(details.memory.summaryText ?? '');
        setBodyMarkdown(details.memory.bodyMarkdown);
        setRevisionReason('correction');
    }, [details]);

    if (!dialog) {
        return null;
    }

    if (dialog.mode === 'forget') {
        return (
            <ConfirmDialog
                open
                title='Forget memory'
                message={
                    details
                        ? `This disables "${details.memory.title}" so it no longer participates in active retrieval. Evidence and revision history are preserved.`
                        : 'Preparing memory review...'
                }
                confirmLabel='Forget memory'
                destructive
                busy={controller.isApplyingReviewAction}
                confirmDisabled={!details}
                onConfirm={() => {
                    controller.onApplyMemoryReviewAction({ action: 'forget' });
                }}
                onCancel={controller.onCloseMemoryReview}
            />
        );
    }

    const isReadOnlyReview = dialog.mode === 'review';
    const actionLabel = dialog.mode === 'supersede' ? 'Supersede' : isReadOnlyReview ? 'Review' : 'Update';
    const applyInput = (): MemoryReviewActionDraft =>
        dialog.mode === 'supersede'
            ? {
                  action: 'supersede',
                  revisionReason,
                  title,
                  summaryText,
                  bodyMarkdown,
              }
            : {
                  action: 'update',
                  title,
                  summaryText,
                  bodyMarkdown,
              };

    return (
        <DialogSurface
            open
            titleId='memory-review-dialog-title'
            descriptionId='memory-review-dialog-description'
            onClose={controller.onCloseMemoryReview}>
            <div className='border-border bg-background w-[min(94vw,52rem)] rounded-2xl border p-5 shadow-xl'>
                <div className='space-y-1'>
                    <h2 id='memory-review-dialog-title' className='text-lg font-semibold'>
                        {actionLabel} Memory
                    </h2>
                    <p id='memory-review-dialog-description' className='text-muted-foreground text-sm'>
                        {details
                            ? `${details.memory.scopeKind} · ${details.memory.memoryRetentionClass} · ${details.memory.state}`
                            : 'Preparing memory review...'}
                    </p>
                </div>

                {!details ? (
                    <div className='border-border/70 bg-card/35 mt-4 rounded-xl border px-4 py-5 text-sm'>
                        {controller.isReviewDetailsLoading ? 'Loading memory details...' : 'Memory details are unavailable.'}
                    </div>
                ) : (
                    <div className='mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1'>
                        <div className='grid gap-3 sm:grid-cols-2'>
                            <div className='border-border rounded-xl border px-3 py-3'>
                                <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Memory</p>
                                <p className='text-muted-foreground mt-1 text-xs break-all'>{details.memory.id}</p>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                    Updated {formatRetentionTimestamp(details.memory.updatedAt)}
                                </p>
                            </div>
                            <div className='border-border rounded-xl border px-3 py-3'>
                                <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Provenance</p>
                                <pre className='text-muted-foreground mt-1 max-h-24 overflow-auto text-[11px] whitespace-pre-wrap'>
                                    {JSON.stringify(details.memory.metadata, null, 2)}
                                </pre>
                            </div>
                        </div>

                        {details.evidence.length > 0 ? (
                            <div className='border-border rounded-xl border px-3 py-3'>
                                <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Evidence</p>
                                <div className='mt-2 space-y-2'>
                                    {details.evidence.map((evidence) => (
                                        <p key={evidence.id} className='text-muted-foreground text-[11px]'>
                                            {evidence.label}
                                            {evidence.excerptText ? ` - ${evidence.excerptText}` : ''}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {details.revisions.length > 0 ? (
                            <div className='border-border rounded-xl border px-3 py-3'>
                                <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Revisions</p>
                                <div className='mt-2 space-y-1'>
                                    {details.revisions.map((revision) => (
                                        <p key={revision.id} className='text-muted-foreground text-[11px] break-all'>
                                            {revision.revisionReason}: {revision.previousMemoryId} {'->'}{' '}
                                            {revision.replacementMemoryId}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <label className='space-y-1 text-sm font-medium'>
                            <span>Title</span>
                            <input
                                className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                                value={title}
                                readOnly={isReadOnlyReview}
                                onChange={(event) => {
                                    setTitle(event.target.value);
                                }}
                            />
                        </label>

                        <label className='space-y-1 text-sm font-medium'>
                            <span>Summary</span>
                            <input
                                className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                                value={summaryText}
                                readOnly={isReadOnlyReview}
                                onChange={(event) => {
                                    setSummaryText(event.target.value);
                                }}
                            />
                        </label>

                        {dialog.mode === 'supersede' ? (
                            <label className='space-y-1 text-sm font-medium'>
                                <span>Revision reason</span>
                                <select
                                    className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                                    value={revisionReason}
                                    onChange={(event) => {
                                        setRevisionReason(
                                            event.target.value === 'deprecation' || event.target.value === 'refinement'
                                                ? event.target.value
                                                : 'correction'
                                        );
                                    }}>
                                    <option value='correction'>Correction</option>
                                    <option value='refinement'>Refinement</option>
                                    <option value='deprecation'>Deprecation</option>
                                </select>
                            </label>
                        ) : null}

                        <label className='space-y-1 text-sm font-medium'>
                            <span>Body</span>
                            <textarea
                                className='border-border bg-background min-h-56 w-full rounded-md border p-2 font-mono text-sm'
                                value={bodyMarkdown}
                                readOnly={isReadOnlyReview}
                                onChange={(event) => {
                                    setBodyMarkdown(event.target.value);
                                }}
                            />
                        </label>
                    </div>
                )}

                <div className='mt-5 flex justify-end gap-2'>
                    <Button type='button' variant='outline' onClick={controller.onCloseMemoryReview} disabled={controller.isApplyingReviewAction}>
                        Close
                    </Button>
                    {isReadOnlyReview ? null : (
                        <Button
                            type='button'
                            onClick={() => {
                                controller.onApplyMemoryReviewAction(applyInput());
                            }}
                            disabled={
                                controller.isApplyingReviewAction ||
                                !details ||
                                title.trim().length === 0 ||
                                bodyMarkdown.trim().length === 0
                            }>
                            {controller.isApplyingReviewAction ? 'Applying...' : actionLabel}
                        </Button>
                    )}
                </div>
            </div>
        </DialogSurface>
    );
}

function ProposalCard({
    controller,
    proposal,
}: {
    controller: MemoryPanelController;
    proposal: MemoryPanelViewModel['reviewSection']['proposals'][number];
}) {
    return (
        <div key={proposal.memory.id} className='border-border rounded-xl border px-3 py-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium'>{proposal.proposedTitle}</p>
                <ScopeBadge label={proposal.reviewAction} />
                <ScopeBadge label={proposal.memory.memoryType} />
                <ScopeBadge label={proposal.memory.scopeKind} />
                <ScopeBadge label={proposal.memory.memoryRetentionClass} />
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>{proposal.proposedSummaryText ?? proposal.memory.id}</p>
            <p className='text-muted-foreground mt-2 text-[11px] break-all'>{proposal.absolutePath}</p>
            <div className='mt-3 flex flex-wrap gap-2'>
                <Button
                    type='button'
                    size='sm'
                    disabled={controller.isApplyingProjectionEdit}
                    onClick={() => {
                        controller.onApplyProjectionEdit({
                            memoryId: proposal.memory.id,
                            observedContentHash: proposal.observedContentHash,
                            decision: 'accept',
                        });
                    }}>
                    Apply
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={controller.isApplyingProjectionEdit}
                    onClick={() => {
                        controller.onApplyProjectionEdit({
                            memoryId: proposal.memory.id,
                            observedContentHash: proposal.observedContentHash,
                            decision: 'reject',
                        });
                    }}>
                    Reject
                </Button>
            </div>
        </div>
    );
}

function ParseErrorCard({ parseError }: { parseError: ProjectedMemoryRecord }) {
    return (
        <div key={parseError.memory.id} className='border-destructive/20 rounded-xl border px-3 py-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium'>{parseError.memory.title}</p>
                <SyncStateBadge syncState='parse_error' />
            </div>
            <p className='text-destructive mt-2 text-xs'>{parseError.parseError}</p>
            <p className='text-muted-foreground mt-2 text-[11px] break-all'>{parseError.absolutePath}</p>
        </div>
    );
}

export function MemoryPanelSections({ controller }: { controller: MemoryPanelController }) {
    const { viewModel } = controller;

    return (
        <section className='border-border bg-card mb-3 rounded-2xl border p-3'>
            <MemoryReviewDialog controller={controller} />
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>Memory Projection</p>
                    <p className='text-muted-foreground text-xs'>
                        {viewModel.canonicalMemoryNote} Current context: {viewModel.contextLabel}.
                    </p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                    <label className='text-muted-foreground flex items-center gap-2 text-xs'>
                        <input
                            checked={viewModel.includeBroaderScopes}
                            onChange={(event) => {
                                controller.setIncludeBroaderScopes(event.target.checked);
                            }}
                            type='checkbox'
                        />
                        Include broader scopes
                    </label>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={controller.isRescanningProjectionEdits}
                        onClick={() => {
                            void controller.onRescanProjectionEdits();
                        }}>
                        Rescan edits
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        disabled={controller.isSyncingProjection}
                        onClick={() => {
                            controller.onSyncProjection();
                        }}>
                        {controller.isSyncingProjection ? 'Syncing…' : 'Sync projection'}
                    </Button>
                </div>
            </div>

            <MemoryProjectionRoots viewModel={viewModel} />

            {controller.feedbackMessage ? (
                <div
                    className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                        controller.feedbackTone === 'error'
                            ? 'text-destructive border-current/20'
                            : controller.feedbackTone === 'success'
                              ? 'border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'border-border text-muted-foreground'
                    }`}>
                    {controller.feedbackMessage}
                </div>
            ) : null}

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Retrieved For Current Context</p>
                    <span className='text-muted-foreground text-xs'>{viewModel.retrievedSection.count} records</span>
                </div>
                {viewModel.retrievedSection.records.length > 0 ? (
                    <div className='space-y-2'>
                        {viewModel.retrievedSection.records.map((record) => (
                            <RetrievedMemoryCard key={record.memoryId} record={record} />
                        ))}
                    </div>
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        {viewModel.retrievedSection.emptyMessage}
                    </p>
                )}
            </div>

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Projected Memory</p>
                    <span className='text-muted-foreground text-xs'>
                        {viewModel.isProjectionRefreshing
                            ? 'Refreshing…'
                            : `${String(viewModel.projectedSection.count)} records`}
                    </span>
                </div>
                {viewModel.projectedSection.records.length > 0 ? (
                    <div className='space-y-2'>
                        {viewModel.projectedSection.records.map((projectedMemory) => (
                            <ProjectedMemoryCard
                                key={projectedMemory.memory.id}
                                controller={controller}
                                projectedMemory={projectedMemory}
                            />
                        ))}
                    </div>
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        {viewModel.projectedSection.emptyMessage}
                    </p>
                )}
            </div>

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Pending File Edits</p>
                    <span className='text-muted-foreground text-xs'>
                        {viewModel.isReviewRefreshing
                            ? 'Refreshing…'
                            : `${String(viewModel.reviewSection.proposalCount)} proposals`}
                    </span>
                </div>
                {viewModel.reviewSection.proposals.length > 0 ? (
                    <div className='space-y-2'>
                        {viewModel.reviewSection.proposals.map((proposal) => (
                            <ProposalCard
                                key={proposal.memory.id}
                                controller={controller}
                                proposal={proposal}
                            />
                        ))}
                    </div>
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        No edited memory files are waiting for review.
                    </p>
                )}
                {viewModel.reviewSection.parseErrors.length > 0 ? (
                    <div className='space-y-2 pt-1'>
                        <p className='text-sm font-semibold'>Parse Errors</p>
                        {viewModel.reviewSection.parseErrors.map((parseError) => (
                            <ParseErrorCard key={parseError.memory.id} parseError={parseError} />
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

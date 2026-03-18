import { useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { EntityId, ProjectedMemoryRecord, RetrievedMemorySummary, TopLevelTab } from '@/shared/contracts';

interface MemoryPanelProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    worktreeId?: EntityId<'wt'>;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    retrievedMemory?: RetrievedMemorySummary;
}

function readRuntimeRunOutcomeMetadata(metadata: Record<string, unknown>): {
    runStatus: 'completed' | 'error';
    runId: string;
} | null {
    if (metadata['source'] !== 'runtime_run_outcome') {
        return null;
    }

    const runStatus = metadata['runStatus'];
    const runId = metadata['runId'];
    if ((runStatus !== 'completed' && runStatus !== 'error') || typeof runId !== 'string' || runId.length === 0) {
        return null;
    }

    return {
        runStatus,
        runId,
    };
}

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

function DerivedSummaryBadges({
    derivedSummary,
}: {
    derivedSummary?: ProjectedMemoryRecord['derivedSummary'] | RetrievedMemorySummary['records'][number]['derivedSummary'];
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
            {derivedSummary.temporalStatus ? <ScopeBadge label={derivedSummary.temporalStatus} /> : null}
        </>
    );
}

export function MemoryPanel({
    profileId,
    topLevelTab,
    modeKey,
    workspaceFingerprint,
    worktreeId,
    threadId,
    runId,
    retrievedMemory,
}: MemoryPanelProps) {
    const [includeBroaderScopes, setIncludeBroaderScopes] = useState(true);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'info' | 'error' | 'success'>('info');
    const utils = trpc.useUtils();
    const queryInput = {
        profileId,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(worktreeId ? { worktreeId } : {}),
        ...(threadId ? { threadId } : {}),
        ...(runId ? { runId } : {}),
        includeBroaderScopes,
    };
    const projectionStatusQuery = trpc.memory.projectionStatus.useQuery(queryInput, PROGRESSIVE_QUERY_OPTIONS);
    const scanProjectionEditsQuery = trpc.memory.scanProjectionEdits.useQuery(queryInput, PROGRESSIVE_QUERY_OPTIONS);

    const invalidateMemoryQueries = async () => {
        await Promise.all([
            utils.memory.projectionStatus.invalidate(queryInput),
            utils.memory.scanProjectionEdits.invalidate(queryInput),
            utils.memory.list.invalidate({ profileId }),
        ]);
    };

    const syncProjectionMutation = trpc.memory.syncProjection.useMutation({
        onSuccess: async () => {
            setFeedbackTone('success');
            setFeedbackMessage('Memory projection synced to disk.');
            await invalidateMemoryQueries();
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    const applyProjectionEditMutation = trpc.memory.applyProjectionEdit.useMutation({
        onSuccess: async (result) => {
            setFeedbackTone('success');
            setFeedbackMessage(
                result.decision === 'reject'
                    ? 'Edited memory file was reset to the canonical record.'
                    : `Memory proposal applied as ${result.appliedAction ?? 'update'}.`
            );
            await invalidateMemoryQueries();
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    const projectionStatus = projectionStatusQuery.data;
    const scannedEdits = scanProjectionEditsQuery.data;
    const retrievedMemoryById = new Map(retrievedMemory?.records.map((record) => [record.memoryId, record] as const) ?? []);

    return (
        <section className='border-border bg-card mb-3 rounded-2xl border p-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>Memory Projection</p>
                    <p className='text-muted-foreground text-xs'>
                        Backend-owned memory can be projected into `.neonconductor/memory` and reviewed before edits
                        touch canonical state.
                    </p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                    <label className='text-muted-foreground flex items-center gap-2 text-xs'>
                        <input
                            checked={includeBroaderScopes}
                            onChange={(event) => {
                                setIncludeBroaderScopes(event.target.checked);
                            }}
                            type='checkbox'
                        />
                        Include broader scopes
                    </label>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={scanProjectionEditsQuery.isFetching}
                        onClick={() => {
                            setFeedbackMessage(undefined);
                            void scanProjectionEditsQuery.refetch();
                        }}>
                        Rescan edits
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        disabled={syncProjectionMutation.isPending}
                        onClick={() => {
                            setFeedbackMessage(undefined);
                            syncProjectionMutation.mutate(queryInput);
                        }}>
                        {syncProjectionMutation.isPending ? 'Syncing…' : 'Sync projection'}
                    </Button>
                </div>
            </div>

            <div className='mt-3 grid gap-2 md:grid-cols-2'>
                <div className='border-border bg-background/60 rounded-xl border px-3 py-3'>
                    <p className='text-xs font-semibold uppercase tracking-[0.12em]'>Global root</p>
                    <p className='text-muted-foreground mt-1 break-all text-xs'>
                        {projectionStatus?.paths.globalMemoryRoot ?? 'Loading…'}
                    </p>
                </div>
                <div className='border-border bg-background/60 rounded-xl border px-3 py-3'>
                    <p className='text-xs font-semibold uppercase tracking-[0.12em]'>Workspace root</p>
                    <p className='text-muted-foreground mt-1 break-all text-xs'>
                        {projectionStatus?.paths.workspaceMemoryRoot ?? 'No workspace memory root for this context.'}
                    </p>
                </div>
            </div>

            {feedbackMessage ? (
                <div
                    className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                        feedbackTone === 'error'
                            ? 'text-destructive border-current/20'
                            : feedbackTone === 'success'
                              ? 'border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'border-border text-muted-foreground'
                    }`}>
                    {feedbackMessage}
                </div>
            ) : null}

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Retrieved For Current Context</p>
                    <span className='text-muted-foreground text-xs'>{retrievedMemory?.records.length ?? 0} records</span>
                </div>
                {(retrievedMemory?.records.length ?? 0) > 0 ? (
                    <div className='space-y-2'>
                        {retrievedMemory?.records.map((record) => (
                            <div key={record.memoryId} className='border-border bg-background/70 rounded-xl border px-3 py-3'>
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
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        No memory was injected into the current resolved context.
                    </p>
                )}
            </div>

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Projected Memory</p>
                    <span className='text-muted-foreground text-xs'>
                        {projectionStatusQuery.isFetching ? 'Refreshing…' : `${projectionStatus?.projectedMemories.length ?? 0} records`}
                    </span>
                </div>
                {(projectionStatus?.projectedMemories.length ?? 0) > 0 ? (
                    projectionStatus?.projectedMemories.map((projectedMemory) => (
                        <div
                            key={projectedMemory.memory.id}
                            className='border-border bg-background/70 rounded-xl border px-3 py-3'>
                            <div className='flex flex-wrap items-center gap-2'>
                                <p className='text-sm font-medium'>{projectedMemory.memory.title}</p>
                                <SyncStateBadge syncState={projectedMemory.syncState} />
                                <ScopeBadge label={projectedMemory.memory.memoryType} />
                                <ScopeBadge label={projectedMemory.memory.scopeKind} />
                                <ScopeBadge label={projectedMemory.projectionTarget} />
                                {projectedMemory.memory.createdByKind === 'system' ? <ScopeBadge label='system' /> : null}
                                {retrievedMemoryById.has(projectedMemory.memory.id) ? <ScopeBadge label='retrieved' /> : null}
                                <DerivedSummaryBadges derivedSummary={projectedMemory.derivedSummary} />
                                {(() => {
                                    const runtimeMetadata = readRuntimeRunOutcomeMetadata(projectedMemory.memory.metadata);
                                    if (!runtimeMetadata) {
                                        return null;
                                    }

                                    return (
                                        <ScopeBadge
                                            label={runtimeMetadata.runStatus === 'completed' ? 'completed run' : 'failed run'}
                                        />
                                    );
                                })()}
                            </div>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                {projectedMemory.memory.summaryText ?? projectedMemory.memory.id}
                            </p>
                            {(() => {
                                const runtimeMetadata = readRuntimeRunOutcomeMetadata(projectedMemory.memory.metadata);
                                if (!runtimeMetadata) {
                                    return null;
                                }

                                return (
                                    <p className='text-muted-foreground mt-1 text-[11px]'>
                                        Automatic memory from {runtimeMetadata.runStatus === 'completed' ? 'completed' : 'failed'} run{' '}
                                        {runtimeMetadata.runId}
                                    </p>
                                );
                            })()}
                            <p className='text-muted-foreground mt-2 break-all text-[11px]'>
                                {projectedMemory.absolutePath}
                            </p>
                            {projectedMemory.parseError ? (
                                <p className='text-destructive mt-2 text-xs'>{projectedMemory.parseError}</p>
                            ) : null}
                            {projectedMemory.derivedSummary?.hasTemporalHistory ? (
                                <p className='text-muted-foreground mt-2 text-[11px]'>
                                    Temporal history: {projectedMemory.derivedSummary.predecessorMemoryIds.length} prior fact
                                    {projectedMemory.derivedSummary.predecessorMemoryIds.length === 1 ? '' : 's'}
                                    {projectedMemory.derivedSummary.successorMemoryId ? ', plus a newer replacement' : ''}.
                                </p>
                            ) : null}
                        </div>
                    ))
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        No memory is in scope for the current {topLevelTab}.{modeKey} context.
                    </p>
                )}
            </div>

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Pending File Edits</p>
                    <span className='text-muted-foreground text-xs'>
                        {scanProjectionEditsQuery.isFetching ? 'Refreshing…' : `${scannedEdits?.proposals.length ?? 0} proposals`}
                    </span>
                </div>
                {(scannedEdits?.proposals.length ?? 0) > 0 ? (
                    scannedEdits?.proposals.map((proposal) => (
                        <div key={proposal.memory.id} className='border-border rounded-xl border px-3 py-3'>
                            <div className='flex flex-wrap items-center gap-2'>
                                <p className='text-sm font-medium'>{proposal.proposedTitle}</p>
                                <ScopeBadge label={proposal.reviewAction} />
                                <ScopeBadge label={proposal.memory.memoryType} />
                                <ScopeBadge label={proposal.memory.scopeKind} />
                            </div>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                {proposal.proposedSummaryText ?? proposal.memory.id}
                            </p>
                            <p className='text-muted-foreground mt-2 break-all text-[11px]'>{proposal.absolutePath}</p>
                            <div className='mt-3 flex flex-wrap gap-2'>
                                <Button
                                    type='button'
                                    size='sm'
                                    disabled={applyProjectionEditMutation.isPending}
                                    onClick={() => {
                                        setFeedbackMessage(undefined);
                                        applyProjectionEditMutation.mutate({
                                            ...queryInput,
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
                                    disabled={applyProjectionEditMutation.isPending}
                                    onClick={() => {
                                        setFeedbackMessage(undefined);
                                        applyProjectionEditMutation.mutate({
                                            ...queryInput,
                                            memoryId: proposal.memory.id,
                                            observedContentHash: proposal.observedContentHash,
                                            decision: 'reject',
                                        });
                                    }}>
                                    Reject
                                </Button>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        No edited memory files are waiting for review.
                    </p>
                )}
                {(scannedEdits?.parseErrors.length ?? 0) > 0 ? (
                    <div className='space-y-2 pt-1'>
                        <p className='text-sm font-semibold'>Parse Errors</p>
                        {scannedEdits?.parseErrors.map((parseError) => (
                            <div key={parseError.memory.id} className='border-destructive/20 rounded-xl border px-3 py-3'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='text-sm font-medium'>{parseError.memory.title}</p>
                                    <SyncStateBadge syncState='parse_error' />
                                </div>
                                <p className='text-destructive mt-2 text-xs'>{parseError.parseError}</p>
                                <p className='text-muted-foreground mt-2 break-all text-[11px]'>{parseError.absolutePath}</p>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

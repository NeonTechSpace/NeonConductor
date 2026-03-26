import {
    buildRollbackWarningLines,
    describeCompactionRun,
    describeRetentionDisposition,
    formatCheckpointByteSize,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';


import type { CheckpointRecord } from '@/app/backend/persistence/types';

import type {
    CheckpointCleanupPreview,
    CheckpointRollbackPreview,
    CheckpointStorageSummary,
} from '@/shared/contracts';

export type CleanupPreviewData = CheckpointCleanupPreview;
export type RollbackPreview = CheckpointRollbackPreview;

export interface RollbackWarningState {
    tone: 'warning' | 'isolated';
    lines: string[];
}

export interface CheckpointHistorySectionProps {
    visibleCheckpoints: CheckpointRecord[];
    checkpointStorage: CheckpointStorageSummary | undefined;
    selectedSessionId: CheckpointRecord['sessionId'] | undefined;
    disabled: boolean;
    cleanupPreviewOpen: boolean;
    forceCompactPending: boolean;
    applyCleanupPending: boolean;
    rollbackPending: boolean;
    revertChangesetPending: boolean;
    promoteMilestonePending: boolean;
    renameMilestonePending: boolean;
    deleteMilestonePending: boolean;
    confirmRollbackId: CheckpointRecord['id'] | undefined;
    rollbackTargetId: CheckpointRecord['id'] | undefined;
    milestoneDrafts: Record<string, string>;
    profileId: string;
    onToggleCheckpointActions: (checkpointId: CheckpointRecord['id']) => void;
    onCloseCheckpointActions: () => void;
    onMilestoneDraftChange: (checkpointId: CheckpointRecord['id'], value: string) => void;
    onRestoreCheckpoint: (checkpointId: CheckpointRecord['id']) => void;
    onRevertChangeset: (checkpointId: CheckpointRecord['id']) => void;
    onPromoteMilestone: (checkpointId: CheckpointRecord['id'], title: string) => void;
    onRenameMilestone: (checkpointId: CheckpointRecord['id'], title: string) => void;
    onDeleteMilestone: (checkpointId: CheckpointRecord['id']) => void;
    onToggleCleanupPreview: () => void;
    onApplyCleanup: () => void;
    onForceCompact: () => void;
}

function RollbackPreviewSection(input: {
    profileId: string;
    checkpointId: CheckpointRecord['id'];
    rollbackPending: boolean;
    revertChangesetPending: boolean;
    rollbackTargetId: CheckpointRecord['id'] | undefined;
    onRestoreCheckpoint: (checkpointId: CheckpointRecord['id']) => void;
    onRevertChangeset: (checkpointId: CheckpointRecord['id']) => void;
    onCloseCheckpointActions: () => void;
    buildRollbackWarningState: (preview: RollbackPreview | undefined) => RollbackWarningState | null;
    executionTargetLabel: string;
}) {
    const rollbackPreviewQuery = trpc.checkpoint.previewRollback.useQuery(
        {
            profileId: input.profileId,
            checkpointId: input.checkpointId,
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const rollbackPreviewPending = rollbackPreviewQuery.isPending;
    const selectedPreview =
        rollbackPreviewQuery.data?.found && rollbackPreviewQuery.data.preview.checkpointId === input.checkpointId
            ? rollbackPreviewQuery.data.preview
            : undefined;
    const rollbackWarningState = selectedPreview ? input.buildRollbackWarningState(selectedPreview) : null;

    return (
        <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
            <p className='text-sm'>
                Choose how to go back from <span className='font-medium'>{input.checkpointId}</span>.
            </p>
            <p className='text-muted-foreground mt-1 text-xs'>
                Backend guidance is based on the current shared-target risk for{' '}
                <span className='font-medium'>{input.executionTargetLabel}</span>.
            </p>
            <div className='mt-2 space-y-1 text-xs'>
                {selectedPreview?.changeset ? (
                    <p className='text-muted-foreground'>Changeset: {selectedPreview.changeset.summary}</p>
                ) : null}
                {rollbackPreviewPending ? (
                    <p className='text-muted-foreground'>Checking whether other chats share this target…</p>
                ) : null}
                {rollbackWarningState
                    ? rollbackWarningState.lines.map((line) => (
                          <p
                              key={line}
                              className={
                                  rollbackWarningState.tone === 'warning'
                                      ? 'text-destructive'
                                      : 'text-emerald-700 dark:text-emerald-400'
                              }>
                              {line}
                          </p>
                      ))
                    : null}
            </div>
            <div className='mt-3 flex flex-wrap gap-2'>
                <Button
                    type='button'
                    size='sm'
                    variant={selectedPreview?.recommendedAction === 'restore_checkpoint' ? 'default' : 'outline'}
                    className='h-11'
                    disabled={input.rollbackPending || input.revertChangesetPending || rollbackPreviewPending}
                    onClick={() => {
                        input.onRestoreCheckpoint(input.checkpointId);
                    }}>
                    {input.rollbackPending && input.rollbackTargetId === input.checkpointId
                        ? 'Restoring…'
                        : 'Restore Checkpoint'}
                </Button>
                {selectedPreview?.hasChangeset ? (
                    <Button
                        type='button'
                        size='sm'
                        variant={selectedPreview.recommendedAction === 'revert_changeset' ? 'default' : 'outline'}
                        className='h-11'
                        disabled={
                            input.rollbackPending ||
                            input.revertChangesetPending ||
                            rollbackPreviewPending ||
                            !selectedPreview.canRevertSafely
                        }
                        onClick={() => {
                            input.onRevertChangeset(input.checkpointId);
                        }}>
                        {input.revertChangesetPending && input.rollbackTargetId === input.checkpointId
                            ? 'Reverting…'
                            : 'Revert Changeset'}
                    </Button>
                ) : null}
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='h-11'
                    disabled={input.rollbackPending || input.revertChangesetPending}
                    onClick={input.onCloseCheckpointActions}>
                    Keep Current State
                </Button>
            </div>
        </div>
    );
}

function CleanupPreviewSection(input: {
    profileId: string;
    selectedSessionId: CheckpointRecord['sessionId'];
    applyCleanupPending: boolean;
    onApplyCleanup: () => void;
}) {
    const cleanupPreviewQuery = trpc.checkpoint.previewCleanup.useQuery(
        {
            profileId: input.profileId,
            sessionId: input.selectedSessionId,
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const cleanupPreviewPending = cleanupPreviewQuery.isPending;
    const cleanupPreviewData = cleanupPreviewQuery.data;

    return (
        <div className='border-border border-t p-3'>
            <p className='text-sm font-medium'>Retention Cleanup</p>
            <p className='text-muted-foreground mt-1 text-xs'>
                Cleanup affects retained checkpoint history only. It does not modify current workspace or sandbox files.
            </p>
            {cleanupPreviewPending ? (
                <p className='text-muted-foreground mt-3 text-sm'>Loading cleanup preview…</p>
            ) : cleanupPreviewData ? (
                <div className='mt-3 space-y-3'>
                    <div className='text-muted-foreground grid gap-2 text-xs sm:grid-cols-3'>
                        <p>Milestones kept: {String(cleanupPreviewData.milestoneCount)}</p>
                        <p>Recent checkpoints kept: {String(cleanupPreviewData.protectedRecentCount)}</p>
                        <p>Cleanup candidates: {String(cleanupPreviewData.eligibleCount)}</p>
                    </div>
                    {cleanupPreviewData.candidates.length === 0 ? (
                        <p className='text-muted-foreground text-sm'>
                            No cleanup-eligible checkpoints in this session.
                        </p>
                    ) : (
                        <div className='max-h-48 space-y-2 overflow-y-auto'>
                            {cleanupPreviewData.candidates.map((candidate) => (
                                <div
                                    key={candidate.checkpointId}
                                    className='border-border rounded-md border px-3 py-2 text-xs'>
                                    <p className='font-medium'>{candidate.summary}</p>
                                    <p className='text-muted-foreground mt-1'>
                                        {candidate.snapshotFileCount} snapshot files · {candidate.changesetChangeCount}{' '}
                                        changeset entries
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                    <Button
                        type='button'
                        size='sm'
                        className='h-11'
                        disabled={input.applyCleanupPending || cleanupPreviewData.candidates.length === 0}
                        onClick={input.onApplyCleanup}>
                        {input.applyCleanupPending ? 'Cleaning Up…' : 'Apply Cleanup'}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

export function CheckpointHistorySection({
    visibleCheckpoints,
    checkpointStorage,
    selectedSessionId,
    disabled,
    cleanupPreviewOpen,
    forceCompactPending,
    applyCleanupPending,
    rollbackPending,
    revertChangesetPending,
    promoteMilestonePending,
    renameMilestonePending,
    deleteMilestonePending,
    confirmRollbackId,
    rollbackTargetId,
    milestoneDrafts,
    profileId,
    onToggleCheckpointActions,
    onCloseCheckpointActions,
    onMilestoneDraftChange,
    onRestoreCheckpoint,
    onRevertChangeset,
    onPromoteMilestone,
    onRenameMilestone,
    onDeleteMilestone,
    onApplyCleanup,
    onForceCompact,
}: CheckpointHistorySectionProps) {
    const lastCompactionRun = checkpointStorage?.lastCompactionRun;

    return (
        <section className='border-border rounded-lg border'>
            {checkpointStorage ? (
                <div className='border-border border-b p-3'>
                    <p className='text-sm font-medium'>Storage</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Compaction affects checkpoint storage only. It does not modify live workspace or sandbox files.
                    </p>
                    <div className='text-muted-foreground mt-3 grid gap-2 text-xs sm:grid-cols-2'>
                        <p>
                            Loose blobs: {String(checkpointStorage.looseReferencedBlobCount)} ·{' '}
                            {formatCheckpointByteSize(checkpointStorage.looseReferencedByteSize)}
                        </p>
                        <p>
                            Packed blobs: {String(checkpointStorage.packedReferencedBlobCount)} ·{' '}
                            {formatCheckpointByteSize(checkpointStorage.packedReferencedByteSize)}
                        </p>
                        <p>
                            Total referenced: {String(checkpointStorage.totalReferencedBlobCount)} ·{' '}
                            {formatCheckpointByteSize(checkpointStorage.totalReferencedByteSize)}
                        </p>
                        <p>{describeCompactionRun(lastCompactionRun)}</p>
                    </div>
                    <div className='mt-3 flex flex-wrap items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            className='h-11'
                            disabled={forceCompactPending || !selectedSessionId}
                            onClick={onForceCompact}>
                            {forceCompactPending ? 'Compacting…' : 'Force Compact'}
                        </Button>
                        {lastCompactionRun ? (
                            <span className='text-muted-foreground text-xs'>
                                {lastCompactionRun.status} · {lastCompactionRun.completedAt}
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <div className='max-h-72 overflow-y-auto p-2'>
                {visibleCheckpoints.length === 0 ? (
                    <p className='text-muted-foreground rounded-xl border border-dashed p-3 text-sm'>
                        No checkpoints for this session yet.
                    </p>
                ) : (
                    <div className='space-y-2'>
                        {visibleCheckpoints.map((checkpoint) => (
                            <div key={checkpoint.id} className='border-border rounded-md border p-3'>
                                <div className='flex items-start justify-between gap-3'>
                                    <div className='min-w-0'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='text-sm font-medium'>{checkpoint.summary}</p>
                                            {checkpoint.checkpointKind === 'named' ? (
                                                <span className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium'>
                                                    Milestone
                                                </span>
                                            ) : null}
                                            {describeRetentionDisposition(checkpoint.retentionDisposition) ? (
                                                <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium'>
                                                    {describeRetentionDisposition(checkpoint.retentionDisposition)}
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className='text-muted-foreground text-xs'>
                                            {checkpoint.topLevelTab}.{checkpoint.modeKey} · {checkpoint.runId}
                                        </p>
                                    </div>
                                    <Button
                                        type='button'
                                        size='sm'
                                        className='h-11'
                                        disabled={disabled || rollbackPending || revertChangesetPending}
                                        onClick={() => {
                                            onToggleCheckpointActions(checkpoint.id);
                                        }}>
                                        {rollbackPending && rollbackTargetId === checkpoint.id
                                            ? 'Restoring…'
                                            : revertChangesetPending && rollbackTargetId === checkpoint.id
                                              ? 'Reverting…'
                                              : confirmRollbackId === checkpoint.id
                                                ? 'Cancel'
                                                : 'Actions'}
                                    </Button>
                                </div>
                                {confirmRollbackId === checkpoint.id ? (
                                    <RollbackPreviewSection
                                        profileId={profileId}
                                        checkpointId={checkpoint.id}
                                        rollbackPending={rollbackPending}
                                        revertChangesetPending={revertChangesetPending}
                                        rollbackTargetId={rollbackTargetId}
                                        executionTargetLabel={checkpoint.executionTargetLabel}
                                        buildRollbackWarningState={buildRollbackWarningLines}
                                        onRestoreCheckpoint={onRestoreCheckpoint}
                                        onRevertChangeset={onRevertChangeset}
                                        onCloseCheckpointActions={onCloseCheckpointActions}
                                    />
                                ) : null}
                                <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
                                    <p className='text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase'>
                                        {checkpoint.checkpointKind === 'named' ? 'Milestone' : 'Promote to Milestone'}
                                    </p>
                                    <div className='mt-2 flex flex-wrap gap-2'>
                                        <input
                                            type='text'
                                            value={milestoneDrafts[checkpoint.id] ?? checkpoint.milestoneTitle ?? ''}
                                            onChange={(event) => {
                                                onMilestoneDraftChange(checkpoint.id, event.target.value);
                                            }}
                                            placeholder='Milestone title'
                                            className='border-border bg-background min-h-11 min-w-[14rem] flex-1 rounded-md border px-3 text-sm'
                                        />
                                        {checkpoint.checkpointKind === 'named' ? (
                                            <>
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    className='h-11'
                                                    disabled={
                                                        renameMilestonePending ||
                                                        (
                                                            milestoneDrafts[checkpoint.id] ??
                                                            checkpoint.milestoneTitle ??
                                                            ''
                                                        ).trim().length === 0
                                                    }
                                                    onClick={() => {
                                                        onRenameMilestone(
                                                            checkpoint.id,
                                                            (
                                                                milestoneDrafts[checkpoint.id] ??
                                                                checkpoint.milestoneTitle ??
                                                                ''
                                                            ).trim()
                                                        );
                                                    }}>
                                                    {renameMilestonePending ? 'Renaming…' : 'Rename Milestone'}
                                                </Button>
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    variant='outline'
                                                    className='h-11'
                                                    disabled={deleteMilestonePending}
                                                    onClick={() => {
                                                        onDeleteMilestone(checkpoint.id);
                                                    }}>
                                                    {deleteMilestonePending ? 'Deleting…' : 'Delete Milestone'}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                type='button'
                                                size='sm'
                                                className='h-11'
                                                disabled={
                                                    promoteMilestonePending ||
                                                    (milestoneDrafts[checkpoint.id] ?? '').trim().length === 0
                                                }
                                                onClick={() => {
                                                    onPromoteMilestone(
                                                        checkpoint.id,
                                                        (milestoneDrafts[checkpoint.id] ?? '').trim()
                                                    );
                                                }}>
                                                {promoteMilestonePending ? 'Promoting…' : 'Promote to Milestone'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {cleanupPreviewOpen && selectedSessionId ? (
                <CleanupPreviewSection
                    profileId={profileId}
                    selectedSessionId={selectedSessionId}
                    applyCleanupPending={applyCleanupPending}
                    onApplyCleanup={onApplyCleanup}
                />
            ) : null}
        </section>
    );
}


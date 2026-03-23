import { Button } from '@/web/components/ui/button';

import { describeCompactionRun, describeRetentionDisposition, formatCheckpointByteSize } from '@/web/components/conversation/panels/diffCheckpointPanelState';

import type { CheckpointRecord } from '@/app/backend/persistence/types';
import type { CheckpointStorageSummary } from '@/app/backend/runtime/contracts';

interface CleanupPreviewData {
    milestoneCount: number;
    protectedRecentCount: number;
    eligibleCount: number;
    candidates: Array<{
        checkpointId: string;
        summary: string;
        snapshotFileCount: number;
        changesetChangeCount: number;
    }>;
}

interface RollbackPreview {
    changeset?: {
        summary: string;
    };
    recommendedAction: 'restore_checkpoint' | 'revert_changeset';
    hasChangeset: boolean;
    canRevertSafely: boolean;
}

interface RollbackWarningState {
    tone: 'warning' | 'isolated';
    lines: string[];
}

interface CheckpointHistorySectionProps {
    visibleCheckpoints: CheckpointRecord[];
    checkpointStorage: CheckpointStorageSummary | undefined;
    selectedSessionId: CheckpointRecord['sessionId'] | undefined;
    disabled: boolean;
    cleanupPreviewOpen: boolean;
    cleanupPreviewPending: boolean;
    cleanupPreviewData: CleanupPreviewData | undefined;
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
    rollbackPreviewPending: boolean;
    rollbackWarningState: RollbackWarningState | null;
    selectedPreview: RollbackPreview | undefined;
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

export function CheckpointHistorySection({
    visibleCheckpoints,
    checkpointStorage,
    selectedSessionId,
    disabled,
    cleanupPreviewOpen,
    cleanupPreviewPending,
    cleanupPreviewData,
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
    rollbackPreviewPending,
    rollbackWarningState,
    selectedPreview,
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
                    <div className='mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2'>
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
                        <Button type='button' size='sm' className='h-11' disabled={forceCompactPending || !selectedSessionId} onClick={onForceCompact}>
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
                    <p className='text-muted-foreground rounded-xl border border-dashed p-3 text-sm'>No checkpoints for this session yet.</p>
                ) : (
                    <div className='space-y-2'>
                        {visibleCheckpoints.map((checkpoint) => (
                            <div key={checkpoint.id} className='border-border rounded-md border p-3'>
                                <div className='flex items-start justify-between gap-3'>
                                    <div className='min-w-0'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='text-sm font-medium'>{checkpoint.summary}</p>
                                            {checkpoint.checkpointKind === 'named' ? (
                                                <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'>
                                                    Milestone
                                                </span>
                                            ) : null}
                                            {describeRetentionDisposition(checkpoint.retentionDisposition) ? (
                                                <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'>
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
                                    <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
                                        <p className='text-sm'>
                                            Choose how to go back from <span className='font-medium'>{checkpoint.id}</span>.
                                        </p>
                                        <p className='text-muted-foreground mt-1 text-xs'>
                                            Backend guidance is based on the current shared-target risk for{' '}
                                            <span className='font-medium'>{checkpoint.executionTargetLabel}</span>.
                                        </p>
                                        <div className='mt-2 space-y-1 text-xs'>
                                            <p className='text-muted-foreground'>
                                                Target: {checkpoint.executionTargetKind} · {checkpoint.executionTargetKey}
                                            </p>
                                            <p className='text-muted-foreground'>Snapshot: {String(checkpoint.snapshotFileCount)} files</p>
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
                                                disabled={rollbackPending || revertChangesetPending || rollbackPreviewPending}
                                                onClick={() => {
                                                    onRestoreCheckpoint(checkpoint.id);
                                                }}>
                                                {rollbackPending && rollbackTargetId === checkpoint.id ? 'Restoring…' : 'Restore Checkpoint'}
                                            </Button>
                                            {selectedPreview?.hasChangeset ? (
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    variant={selectedPreview.recommendedAction === 'revert_changeset' ? 'default' : 'outline'}
                                                    className='h-11'
                                                    disabled={
                                                        rollbackPending ||
                                                        revertChangesetPending ||
                                                        rollbackPreviewPending ||
                                                        !selectedPreview.canRevertSafely
                                                    }
                                                    onClick={() => {
                                                        onRevertChangeset(checkpoint.id);
                                                    }}>
                                                    {revertChangesetPending && rollbackTargetId === checkpoint.id ? 'Reverting…' : 'Revert Changeset'}
                                                </Button>
                                            ) : null}
                                            <Button
                                                type='button'
                                                size='sm'
                                                variant='outline'
                                                className='h-11'
                                                disabled={rollbackPending || revertChangesetPending}
                                                onClick={onCloseCheckpointActions}>
                                                Keep Current State
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                                <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
                                    <p className='text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground'>
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
                                                    disabled={renameMilestonePending || (milestoneDrafts[checkpoint.id] ?? checkpoint.milestoneTitle ?? '').trim().length === 0}
                                                    onClick={() => {
                                                        onRenameMilestone(checkpoint.id, (milestoneDrafts[checkpoint.id] ?? checkpoint.milestoneTitle ?? '').trim());
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
                                                disabled={promoteMilestonePending || (milestoneDrafts[checkpoint.id] ?? '').trim().length === 0}
                                                onClick={() => {
                                                    onPromoteMilestone(checkpoint.id, (milestoneDrafts[checkpoint.id] ?? '').trim());
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
            {cleanupPreviewOpen ? (
                <div className='border-border border-t p-3'>
                    <p className='text-sm font-medium'>Retention Cleanup</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Cleanup affects retained checkpoint history only. It does not modify current workspace or sandbox files.
                    </p>
                    {cleanupPreviewPending ? (
                        <p className='text-muted-foreground mt-3 text-sm'>Loading cleanup preview…</p>
                    ) : cleanupPreviewData ? (
                        <div className='mt-3 space-y-3'>
                            <div className='grid gap-2 text-xs text-muted-foreground sm:grid-cols-3'>
                                <p>Milestones kept: {String(cleanupPreviewData.milestoneCount)}</p>
                                <p>Recent checkpoints kept: {String(cleanupPreviewData.protectedRecentCount)}</p>
                                <p>Cleanup candidates: {String(cleanupPreviewData.eligibleCount)}</p>
                            </div>
                            {cleanupPreviewData.candidates.length === 0 ? (
                                <p className='text-muted-foreground text-sm'>No cleanup-eligible checkpoints in this session.</p>
                            ) : (
                                <div className='max-h-48 space-y-2 overflow-y-auto'>
                                    {cleanupPreviewData.candidates.map((candidate) => (
                                        <div key={candidate.checkpointId} className='border-border rounded-md border px-3 py-2 text-xs'>
                                            <p className='font-medium'>{candidate.summary}</p>
                                            <p className='text-muted-foreground mt-1'>
                                                {candidate.snapshotFileCount} snapshot files · {candidate.changesetChangeCount} changeset entries
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Button type='button' size='sm' className='h-11' disabled={applyCleanupPending || !selectedSessionId || cleanupPreviewData.candidates.length === 0} onClick={onApplyCleanup}>
                                {applyCleanupPending ? 'Cleaning Up…' : 'Apply Cleanup'}
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}

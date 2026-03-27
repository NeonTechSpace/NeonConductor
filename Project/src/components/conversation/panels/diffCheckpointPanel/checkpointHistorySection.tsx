import {
    buildRollbackWarningLines,
    describeCompactionRun,
    describeRetentionDisposition,
    formatCheckpointByteSize,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { CheckpointCleanupPreviewSection } from '@/web/components/conversation/panels/diffCheckpointPanel/checkpointCleanupPreviewSection';
import { CheckpointRollbackPreviewSection } from '@/web/components/conversation/panels/diffCheckpointPanel/checkpointRollbackPreviewSection';
import { Button } from '@/web/components/ui/button';

import type { CheckpointRecord } from '@/app/backend/persistence/types';

import type { CheckpointStorageSummary } from '@/shared/contracts';

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

function CheckpointStorageSection(input: {
    checkpointStorage: CheckpointStorageSummary;
    selectedSessionId: CheckpointRecord['sessionId'] | undefined;
    forceCompactPending: boolean;
    onForceCompact: () => void;
}) {
    const lastCompactionRun = input.checkpointStorage.lastCompactionRun;

    return (
        <div className='border-border border-b p-3'>
            <p className='text-sm font-medium'>Storage</p>
            <p className='text-muted-foreground mt-1 text-xs'>
                Compaction affects checkpoint storage only. It does not modify live workspace or sandbox files.
            </p>
            <div className='text-muted-foreground mt-3 grid gap-2 text-xs sm:grid-cols-2'>
                <p>
                    Loose blobs: {String(input.checkpointStorage.looseReferencedBlobCount)} ·{' '}
                    {formatCheckpointByteSize(input.checkpointStorage.looseReferencedByteSize)}
                </p>
                <p>
                    Packed blobs: {String(input.checkpointStorage.packedReferencedBlobCount)} ·{' '}
                    {formatCheckpointByteSize(input.checkpointStorage.packedReferencedByteSize)}
                </p>
                <p>
                    Total referenced: {String(input.checkpointStorage.totalReferencedBlobCount)} ·{' '}
                    {formatCheckpointByteSize(input.checkpointStorage.totalReferencedByteSize)}
                </p>
                <p>{describeCompactionRun(lastCompactionRun)}</p>
            </div>
            <div className='mt-3 flex flex-wrap items-center gap-2'>
                <Button
                    type='button'
                    size='sm'
                    className='h-11'
                    disabled={input.forceCompactPending || !input.selectedSessionId}
                    onClick={input.onForceCompact}>
                    {input.forceCompactPending ? 'Compacting…' : 'Force Compact'}
                </Button>
                {lastCompactionRun ? (
                    <span className='text-muted-foreground text-xs'>
                        {lastCompactionRun.status} · {lastCompactionRun.completedAt}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

function CheckpointMilestoneEditor(input: {
    checkpoint: CheckpointRecord;
    milestoneDrafts: Record<string, string>;
    promoteMilestonePending: boolean;
    renameMilestonePending: boolean;
    deleteMilestonePending: boolean;
    onMilestoneDraftChange: (checkpointId: CheckpointRecord['id'], value: string) => void;
    onPromoteMilestone: (checkpointId: CheckpointRecord['id'], title: string) => void;
    onRenameMilestone: (checkpointId: CheckpointRecord['id'], title: string) => void;
    onDeleteMilestone: (checkpointId: CheckpointRecord['id']) => void;
}) {
    const draftTitle = input.milestoneDrafts[input.checkpoint.id] ?? input.checkpoint.milestoneTitle ?? '';

    return (
        <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
            <p className='text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase'>
                {input.checkpoint.checkpointKind === 'named' ? 'Milestone' : 'Promote to Milestone'}
            </p>
            <div className='mt-2 flex flex-wrap gap-2'>
                <input
                    type='text'
                    value={draftTitle}
                    onChange={(event) => {
                        input.onMilestoneDraftChange(input.checkpoint.id, event.target.value);
                    }}
                    placeholder='Milestone title'
                    className='border-border bg-background min-h-11 min-w-[14rem] flex-1 rounded-md border px-3 text-sm'
                />
                {input.checkpoint.checkpointKind === 'named' ? (
                    <>
                        <Button
                            type='button'
                            size='sm'
                            className='h-11'
                            disabled={input.renameMilestonePending || draftTitle.trim().length === 0}
                            onClick={() => {
                                input.onRenameMilestone(input.checkpoint.id, draftTitle.trim());
                            }}>
                            {input.renameMilestonePending ? 'Renaming…' : 'Rename Milestone'}
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            className='h-11'
                            disabled={input.deleteMilestonePending}
                            onClick={() => {
                                input.onDeleteMilestone(input.checkpoint.id);
                            }}>
                            {input.deleteMilestonePending ? 'Deleting…' : 'Delete Milestone'}
                        </Button>
                    </>
                ) : (
                    <Button
                        type='button'
                        size='sm'
                        className='h-11'
                        disabled={input.promoteMilestonePending || draftTitle.trim().length === 0}
                        onClick={() => {
                            input.onPromoteMilestone(input.checkpoint.id, draftTitle.trim());
                        }}>
                        {input.promoteMilestonePending ? 'Promoting…' : 'Promote to Milestone'}
                    </Button>
                )}
            </div>
        </div>
    );
}

function CheckpointHistoryEntry(
    input: Pick<
        CheckpointHistorySectionProps,
        | 'disabled'
        | 'confirmRollbackId'
        | 'rollbackPending'
        | 'revertChangesetPending'
        | 'rollbackTargetId'
        | 'profileId'
        | 'milestoneDrafts'
        | 'promoteMilestonePending'
        | 'renameMilestonePending'
        | 'deleteMilestonePending'
        | 'onToggleCheckpointActions'
        | 'onCloseCheckpointActions'
        | 'onMilestoneDraftChange'
        | 'onRestoreCheckpoint'
        | 'onRevertChangeset'
        | 'onPromoteMilestone'
        | 'onRenameMilestone'
        | 'onDeleteMilestone'
    > & {
        checkpoint: CheckpointRecord;
    }
) {
    return (
        <div className='border-border rounded-md border p-3'>
            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-sm font-medium'>{input.checkpoint.summary}</p>
                        {input.checkpoint.checkpointKind === 'named' ? (
                            <span className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium'>
                                Milestone
                            </span>
                        ) : null}
                        {describeRetentionDisposition(input.checkpoint.retentionDisposition) ? (
                            <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium'>
                                {describeRetentionDisposition(input.checkpoint.retentionDisposition)}
                            </span>
                        ) : null}
                    </div>
                    <p className='text-muted-foreground text-xs'>
                        {input.checkpoint.topLevelTab}.{input.checkpoint.modeKey} · {input.checkpoint.runId}
                    </p>
                </div>
                <Button
                    type='button'
                    size='sm'
                    className='h-11'
                    disabled={input.disabled || input.rollbackPending || input.revertChangesetPending}
                    onClick={() => {
                        input.onToggleCheckpointActions(input.checkpoint.id);
                    }}>
                    {input.rollbackPending && input.rollbackTargetId === input.checkpoint.id
                        ? 'Restoring…'
                        : input.revertChangesetPending && input.rollbackTargetId === input.checkpoint.id
                          ? 'Reverting…'
                          : input.confirmRollbackId === input.checkpoint.id
                            ? 'Cancel'
                            : 'Actions'}
                </Button>
            </div>
            {input.confirmRollbackId === input.checkpoint.id ? (
                <CheckpointRollbackPreviewSection
                    profileId={input.profileId}
                    checkpointId={input.checkpoint.id}
                    rollbackPending={input.rollbackPending}
                    revertChangesetPending={input.revertChangesetPending}
                    rollbackTargetId={input.rollbackTargetId}
                    executionTargetLabel={input.checkpoint.executionTargetLabel}
                    buildRollbackWarningState={buildRollbackWarningLines}
                    onRestoreCheckpoint={input.onRestoreCheckpoint}
                    onRevertChangeset={input.onRevertChangeset}
                    onCloseCheckpointActions={input.onCloseCheckpointActions}
                />
            ) : null}
            <CheckpointMilestoneEditor
                checkpoint={input.checkpoint}
                milestoneDrafts={input.milestoneDrafts}
                promoteMilestonePending={input.promoteMilestonePending}
                renameMilestonePending={input.renameMilestonePending}
                deleteMilestonePending={input.deleteMilestonePending}
                onMilestoneDraftChange={input.onMilestoneDraftChange}
                onPromoteMilestone={input.onPromoteMilestone}
                onRenameMilestone={input.onRenameMilestone}
                onDeleteMilestone={input.onDeleteMilestone}
            />
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
    return (
        <section className='border-border rounded-lg border'>
            {checkpointStorage ? (
                <CheckpointStorageSection
                    checkpointStorage={checkpointStorage}
                    selectedSessionId={selectedSessionId}
                    forceCompactPending={forceCompactPending}
                    onForceCompact={onForceCompact}
                />
            ) : null}
            <div className='max-h-72 overflow-y-auto p-2'>
                {visibleCheckpoints.length === 0 ? (
                    <p className='text-muted-foreground rounded-xl border border-dashed p-3 text-sm'>
                        No checkpoints for this session yet.
                    </p>
                ) : (
                    <div className='space-y-2'>
                        {visibleCheckpoints.map((checkpoint) => (
                            <CheckpointHistoryEntry
                                key={checkpoint.id}
                                checkpoint={checkpoint}
                                disabled={disabled}
                                confirmRollbackId={confirmRollbackId}
                                rollbackPending={rollbackPending}
                                revertChangesetPending={revertChangesetPending}
                                rollbackTargetId={rollbackTargetId}
                                milestoneDrafts={milestoneDrafts}
                                promoteMilestonePending={promoteMilestonePending}
                                renameMilestonePending={renameMilestonePending}
                                deleteMilestonePending={deleteMilestonePending}
                                profileId={profileId}
                                onToggleCheckpointActions={onToggleCheckpointActions}
                                onCloseCheckpointActions={onCloseCheckpointActions}
                                onMilestoneDraftChange={onMilestoneDraftChange}
                                onRestoreCheckpoint={onRestoreCheckpoint}
                                onRevertChangeset={onRevertChangeset}
                                onPromoteMilestone={onPromoteMilestone}
                                onRenameMilestone={onRenameMilestone}
                                onDeleteMilestone={onDeleteMilestone}
                            />
                        ))}
                    </div>
                )}
            </div>
            {cleanupPreviewOpen && selectedSessionId ? (
                <CheckpointCleanupPreviewSection
                    profileId={profileId}
                    selectedSessionId={selectedSessionId}
                    applyCleanupPending={applyCleanupPending}
                    onApplyCleanup={onApplyCleanup}
                />
            ) : null}
        </section>
    );
}

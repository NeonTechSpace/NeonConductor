import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord } from '@/app/backend/persistence/types';

import type { CheckpointRollbackPreview } from '@/shared/contracts';

export interface RollbackWarningState {
    tone: 'warning' | 'isolated';
    lines: string[];
}

interface CheckpointRollbackPreviewSectionProps {
    profileId: string;
    checkpointId: CheckpointRecord['id'];
    rollbackPending: boolean;
    revertChangesetPending: boolean;
    rollbackTargetId: CheckpointRecord['id'] | undefined;
    onRestoreCheckpoint: (checkpointId: CheckpointRecord['id']) => void;
    onRevertChangeset: (checkpointId: CheckpointRecord['id']) => void;
    onCloseCheckpointActions: () => void;
    buildRollbackWarningState: (preview: CheckpointRollbackPreview | undefined) => RollbackWarningState | null;
    executionTargetLabel: string;
}

export function CheckpointRollbackPreviewSection(input: CheckpointRollbackPreviewSectionProps) {
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

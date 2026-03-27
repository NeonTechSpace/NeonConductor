import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord } from '@/app/backend/persistence/types';

interface CheckpointCleanupPreviewSectionProps {
    profileId: string;
    selectedSessionId: CheckpointRecord['sessionId'];
    applyCleanupPending: boolean;
    onApplyCleanup: () => void;
}

export function CheckpointCleanupPreviewSection(input: CheckpointCleanupPreviewSectionProps) {
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

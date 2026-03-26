import { ConfirmDialog } from '@/web/components/ui/confirmDialog';

interface WorkspaceDeleteDialogProps {
    open: boolean;
    workspaceLabel?: string;
    deletableThreadCount: number;
    favoriteThreadCount: number;
    totalThreadCount: number;
    busy: boolean;
    includeFavoriteThreads: boolean;
    onIncludeFavoriteThreadsChange: (nextValue: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
}

export function WorkspaceDeleteDialog({
    open,
    workspaceLabel,
    deletableThreadCount,
    favoriteThreadCount,
    totalThreadCount,
    busy,
    includeFavoriteThreads,
    onIncludeFavoriteThreadsChange,
    onCancel,
    onConfirm,
}: WorkspaceDeleteDialogProps) {
    return (
        <ConfirmDialog
            open={open}
            title='Clear workspace threads'
            message={
                workspaceLabel
                    ? `Delete threads for ${workspaceLabel}. The workspace stays registered. Favorites are protected unless you explicitly include them.`
                    : ''
            }
            confirmLabel='Delete threads'
            destructive
            busy={busy}
            confirmDisabled={deletableThreadCount === 0}
            onCancel={onCancel}
            onConfirm={onConfirm}>
            <div className='space-y-3 text-sm'>
                <div className='rounded-lg border border-amber-500/20 bg-amber-500/5 p-3'>
                    <p className='text-foreground font-medium'>
                        {deletableThreadCount} thread{deletableThreadCount === 1 ? '' : 's'} will be deleted.
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        {favoriteThreadCount} favorite{favoriteThreadCount === 1 ? '' : 's'} detected out of{' '}
                        {totalThreadCount} total workspace threads. This removes threads only, not the workspace itself.
                    </p>
                </div>
                {favoriteThreadCount > 0 ? (
                    <label className='flex items-start gap-2'>
                        <input
                            type='checkbox'
                            className='mt-0.5'
                            checked={includeFavoriteThreads}
                            onChange={(event) => {
                                onIncludeFavoriteThreadsChange(event.target.checked);
                            }}
                        />
                        <span>
                            Also delete favorite threads
                            <span className='text-muted-foreground block text-xs'>
                                Default is safe: favorites stay unless you check this.
                            </span>
                        </span>
                    </label>
                ) : null}
            </div>
        </ConfirmDialog>
    );
}

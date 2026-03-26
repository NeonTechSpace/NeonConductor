import { useId, useRef } from 'react';

import { Button } from '@/web/components/ui/button';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import {
    getUpdatesStatusRefetchInterval,
    isActiveUpdatePhase,
    UPDATES_STATUS_QUERY_OPTIONS,
} from '@/web/components/window/updatesStatusQueryOptions';
import { trpc } from '@/web/trpc/client';

export default function UpdateSwitchModal() {
    const { data: status } = trpc.updates.getSwitchStatus.useQuery(undefined, {
        ...UPDATES_STATUS_QUERY_OPTIONS,
        refetchInterval: (query) => getUpdatesStatusRefetchInterval(query.state.data),
    });
    const restartMutation = trpc.updates.restartToApplyUpdate.useMutation();
    const dismissMutation = trpc.updates.dismissStatus.useMutation();
    const titleId = useId();
    const descriptionId = useId();
    const primaryActionRef = useRef<HTMLButtonElement>(null);

    async function handleDismiss() {
        try {
            await dismissMutation.mutateAsync();
        } catch {
            return;
        }
    }

    async function handleRestart() {
        try {
            await restartMutation.mutateAsync();
        } catch {
            return;
        }
    }

    if (!status || !isActiveUpdatePhase(status.phase)) {
        return null;
    }

    const isDownloaded = status.phase === 'downloaded';
    const progress =
        status.phase === 'downloading' ? Math.max(0, Math.min(100, Math.round(status.percent ?? 0))) : null;

    return (
        <DialogSurface
            open
            titleId={titleId}
            descriptionId={descriptionId}
            initialFocusRef={primaryActionRef}
            onClose={() => {
                if (dismissMutation.isPending || restartMutation.isPending) {
                    return;
                }

                if (isDownloaded) {
                    void handleDismiss();
                }
            }}>
            <section className='border-border bg-card text-card-foreground w-full max-w-md rounded-xl border p-5 shadow-xl'>
                <p className='text-primary text-xs font-semibold tracking-[0.16em] uppercase'>Updater</p>
                <h2 id={titleId} className='mt-3 text-base font-semibold'>
                    {status.message || 'Preparing update...'}
                </h2>
                <p id={descriptionId} className='text-muted-foreground mt-2 text-sm'>
                    {isDownloaded
                        ? 'The update is downloaded and ready. Restart now to apply it, or dismiss this prompt and install it on quit.'
                        : 'Please wait while NeonConductor checks and downloads the selected release channel.'}
                </p>

                <div className='bg-muted mt-5 h-2 w-full overflow-hidden rounded-full'>
                    <div
                        className='bg-primary h-full rounded-full transition-[width] duration-150 ease-linear'
                        style={{ width: `${String(progress ?? (isDownloaded ? 100 : 20))}%` }}
                    />
                </div>

                <div className='text-muted-foreground mt-3 text-right text-xs font-medium'>
                    {progress === null ? (isDownloaded ? 'Ready to install' : 'Working...') : `${String(progress)}%`}
                </div>

                {isDownloaded ? (
                    <div className='mt-5 flex justify-end gap-2'>
                        <Button
                            type='button'
                            variant='outline'
                            disabled={dismissMutation.isPending || restartMutation.isPending}
                            onClick={() => {
                                void handleDismiss();
                            }}>
                            Later
                        </Button>
                        <Button
                            ref={primaryActionRef}
                            type='button'
                            disabled={dismissMutation.isPending || restartMutation.isPending}
                            onClick={() => {
                                void handleRestart();
                            }}>
                            {restartMutation.isPending ? 'Restarting...' : 'Restart now'}
                        </Button>
                    </div>
                ) : null}
            </section>
        </DialogSurface>
    );
}

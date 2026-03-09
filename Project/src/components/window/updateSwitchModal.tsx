import { Button } from '@/web/components/ui/button';
import { trpc } from '@/web/trpc/client';

const ACTIVE_PHASES = new Set(['checking', 'downloading', 'downloaded']);

export default function UpdateSwitchModal() {
    const { data: status } = trpc.updates.getSwitchStatus.useQuery(undefined, {
        refetchInterval: (query) => {
            const phase = query.state.data?.phase;
            return phase && ACTIVE_PHASES.has(phase) ? 300 : false;
        },
        refetchIntervalInBackground: true,
    });
    const restartMutation = trpc.updates.restartToApplyUpdate.useMutation();
    const dismissMutation = trpc.updates.dismissStatus.useMutation();

    if (!status || !ACTIVE_PHASES.has(status.phase)) {
        return null;
    }

    const isDownloaded = status.phase === 'downloaded';
    const progress =
        status.phase === 'downloading' ? Math.max(0, Math.min(100, Math.round(status.percent ?? 0))) : null;

    return (
        <div className='bg-background/70 fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm'>
            <section className='border-border bg-card text-card-foreground w-full max-w-md rounded-xl border p-5 shadow-xl'>
                <p className='text-primary text-xs font-semibold tracking-[0.16em] uppercase'>Updater</p>
                <h2 className='mt-3 text-base font-semibold'>{status.message || 'Preparing update...'}</h2>
                <p className='text-muted-foreground mt-2 text-sm'>
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
                                void dismissMutation.mutateAsync();
                            }}>
                            Later
                        </Button>
                        <Button
                            type='button'
                            disabled={dismissMutation.isPending || restartMutation.isPending}
                            onClick={() => {
                                void restartMutation.mutateAsync();
                            }}>
                            {restartMutation.isPending ? 'Restarting...' : 'Restart now'}
                        </Button>
                    </div>
                ) : null}
            </section>
        </div>
    );
}

import { Button } from '@/web/components/ui/button';

interface ProfileDangerSectionProps {
    isPending: boolean;
    onOpenFactoryReset: () => void;
}

export function ProfileDangerSection({ isPending, onOpenFactoryReset }: ProfileDangerSectionProps) {
    return (
        <section className='border-destructive/30 bg-destructive/5 space-y-3 rounded-lg border p-3'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Factory Reset App Data</p>
                <p className='text-muted-foreground text-xs'>
                    Deletes all app-owned chats, profiles, permissions, provider state, worktree records, managed
                    worktrees, global assets, and logs. Workspace-local
                    <code className='mx-1 rounded bg-black/5 px-1 py-0.5 text-[11px]'>.neonconductor</code>
                    files inside your repositories are not removed.
                </p>
            </div>
            <Button type='button' size='sm' variant='destructive' disabled={isPending} onClick={onOpenFactoryReset}>
                Factory Reset App Data
            </Button>
        </section>
    );
}

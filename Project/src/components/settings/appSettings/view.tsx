import { useState } from 'react';

import PrivacyModeToggle from '@/web/components/window/privacyModeToggle';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import { trpc } from '@/web/trpc/client';

import { FACTORY_RESET_CONFIRMATION_TEXT } from '@/shared/contracts';

export function AppSettingsView() {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState('');
    const factoryResetMutation = trpc.runtime.factoryReset.useMutation({
        onSuccess: () => {
            setConfirmOpen(false);
            setConfirmationText('');
        },
    });

    return (
        <section className='min-h-0 min-w-0 overflow-y-auto p-4 md:p-5'>
            <div className='mx-auto flex max-w-4xl flex-col gap-5'>
                <div className='space-y-1'>
                    <h4 className='text-xl font-semibold text-balance'>App</h4>
                    <p className='text-muted-foreground text-sm leading-6'>
                        Keep runtime-wide controls, privacy, and destructive maintenance actions here instead of hiding
                        them inside profile editing.
                    </p>
                </div>

                <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                    <div className='space-y-1'>
                        <p className='text-sm font-semibold'>Privacy mode</p>
                        <p className='text-muted-foreground text-xs leading-5'>
                            Redact sensitive account and usage values across the app when you are sharing your screen or
                            capturing screenshots.
                        </p>
                    </div>

                    <div className='flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                        <div className='space-y-1'>
                            <p className='text-sm font-medium'>Redact sensitive values</p>
                            <p className='text-muted-foreground text-xs'>Applies immediately across account and usage surfaces.</p>
                        </div>
                        <PrivacyModeToggle />
                    </div>
                </section>

                <section className='border-destructive/30 bg-destructive/5 space-y-4 rounded-[24px] border p-5'>
                    <div className='space-y-1'>
                        <p className='text-sm font-semibold'>Factory reset app data</p>
                        <p className='text-muted-foreground text-xs leading-5'>
                            Deletes all app-owned chats, profiles, permissions, provider state, managed sandboxes,
                            registry assets, and logs. Workspace-local <code className='rounded bg-black/5 px-1 py-0.5 text-[11px]'>.neonconductor</code> files are not removed.
                        </p>
                    </div>

                    <div className='flex justify-end'>
                        <button
                            type='button'
                            className='rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={factoryResetMutation.isPending}
                            onClick={() => {
                                setConfirmOpen(true);
                            }}>
                            Factory reset app data
                        </button>
                    </div>
                </section>
            </div>

            <ConfirmDialog
                open={confirmOpen}
                title='Factory Reset App Data'
                message='This removes all app-owned data and recreates a fresh default profile. Type the confirmation phrase to continue.'
                confirmLabel='Reset app data'
                destructive
                busy={factoryResetMutation.isPending}
                confirmDisabled={confirmationText !== FACTORY_RESET_CONFIRMATION_TEXT}
                onCancel={() => {
                    setConfirmOpen(false);
                    setConfirmationText('');
                }}
                onConfirm={() => {
                    void factoryResetMutation.mutateAsync({
                        confirm: true,
                        confirmationText,
                    });
                }}>
                <div className='space-y-2'>
                    <p className='text-muted-foreground text-xs'>
                        Enter <span className='font-semibold'>{FACTORY_RESET_CONFIRMATION_TEXT}</span> to confirm.
                    </p>
                    <input
                        type='text'
                        value={confirmationText}
                        onChange={(event) => {
                            setConfirmationText(event.target.value);
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                        placeholder={FACTORY_RESET_CONFIRMATION_TEXT}
                    />
                </div>
            </ConfirmDialog>
        </section>
    );
}

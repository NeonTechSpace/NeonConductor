import { useState } from 'react';

import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import { APP_SETTINGS_SUBSECTIONS, type AppSettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import PrivacyModeToggle from '@/web/components/window/privacyModeToggle';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import { trpc } from '@/web/trpc/client';

import { FACTORY_RESET_CONFIRMATION_TEXT } from '@/shared/contracts';

interface AppSettingsViewProps {
    subsection?: AppSettingsSubsectionId;
    onSubsectionChange?: (subsection: AppSettingsSubsectionId) => void;
}

function AppSectionHeader({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className='space-y-2'>
            <p className='text-primary text-[11px] font-semibold tracking-[0.16em] uppercase'>App</p>
            <div className='space-y-1'>
                <h4 className='text-xl font-semibold text-balance'>{title}</h4>
                <p className='text-muted-foreground max-w-3xl text-sm leading-6'>{description}</p>
            </div>
        </div>
    );
}

export function AppSettingsView({ subsection = 'privacy', onSubsectionChange }: AppSettingsViewProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState('');
    const factoryResetMutation = trpc.runtime.factoryReset.useMutation({
        onSuccess: () => {
            setConfirmOpen(false);
            setConfirmationText('');
        },
    });

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]'>
            <SettingsSelectionRail
                title='App'
                ariaLabel='App settings sections'
                selectedId={subsection}
                onSelect={(itemId) => {
                    const nextSection = APP_SETTINGS_SUBSECTIONS.find((candidate) => candidate.id === itemId);
                    if (!nextSection) {
                        return;
                    }

                    onSubsectionChange?.(nextSection.id);
                }}
                items={APP_SETTINGS_SUBSECTIONS.map((item) => ({
                    id: item.id,
                    title: item.label,
                    subtitle: item.description,
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-5 md:p-6'>
                <div className='mx-auto flex max-w-4xl flex-col gap-5'>
                    {subsection === 'privacy' ? (
                        <>
                            <AppSectionHeader
                                title='Privacy'
                                description='Keep sensitive value redaction in a dedicated app scope instead of scattering privacy controls across account pages.'
                            />

                            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                                <div className='space-y-1'>
                                    <p className='text-sm font-semibold'>Privacy mode</p>
                                    <p className='text-muted-foreground text-xs leading-5'>
                                        Redact sensitive account and usage values across the app when you are sharing
                                        your screen or capturing screenshots.
                                    </p>
                                </div>

                                <div className='flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                                    <div className='space-y-1'>
                                        <p className='text-sm font-medium'>Redact sensitive values</p>
                                        <p className='text-muted-foreground text-xs'>
                                            Applies immediately across account and usage surfaces.
                                        </p>
                                    </div>
                                    <PrivacyModeToggle />
                                </div>
                            </section>
                        </>
                    ) : null}

                    {subsection === 'maintenance' ? (
                        <>
                            <AppSectionHeader
                                title='Maintenance'
                                description='Keep destructive app-wide maintenance actions separate from ordinary privacy controls.'
                            />

                            <section className='border-destructive/30 bg-destructive/5 space-y-4 rounded-[24px] border p-5'>
                                <div className='space-y-1'>
                                    <p className='text-sm font-semibold'>Factory reset app data</p>
                                    <p className='text-muted-foreground text-xs leading-5'>
                                        Deletes all app-owned chats, profiles, permissions, provider state, managed
                                        sandboxes, registry assets, and logs. Workspace-local{' '}
                                        <code className='rounded bg-black/5 px-1 py-0.5 text-[11px]'>
                                            .neonconductor
                                        </code>{' '}
                                        files are not removed.
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
                        </>
                    ) : null}
                </div>
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

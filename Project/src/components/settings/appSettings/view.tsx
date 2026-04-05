import { useState } from 'react';

import { McpSettingsSection } from '@/web/components/settings/appSettings/mcpSection';
import type { AppSettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import { SettingsContentScaffold } from '@/web/components/settings/shared/settingsContentScaffold';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import PrivacyModeToggle from '@/web/components/window/privacyModeToggle';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import { FACTORY_RESET_CONFIRMATION_TEXT } from '@/shared/contracts';

interface AppSettingsViewProps {
    profileId: string;
    subsection?: AppSettingsSubsectionId;
    currentWorkspaceFingerprint?: string;
    onSubsectionChange?: (subsection: AppSettingsSubsectionId) => void;
}

export function AppSettingsView({
    profileId,
    subsection = 'privacy',
    currentWorkspaceFingerprint,
}: AppSettingsViewProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState('');
    const factoryResetMutation = trpc.runtime.factoryReset.useMutation();

    const confirmFactoryReset = createFailClosedAsyncAction(async () => {
        await factoryResetMutation.mutateAsync({
            confirm: true,
            confirmationText,
        });

        // Close and clear only after a successful reset confirmation.
        setConfirmOpen(false);
        setConfirmationText('');
    });

    function handleCancelFactoryReset() {
        if (factoryResetMutation.isPending) {
            return;
        }

        setConfirmOpen(false);
        setConfirmationText('');
    }

    function handleOpenFactoryResetDialog() {
        if (factoryResetMutation.isPending) {
            return;
        }

        setConfirmOpen(true);
    }

    const title = subsection === 'privacy' ? 'Privacy' : subsection === 'mcp' ? 'MCP' : 'Maintenance';
    const description =
        subsection === 'privacy'
            ? 'Keep sensitive value redaction in a dedicated app scope instead of scattering privacy controls across account pages.'
            : subsection === 'mcp'
              ? 'Manage backend-owned stdio MCP servers, secret-backed env keys, live tool discovery, and which MCP tools are safe for basic plan mode.'
              : 'Keep destructive app-wide maintenance actions separate from ordinary privacy controls.';

    return (
        <>
            <SettingsContentScaffold eyebrow='App' title={title} description={description} className='max-w-4xl'>
                {subsection === 'privacy' ? (
                    <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>Privacy mode</p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                Redact sensitive account and usage values across the app when you are sharing your
                                screen or capturing screenshots.
                            </p>
                        </div>

                        <div className='border-border/70 bg-background/70 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3'>
                            <div className='space-y-1'>
                                <p className='text-sm font-medium'>Redact sensitive values</p>
                                <p className='text-muted-foreground text-xs'>
                                    Applies immediately across account and usage surfaces.
                                </p>
                            </div>
                            <PrivacyModeToggle />
                        </div>
                    </section>
                ) : null}

                {subsection === 'mcp' ? (
                    <McpSettingsSection
                        profileId={profileId}
                        {...(currentWorkspaceFingerprint ? { currentWorkspaceFingerprint } : {})}
                    />
                ) : null}

                {subsection === 'maintenance' ? (
                    <section className='border-destructive/30 bg-destructive/5 space-y-4 rounded-[24px] border p-5'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>Factory reset app data</p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                Deletes all app-owned chats, profiles, permissions, provider state, managed
                                sandboxes, registry assets, and logs. Workspace-local{' '}
                                <code className='rounded bg-black/5 px-1 py-0.5 text-[11px]'>.neonconductor</code>{' '}
                                files are not removed.
                            </p>
                        </div>

                        <div className='flex justify-end'>
                            <button
                                type='button'
                                className='border-destructive/40 bg-destructive/10 text-destructive rounded-full border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                                disabled={factoryResetMutation.isPending}
                                onClick={() => {
                                    handleOpenFactoryResetDialog();
                                }}>
                                Factory reset app data
                            </button>
                        </div>
                    </section>
                ) : null}
            </SettingsContentScaffold>
            <ConfirmDialog
                open={confirmOpen}
                title='Factory Reset App Data'
                message='This removes all app-owned data and recreates a fresh default profile. Type the confirmation phrase to continue.'
                confirmLabel='Reset app data'
                destructive
                busy={factoryResetMutation.isPending}
                confirmDisabled={confirmationText !== FACTORY_RESET_CONFIRMATION_TEXT}
                onCancel={() => {
                    handleCancelFactoryReset();
                }}
                onConfirm={() => {
                    void confirmFactoryReset();
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
        </>
    );
}

import { useProfileSettingsController } from '@/web/components/settings/profileSettings/useProfileSettingsController';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import { Button } from '@/web/components/ui/button';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';

interface ProfileSettingsViewProps {
    activeProfileId: string;
    onProfileActivated: (profileId: string) => void;
}

export function ProfileSettingsView({ activeProfileId, onProfileActivated }: ProfileSettingsViewProps) {
    const controller = useProfileSettingsController({
        activeProfileId,
        onProfileActivated,
    });

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden grid-cols-[280px_1fr]'>
            <SettingsSelectionRail
                title='Profiles'
                ariaLabel='Profile list'
                {...(controller.selectedProfileId ? { selectedId: controller.selectedProfileId } : {})}
                onSelect={(profileId) => {
                    controller.setSelectedProfileId(profileId);
                }}
                items={controller.profiles.map((profile) => ({
                    id: profile.id,
                    title: profile.name,
                    subtitle: profile.id,
                    ...(profile.id === activeProfileId ? { meta: 'Active' } : {}),
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-4'>
                <div className='space-y-5'>
                    <SettingsFeedbackBanner
                        message={controller.feedbackMessage}
                        tone={controller.feedbackTone}
                    />
                    <section className='space-y-2'>
                        <p className='text-sm font-semibold'>Create Profile</p>
                        <div className='grid grid-cols-[1fr_auto] gap-2'>
                            <label className='sr-only' htmlFor='profile-create-name'>
                                New profile name
                            </label>
                            <input
                                id='profile-create-name'
                                name='profileCreateName'
                                type='text'
                                value={controller.newProfileName}
                                onChange={(event) => {
                                    controller.setNewProfileName(event.target.value);
                                }}
                                className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                autoComplete='off'
                                placeholder='New profile name…'
                            />
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={controller.createMutation.isPending}
                                onClick={() => {
                                    void controller.createProfile();
                                }}>
                                Create
                            </Button>
                        </div>
                    </section>

                    {controller.selectedProfile ? (
                        <section className='space-y-3'>
                            <p className='text-sm font-semibold'>Selected Profile</p>
                            <div className='grid grid-cols-[1fr_auto_auto] gap-2'>
                                <label className='sr-only' htmlFor='profile-rename-input'>
                                    Profile name
                                </label>
                                <input
                                    id='profile-rename-input'
                                    name='profileRename'
                                    type='text'
                                    value={controller.renameValue}
                                    onChange={(event) => {
                                        controller.setRenameValue(event.target.value);
                                    }}
                                    className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                    autoComplete='off'
                                    placeholder='Profile name…'
                                />
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={
                                        controller.renameMutation.isPending ||
                                        controller.renameValue.trim().length === 0 ||
                                        controller.renameValue.trim() === controller.selectedProfile.name
                                    }
                                    onClick={() => {
                                        void controller.renameProfile();
                                    }}>
                                    Rename
                                </Button>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={controller.duplicateMutation.isPending}
                                    onClick={() => {
                                        void controller.duplicateProfile();
                                    }}>
                                    Duplicate
                                </Button>
                            </div>

                            <div className='flex flex-wrap items-center gap-2'>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={
                                        controller.setActiveMutation.isPending ||
                                        controller.selectedProfile.id === activeProfileId
                                    }
                                    onClick={() => {
                                        void controller.activateProfile();
                                    }}>
                                    {controller.selectedProfile.id === activeProfileId ? 'Active' : 'Set Active'}
                                </Button>

                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={controller.cannotDeleteLastProfile || controller.deleteMutation.isPending}
                                    onClick={() => {
                                        controller.setConfirmDeleteOpen(true);
                                    }}>
                                    Delete
                                </Button>
                                <span className='text-muted-foreground text-xs'>
                                    {controller.cannotDeleteLastProfile
                                        ? 'Cannot delete the last remaining profile.'
                                        : 'Deletion removes local profile-scoped data.'}
                                </span>
                            </div>

                            <div className='space-y-1 pt-2'>
                                <p className='text-sm font-semibold'>Execution Preset</p>
                                <p className='text-muted-foreground text-xs'>
                                    Controls default runtime approval behavior for workspace-scoped tool access.
                                </p>
                                <select
                                    aria-label='Execution preset'
                                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                                    value={controller.executionPresetQuery.data?.preset ?? 'standard'}
                                    disabled={controller.setExecutionPresetMutation.isPending}
                                    onChange={(event) => {
                                        const nextPreset = event.target.value;
                                        if (
                                            nextPreset !== 'privacy' &&
                                            nextPreset !== 'standard' &&
                                            nextPreset !== 'yolo'
                                        ) {
                                            return;
                                        }

                                        void controller.updateExecutionPreset(nextPreset);
                                    }}>
                                    <option value='privacy'>Privacy: ask on every tool</option>
                                    <option value='standard'>Standard: allow safe workspace reads</option>
                                    <option value='yolo'>Yolo: auto-allow safe reads, deny unsafe boundaries</option>
                                </select>
                            </div>

                            <div className='space-y-1 pt-2'>
                                <p className='text-sm font-semibold'>Conversation Edit Behavior</p>
                                <p className='text-muted-foreground text-xs'>
                                    Controls default behavior when editing earlier user messages.
                                </p>
                                <select
                                    aria-label='Conversation edit behavior'
                                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                                    value={controller.editPreferenceQuery.data?.value ?? 'ask'}
                                    disabled={controller.setEditPreferenceMutation.isPending}
                                    onChange={(event) => {
                                        const nextValue = event.target.value;
                                        if (nextValue !== 'ask' && nextValue !== 'truncate' && nextValue !== 'branch') {
                                            return;
                                        }

                                        void controller.updateEditPreference(nextValue);
                                    }}>
                                    <option value='ask'>Ask every time</option>
                                    <option value='truncate'>Always truncate</option>
                                    <option value='branch'>Always branch</option>
                                </select>
                            </div>

                            <div className='space-y-1 pt-2'>
                                <p className='text-sm font-semibold'>Thread Title Generation</p>
                                <p className='text-muted-foreground text-xs'>
                                    Controls how new thread titles are generated from provider/model and prompt context.
                                </p>
                                <select
                                    aria-label='Thread title generation mode'
                                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                                    value={controller.threadTitlePreferenceQuery.data?.mode ?? 'template'}
                                    disabled={controller.setThreadTitlePreferenceMutation.isPending}
                                    onChange={(event) => {
                                        const nextMode = event.target.value;
                                        if (nextMode !== 'template' && nextMode !== 'ai_optional') {
                                            return;
                                        }

                                        void controller.updateThreadTitleMode(nextMode);
                                    }}>
                                    <option value='template'>Template only</option>
                                    <option value='ai_optional'>Template + optional AI refine</option>
                                </select>
                                <label className='sr-only' htmlFor='thread-title-model-input'>
                                    Thread title AI model
                                </label>
                                <input
                                    id='thread-title-model-input'
                                    name='threadTitleAiModel'
                                    type='text'
                                    value={controller.threadTitleAiModelInput}
                                    onChange={(event) => {
                                        controller.setThreadTitleAiModelInput(event.target.value);
                                    }}
                                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                                    autoComplete='off'
                                    placeholder='Title AI model id (for example openai/gpt-5-mini)…'
                                />
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={
                                        controller.setThreadTitlePreferenceMutation.isPending ||
                                        controller.threadTitleAiModelInput.trim().length === 0
                                    }
                                    onClick={() => {
                                        void controller.saveThreadTitleAiModel();
                                    }}>
                                    Save AI Model
                                </Button>
                            </div>
                        </section>
                    ) : null}

                    <section className='border-destructive/30 bg-destructive/5 space-y-3 rounded-lg border p-3'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>Factory Reset App Data</p>
                            <p className='text-muted-foreground text-xs'>
                                Deletes all app-owned chats, profiles, permissions, provider state, worktree records,
                                managed worktrees, global assets, and logs. Workspace-local
                                <code className='mx-1 rounded bg-black/5 px-1 py-0.5 text-[11px]'>.neonconductor</code>
                                files inside your repositories are not removed.
                            </p>
                        </div>
                        <Button
                            type='button'
                            size='sm'
                            variant='destructive'
                            disabled={controller.factoryResetMutation.isPending}
                            onClick={() => {
                                controller.setConfirmFactoryResetOpen(true);
                            }}>
                            Factory Reset App Data
                        </Button>
                    </section>

                </div>
            </div>

            <ConfirmDialog
                open={controller.confirmDeleteOpen}
                title='Delete Profile'
                message='Delete this profile and all local profile-scoped runtime data? This cannot be undone.'
                confirmLabel='Delete profile'
                destructive
                busy={controller.deleteMutation.isPending}
                onCancel={() => {
                    controller.setConfirmDeleteOpen(false);
                }}
                onConfirm={() => {
                    void controller.deleteProfile();
                }}
            />
            <ConfirmDialog
                open={controller.confirmFactoryResetOpen}
                title='Factory Reset App Data'
                message='This removes all app-owned data and recreates a fresh default profile. Type the confirmation phrase to continue.'
                confirmLabel='Reset app data'
                destructive
                busy={controller.factoryResetMutation.isPending}
                confirmDisabled={
                    controller.factoryResetConfirmationText !== controller.factoryResetConfirmationPhrase
                }
                onCancel={() => {
                    controller.setConfirmFactoryResetOpen(false);
                    controller.setFactoryResetConfirmationText('');
                }}
                onConfirm={() => {
                    void controller.factoryResetAppData();
                }}>
                <div className='space-y-2'>
                    <p className='text-muted-foreground text-xs'>
                        Enter <span className='font-semibold'>{controller.factoryResetConfirmationPhrase}</span> to
                        confirm.
                    </p>
                    <input
                        type='text'
                        value={controller.factoryResetConfirmationText}
                        onChange={(event) => {
                            controller.setFactoryResetConfirmationText(event.target.value);
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                        placeholder={controller.factoryResetConfirmationPhrase}
                    />
                </div>
            </ConfirmDialog>
        </section>
    );
}

import { useProfileSettingsController } from '@/web/components/settings/profileSettings/useProfileSettingsController';
import { ProfileCreateSection } from '@/web/components/settings/profileSettings/profileCreateSection';
import { ProfileDangerSection } from '@/web/components/settings/profileSettings/profileDangerSection';
import { ProfileSelectedSection } from '@/web/components/settings/profileSettings/profileSelectedSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
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
    const executionPreset =
        controller.executionPresetQuery.data?.preset === 'privacy' ||
        controller.executionPresetQuery.data?.preset === 'standard' ||
        controller.executionPresetQuery.data?.preset === 'yolo'
            ? controller.executionPresetQuery.data.preset
            : 'standard';
    const editPreference =
        controller.editPreferenceQuery.data?.value === 'ask' ||
        controller.editPreferenceQuery.data?.value === 'truncate' ||
        controller.editPreferenceQuery.data?.value === 'branch'
            ? controller.editPreferenceQuery.data.value
            : 'ask';
    const threadTitleMode =
        controller.threadTitlePreferenceQuery.data?.mode === 'template' ||
        controller.threadTitlePreferenceQuery.data?.mode === 'ai_optional'
            ? controller.threadTitlePreferenceQuery.data.mode
            : 'template';

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
                    <ProfileCreateSection
                        value={controller.newProfileName}
                        isPending={controller.createMutation.isPending}
                        onValueChange={controller.setNewProfileName}
                        onCreate={() => {
                            void controller.createProfile();
                        }}
                    />

                    {controller.selectedProfile ? (
                        <ProfileSelectedSection
                            activeProfileId={activeProfileId}
                            selectedProfile={controller.selectedProfile}
                            renameValue={controller.renameValue}
                            isRenaming={controller.renameMutation.isPending}
                            isDuplicating={controller.duplicateMutation.isPending}
                            isSettingActive={controller.setActiveMutation.isPending}
                            cannotDeleteLastProfile={controller.cannotDeleteLastProfile}
                            isDeleting={controller.deleteMutation.isPending}
                            executionPreset={executionPreset}
                            isSavingExecutionPreset={controller.setExecutionPresetMutation.isPending}
                            editPreference={editPreference}
                            isSavingEditPreference={controller.setEditPreferenceMutation.isPending}
                            threadTitleMode={threadTitleMode}
                            threadTitleAiModelInput={controller.threadTitleAiModelInput}
                            isSavingThreadTitlePreference={controller.setThreadTitlePreferenceMutation.isPending}
                            onRenameValueChange={controller.setRenameValue}
                            onRename={() => {
                                void controller.renameProfile();
                            }}
                            onDuplicate={() => {
                                void controller.duplicateProfile();
                            }}
                            onActivate={() => {
                                void controller.activateProfile();
                            }}
                            onOpenDelete={() => {
                                controller.setConfirmDeleteOpen(true);
                            }}
                            onExecutionPresetChange={(value) => {
                                void controller.updateExecutionPreset(value);
                            }}
                            onEditPreferenceChange={(value) => {
                                void controller.updateEditPreference(value);
                            }}
                            onThreadTitleModeChange={(value) => {
                                void controller.updateThreadTitleMode(value);
                            }}
                            onThreadTitleAiModelInputChange={controller.setThreadTitleAiModelInput}
                            onSaveThreadTitleAiModel={() => {
                                void controller.saveThreadTitleAiModel();
                            }}
                        />
                    ) : null}

                    <ProfileDangerSection
                        isPending={controller.factoryResetMutation.isPending}
                        onOpenFactoryReset={() => {
                            controller.setConfirmFactoryResetOpen(true);
                        }}
                    />

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

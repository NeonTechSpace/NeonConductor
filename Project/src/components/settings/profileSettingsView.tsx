import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { ProfileCreateSection } from '@/web/components/settings/profileSettings/profileCreateSection';
import { useProfileSettingsController } from '@/web/components/settings/profileSettings/useProfileSettingsController';
import {
    PROFILE_SETTINGS_SUBSECTIONS,
    type ProfileSettingsSubsectionId,
} from '@/web/components/settings/settingsNavigation';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import { Button } from '@/web/components/ui/button';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';

interface ProfileSettingsViewProps {
    activeProfileId: string;
    onProfileActivated: (profileId: string) => void;
    subsection?: ProfileSettingsSubsectionId;
    onSubsectionChange?: (subsection: ProfileSettingsSubsectionId) => void;
}

function ProfileSectionHeader({
    eyebrow,
    title,
    description,
    selectedProfileId,
    profiles,
    onSelectProfile,
}: {
    eyebrow: string;
    title: string;
    description: string;
    selectedProfileId: string | undefined;
    profiles: Array<{ id: string; name: string }>;
    onSelectProfile: (profileId: string) => void;
}) {
    return (
        <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
            <div className='space-y-2'>
                <p className='text-primary text-[11px] font-semibold tracking-[0.16em] uppercase'>{eyebrow}</p>
                <div className='space-y-1'>
                    <h4 className='text-xl font-semibold text-balance'>{title}</h4>
                    <p className='text-muted-foreground max-w-3xl text-sm leading-6'>{description}</p>
                </div>
            </div>

            <label className='space-y-1'>
                <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>
                    Selected Profile
                </span>
                <select
                    aria-label='Selected profile'
                    className='border-border bg-background h-10 min-w-[220px] rounded-xl border px-3 text-sm'
                    value={selectedProfileId ?? ''}
                    onChange={(event) => {
                        const nextProfileId = event.target.value.trim();
                        if (nextProfileId.length > 0) {
                            onSelectProfile(nextProfileId);
                        }
                    }}>
                    {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                            {profile.name}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}

function ProfileManagementScreen({
    controller,
    activeProfileId,
}: {
    controller: ReturnType<typeof useProfileSettingsController>;
    activeProfileId: string;
}) {
    const selectedProfile = controller.library.selectedProfile;
    if (!selectedProfile) {
        return null;
    }

    return (
        <div className='space-y-5'>
            <ProfileSectionHeader
                eyebrow='Profiles'
                title='Profile Management'
                description='Rename, duplicate, activate, delete, and create profiles without nesting another persistent rail inside Settings.'
                selectedProfileId={controller.selection.selectedProfileId}
                profiles={controller.selection.profiles}
                onSelectProfile={(profileId) => {
                    controller.selection.setSelectedProfileId(profileId);
                }}
            />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Identity</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Change the selected profile name, duplicate it, or switch the active profile used elsewhere in
                        the shell.
                    </p>
                </div>

                <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]'>
                    <label className='sr-only' htmlFor='profile-rename-input'>
                        Profile name
                    </label>
                    <input
                        id='profile-rename-input'
                        name='profileRename'
                        type='text'
                        value={controller.library.renameValue}
                        onChange={(event) => {
                            controller.library.setRenameValue(event.target.value);
                        }}
                        className='border-border bg-background h-10 rounded-xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='Profile name…'
                    />
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={
                            controller.library.renameMutation.isPending ||
                            controller.library.renameValue.trim().length === 0 ||
                            controller.library.renameValue.trim() === selectedProfile.name
                        }
                        onClick={() => {
                            void controller.library.renameProfile();
                        }}>
                        Rename
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={controller.library.duplicateMutation.isPending}
                        onClick={() => {
                            void controller.library.duplicateProfile();
                        }}>
                        Duplicate
                    </Button>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={controller.library.setActiveMutation.isPending || selectedProfile.id === activeProfileId}
                        onClick={() => {
                            void controller.library.activateProfile();
                        }}>
                        {selectedProfile.id === activeProfileId ? 'Active' : 'Set Active'}
                    </Button>

                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={controller.library.cannotDeleteLastProfile || controller.library.deleteMutation.isPending}
                        onClick={() => {
                            controller.library.setConfirmDeleteOpen(true);
                        }}>
                        Delete
                    </Button>
                    <span className='text-muted-foreground text-xs'>
                        {controller.library.cannotDeleteLastProfile
                            ? 'Cannot delete the last remaining profile.'
                            : 'Deletion removes local profile-scoped data.'}
                    </span>
                </div>
            </section>

            <ProfileCreateSection
                value={controller.library.newProfileName}
                isPending={controller.library.createMutation.isPending}
                onValueChange={controller.library.setNewProfileName}
                onCreate={() => {
                    void controller.library.createProfile();
                }}
            />
        </div>
    );
}

function ProfileExecutionScreen({ controller }: { controller: ReturnType<typeof useProfileSettingsController> }) {
    return (
        <div className='space-y-5'>
            <ProfileSectionHeader
                eyebrow='Profiles'
                title='Execution Defaults'
                description='Keep profile-level runtime approvals and edit-flow defaults together instead of burying them in profile management.'
                selectedProfileId={controller.selection.selectedProfileId}
                profiles={controller.selection.profiles}
                onSelectProfile={(profileId) => {
                    controller.selection.setSelectedProfileId(profileId);
                }}
            />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Execution preset</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Controls default runtime approval behavior for workspace-scoped tool access.
                    </p>
                </div>
                <select
                    aria-label='Execution preset'
                    className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                    value={controller.preferences.executionPreset}
                    disabled={controller.preferences.setExecutionPresetMutation.isPending}
                    onChange={(event) => {
                        const nextPreset = event.target.value;
                        if (nextPreset !== 'privacy' && nextPreset !== 'standard' && nextPreset !== 'yolo') {
                            return;
                        }

                        void controller.preferences.updateExecutionPreset(nextPreset);
                    }}>
                    <option value='privacy'>Privacy: ask on every tool</option>
                    <option value='standard'>Standard: allow safe workspace reads</option>
                    <option value='yolo'>Yolo: auto-allow safe reads, deny unsafe boundaries</option>
                </select>
            </section>

            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Conversation edit behavior</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Controls default behavior when editing earlier user messages.
                    </p>
                </div>
                <select
                    aria-label='Conversation edit behavior'
                    className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                    value={controller.preferences.editPreference}
                    disabled={controller.preferences.setEditPreferenceMutation.isPending}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        if (nextValue !== 'ask' && nextValue !== 'truncate' && nextValue !== 'branch') {
                            return;
                        }

                        void controller.preferences.updateEditPreference(nextValue);
                    }}>
                    <option value='ask'>Ask every time</option>
                    <option value='truncate'>Always truncate</option>
                    <option value='branch'>Always branch</option>
                </select>
            </section>
        </div>
    );
}

function ProfileConversationNamingScreen({
    controller,
}: {
    controller: ReturnType<typeof useProfileSettingsController>;
}) {
    return (
        <div className='space-y-5'>
            <ProfileSectionHeader
                eyebrow='Profiles'
                title='Conversation Naming'
                description='Control how new conversation names are generated. AI refinement now uses the shared Utility AI model and falls back to the active conversation model when Utility AI is unset or unavailable.'
                selectedProfileId={controller.selection.selectedProfileId}
                profiles={controller.selection.profiles}
                onSelectProfile={(profileId) => {
                    controller.selection.setSelectedProfileId(profileId);
                }}
            />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Conversation naming mode</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Template naming is the baseline path. Optional AI refinement uses the shared Utility AI
                        selection from the adjacent profile subsection.
                    </p>
                </div>
                <select
                    aria-label='Conversation naming mode'
                    className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                    value={controller.preferences.threadTitleMode}
                    disabled={controller.preferences.setThreadTitlePreferenceMutation.isPending}
                    onChange={(event) => {
                        const nextMode = event.target.value;
                        if (nextMode !== 'template' && nextMode !== 'ai_optional') {
                            return;
                        }

                        void controller.preferences.updateThreadTitleMode(nextMode);
                    }}>
                    <option value='template'>Template only</option>
                    <option value='ai_optional'>Template + optional AI refine</option>
                </select>
            </section>
        </div>
    );
}

function ProfileUtilityAiScreen({
    controller,
}: {
    controller: ReturnType<typeof useProfileSettingsController>;
}) {
    return (
        <div className='space-y-5'>
            <ProfileSectionHeader
                eyebrow='Profiles'
                title='Utility AI'
                description='Choose the shared small utility model used for conversation naming, context compaction, and future lightweight utility tasks.'
                selectedProfileId={controller.selection.selectedProfileId}
                profiles={controller.selection.profiles}
                onSelectProfile={(profileId) => {
                    controller.selection.setSelectedProfileId(profileId);
                }}
            />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Shared utility model</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Neon uses this model for context compaction, conversation naming, and similar low-stakes
                        background work. If it is unset or unavailable, Neon falls back to the active conversation
                        model.
                    </p>
                </div>

                <div className='grid gap-4 md:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)]'>
                    <label className='space-y-2'>
                        <span className='text-sm font-medium'>Provider</span>
                        <select
                            aria-label='Utility AI provider'
                            className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                            value={controller.preferences.selectedUtilityProviderId ?? ''}
                            disabled={controller.preferences.setUtilityModelMutation.isPending}
                            onChange={(event) => {
                                const nextProviderId = controller.preferences.utilityProviderItems.find(
                                    (provider) => provider.id === event.target.value
                                )?.id;
                                controller.preferences.setUtilityProviderId(nextProviderId);
                            }}>
                            {controller.preferences.utilityProviderItems.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                    {provider.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className='space-y-2'>
                        <span className='text-sm font-medium'>Model</span>
                        <ModelPicker
                            providerId={controller.preferences.selectedUtilityProviderId}
                            selectedModelId={controller.preferences.selectedUtilityModelId}
                            models={controller.preferences.utilityModelOptions}
                            ariaLabel='Utility AI model'
                            placeholder='Select a utility model'
                            disabled={controller.preferences.setUtilityModelMutation.isPending}
                            onSelectModel={controller.preferences.setUtilityModelId}
                            onSelectOption={(option) => {
                                if (
                                    option.providerId &&
                                    option.providerId !== controller.preferences.selectedUtilityProviderId
                                ) {
                                    controller.preferences.setUtilityProviderId(option.providerId);
                                }
                                controller.preferences.setUtilityModelId(option.id);
                            }}
                        />
                        {controller.preferences.selectedUtilityModelOption?.compatibilityReason ? (
                            <p className='text-muted-foreground text-xs'>
                                {controller.preferences.selectedUtilityModelOption.compatibilityReason}
                            </p>
                        ) : null}
                    </label>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={
                            controller.preferences.setUtilityModelMutation.isPending ||
                            !controller.preferences.selectedUtilityProviderId ||
                            controller.preferences.selectedUtilityModelId.length === 0
                        }
                        onClick={() => {
                            void controller.preferences.saveUtilityModel();
                        }}>
                        Save Utility AI
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={
                            controller.preferences.setUtilityModelMutation.isPending ||
                            !controller.preferences.utilityModelSelection
                        }
                        onClick={() => {
                            void controller.preferences.clearUtilityModel();
                        }}>
                        Clear
                    </Button>
                    <span className='text-muted-foreground text-xs'>
                        {controller.preferences.utilityModelSelection
                            ? `Saved model: ${controller.preferences.utilityModelSelection.providerId}/${controller.preferences.utilityModelSelection.modelId}`
                            : 'No Utility AI saved. Neon currently falls back to the active conversation model.'}
                    </span>
                </div>
            </section>
        </div>
    );
}

export function ProfileSettingsView({
    activeProfileId,
    onProfileActivated,
    subsection = 'management',
    onSubsectionChange,
}: ProfileSettingsViewProps) {
    const controller = useProfileSettingsController({
        activeProfileId,
        onProfileActivated,
    });

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]'>
            <SettingsSelectionRail
                title='Profiles'
                ariaLabel='Profile settings sections'
                selectedId={subsection}
                onSelect={(itemId) => {
                    const nextSection = PROFILE_SETTINGS_SUBSECTIONS.find((candidate) => candidate.id === itemId);
                    if (!nextSection || nextSection.availability !== 'available') {
                        return;
                    }

                    onSubsectionChange?.(nextSection.id);
                }}
                items={PROFILE_SETTINGS_SUBSECTIONS.map((item) => ({
                    id: item.id,
                    title: item.label,
                    subtitle: item.description,
                    ...(item.availability === 'planned' ? { meta: 'Planned', disabled: true } : {}),
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-5 md:p-6'>
                {subsection === 'management' ? (
                    <ProfileManagementScreen controller={controller} activeProfileId={activeProfileId} />
                ) : null}
                {subsection === 'execution' ? <ProfileExecutionScreen controller={controller} /> : null}
                {subsection === 'naming' ? <ProfileConversationNamingScreen controller={controller} /> : null}
                {subsection === 'utility' ? <ProfileUtilityAiScreen controller={controller} /> : null}
            </div>

            <ConfirmDialog
                open={controller.library.confirmDeleteOpen}
                title='Delete Profile'
                message='Delete this profile and all local profile-scoped runtime data? This cannot be undone.'
                confirmLabel='Delete profile'
                destructive
                busy={controller.library.deleteMutation.isPending}
                onCancel={() => {
                    controller.library.setConfirmDeleteOpen(false);
                }}
                onConfirm={() => {
                    void controller.library.deleteProfile();
                }}
            />
        </section>
    );
}

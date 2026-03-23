import { useProfileSettingsController } from '@/web/components/settings/profileSettings/useProfileSettingsController';
import { ProfileCreateSection } from '@/web/components/settings/profileSettings/profileCreateSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsPlannedSection } from '@/web/components/settings/shared/settingsPlannedSection';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import {
    PROFILE_SETTINGS_SUBSECTIONS,
    type ProfileSettingsSubsectionId,
} from '@/web/components/settings/settingsNavigation';
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
    const selectedProfile = controller.selectedProfile;
    if (!selectedProfile) {
        return null;
    }

    return (
        <div className='space-y-5'>
            <ProfileSectionHeader
                eyebrow='Profiles'
                title='Profile Management'
                description='Rename, duplicate, activate, delete, and create profiles without nesting another persistent rail inside Settings.'
                selectedProfileId={controller.selectedProfileId}
                profiles={controller.profiles}
                onSelectProfile={(profileId) => {
                    controller.setSelectedProfileId(profileId);
                }}
            />

            <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />

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
                        value={controller.renameValue}
                        onChange={(event) => {
                            controller.setRenameValue(event.target.value);
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
                            controller.renameMutation.isPending ||
                            controller.renameValue.trim().length === 0 ||
                            controller.renameValue.trim() === selectedProfile.name
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
                        disabled={controller.setActiveMutation.isPending || selectedProfile.id === activeProfileId}
                        onClick={() => {
                            void controller.activateProfile();
                        }}>
                        {selectedProfile.id === activeProfileId ? 'Active' : 'Set Active'}
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
            </section>

            <ProfileCreateSection
                value={controller.newProfileName}
                isPending={controller.createMutation.isPending}
                onValueChange={controller.setNewProfileName}
                onCreate={() => {
                    void controller.createProfile();
                }}
            />
        </div>
    );
}

function ProfileExecutionScreen({
    controller,
}: {
    controller: ReturnType<typeof useProfileSettingsController>;
}) {
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

    return (
        <div className='space-y-5'>
            <ProfileSectionHeader
                eyebrow='Profiles'
                title='Execution Defaults'
                description='Keep profile-level runtime approvals and edit-flow defaults together instead of burying them in profile management.'
                selectedProfileId={controller.selectedProfileId}
                profiles={controller.profiles}
                onSelectProfile={(profileId) => {
                    controller.setSelectedProfileId(profileId);
                }}
            />

            <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />

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
                    value={executionPreset}
                    disabled={controller.setExecutionPresetMutation.isPending}
                    onChange={(event) => {
                        const nextPreset = event.target.value;
                        if (nextPreset !== 'privacy' && nextPreset !== 'standard' && nextPreset !== 'yolo') {
                            return;
                        }

                        void controller.updateExecutionPreset(nextPreset);
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
                    value={editPreference}
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
            </section>
        </div>
    );
}

function ProfileConversationNamingScreen({
    controller,
}: {
    controller: ReturnType<typeof useProfileSettingsController>;
}) {
    const threadTitleMode =
        controller.threadTitlePreferenceQuery.data?.mode === 'template' ||
        controller.threadTitlePreferenceQuery.data?.mode === 'ai_optional'
            ? controller.threadTitlePreferenceQuery.data.mode
            : 'template';

    return (
        <div className='space-y-5'>
            <ProfileSectionHeader
                eyebrow='Profiles'
                title='Conversation Naming'
                description='Control how new conversation names are generated. The future utility-model surface will replace the raw model override below.'
                selectedProfileId={controller.selectedProfileId}
                profiles={controller.profiles}
                onSelectProfile={(profileId) => {
                    controller.setSelectedProfileId(profileId);
                }}
            />

            <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />

            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Conversation naming mode</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Template naming is the baseline path. AI refinement remains an interim per-profile override
                        until Utility AI lands in its own subsection.
                    </p>
                </div>
                <select
                    aria-label='Conversation naming mode'
                    className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                    value={threadTitleMode}
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

                <label className='space-y-1'>
                    <span className='text-muted-foreground text-xs'>Interim AI model override</span>
                    <input
                        id='thread-title-model-input'
                        name='threadTitleAiModel'
                        type='text'
                        value={controller.threadTitleAiModelInput}
                        onChange={(event) => {
                            controller.setThreadTitleAiModelInput(event.target.value);
                        }}
                        className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='Title AI model id (for example openai/gpt-5-mini)…'
                    />
                </label>
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
                {subsection === 'utility' ? (
                    <SettingsPlannedSection
                        eyebrow='Profiles'
                        title='Utility AI'
                        description='The shared utility model will live here once conversation naming and commit-message generation move off dedicated raw model settings.'
                    />
                ) : null}
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
        </section>
    );
}

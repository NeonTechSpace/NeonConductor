import { type ProfileRenameDraft } from '@/web/components/settings/profileSettings/drafts';
import {
    getActivateProfileStatusMessage,
    getDeleteProfileStatusMessage,
    getDuplicateProfileStatusMessage,
    getRenameProfileStatusMessage,
} from '@/web/components/settings/profileSettings/messages';

import type { ProfileRecord } from '@/app/backend/persistence/types';

type EditPreferenceMutation = {
    mutateAsync: (input: { profileId: string; value: 'ask' | 'truncate' | 'branch' }) => Promise<void>;
};

type ThreadTitlePreferenceMutation = {
    mutateAsync: (input: {
        profileId: string;
        mode: 'template' | 'ai_optional';
        aiModel?: string;
    }) => Promise<void>;
};

export function createProfileLibraryActions(input: {
    activeProfileId: string;
    selectedProfile: ProfileRecord | undefined;
    newProfileName: string;
    renameValue: string;
    updateProfileList: (updater: (profiles: ProfileRecord[]) => ProfileRecord[]) => void;
    setActiveProfileCache: (profileId: string) => void;
    createMutation: { mutateAsync: (input: { name?: string }) => Promise<{ profile: ProfileRecord }> };
    renameMutation: {
        mutateAsync: (input: {
            profileId: string;
            name: string;
        }) => Promise<{ updated: false; reason: 'profile_not_found' } | { updated: true; profile: ProfileRecord }>;
    };
    duplicateMutation: {
        mutateAsync: (input: {
            profileId: string;
        }) => Promise<
            { duplicated: false; reason: 'profile_not_found' } | { duplicated: true; profile: ProfileRecord }
        >;
    };
    deleteMutation: {
        mutateAsync: (input: { profileId: string }) => Promise<{
            deleted: boolean;
            reason?: 'last_profile' | 'profile_not_found';
            activeProfileId?: string;
        }>;
    };
    setActiveMutation: {
        mutateAsync: (input: {
            profileId: string;
        }) => Promise<{ updated: false; reason: 'profile_not_found' } | { updated: true; profile: ProfileRecord }>;
    };
    setNewProfileName: (value: string) => void;
    setRenameDraft: (value: ProfileRenameDraft | undefined) => void;
    setSelectedProfileId: (value: string | undefined) => void;
    setStatusMessage: (value: string | undefined) => void;
    setConfirmDeleteOpen: (value: boolean) => void;
    onProfileActivated: (profileId: string) => void;
}) {
    return {
        createProfile: async () => {
            const result = await input.createMutation.mutateAsync({
                ...(input.newProfileName.trim() ? { name: input.newProfileName.trim() } : {}),
            });
            input.setStatusMessage(`Created profile "${result.profile.name}".`);
            input.setNewProfileName('');
            input.setSelectedProfileId(result.profile.id);
            input.updateProfileList((profiles) => [...profiles, result.profile]);
        },
        renameProfile: async () => {
            if (!input.selectedProfile) {
                return;
            }

            const result = await input.renameMutation.mutateAsync({
                profileId: input.selectedProfile.id,
                name: input.renameValue.trim(),
            });
            input.setStatusMessage(
                getRenameProfileStatusMessage({
                    updated: result.updated,
                    profileName: result.updated ? result.profile.name : undefined,
                })
            );
            if (!result.updated) {
                return;
            }

            input.setRenameDraft(undefined);
            input.updateProfileList((profiles) =>
                profiles.map((profile) =>
                    profile.id === input.selectedProfile?.id
                        ? {
                              ...profile,
                              name: result.profile.name,
                          }
                        : profile
                )
            );
        },
        duplicateProfile: async () => {
            if (!input.selectedProfile) {
                return;
            }

            const result = await input.duplicateMutation.mutateAsync({
                profileId: input.selectedProfile.id,
            });
            input.setStatusMessage(
                getDuplicateProfileStatusMessage({
                    duplicated: result.duplicated,
                    profileName: result.duplicated ? result.profile.name : undefined,
                })
            );
            if (!result.duplicated) {
                return;
            }

            input.setRenameDraft(undefined);
            input.setSelectedProfileId(result.profile.id);
            input.updateProfileList((profiles) => [...profiles, result.profile]);
        },
        activateProfile: async () => {
            if (!input.selectedProfile || input.selectedProfile.id === input.activeProfileId) {
                return;
            }

            const result = await input.setActiveMutation.mutateAsync({
                profileId: input.selectedProfile.id,
            });
            input.setStatusMessage(
                getActivateProfileStatusMessage({
                    updated: result.updated,
                    profileName: result.updated ? result.profile.name : undefined,
                })
            );
            if (!result.updated) {
                return;
            }

            input.setRenameDraft(undefined);
            input.onProfileActivated(result.profile.id);
            input.setActiveProfileCache(result.profile.id);
        },
        deleteProfile: async () => {
            if (!input.selectedProfile) {
                input.setConfirmDeleteOpen(false);
                return;
            }

            const result = await input.deleteMutation.mutateAsync({
                profileId: input.selectedProfile.id,
            });
            input.setConfirmDeleteOpen(false);
            input.setStatusMessage(
                getDeleteProfileStatusMessage({
                    deleted: result.deleted,
                    reason: result.reason,
                })
            );
            if (!result.deleted) {
                return;
            }

            if (result.activeProfileId) {
                input.onProfileActivated(result.activeProfileId);
                input.setActiveProfileCache(result.activeProfileId);
            }
            input.setRenameDraft(undefined);
            input.setSelectedProfileId(undefined);
            input.updateProfileList((profiles) =>
                profiles.filter((profile) => profile.id !== input.selectedProfile?.id)
            );
        },
    };
}

export function createProfilePreferencesActions(input: {
    selectedProfile: ProfileRecord | undefined;
    threadTitleAiModelInput: string;
    setEditPreferenceMutation: EditPreferenceMutation;
    setThreadTitlePreferenceMutation: ThreadTitlePreferenceMutation;
    setStatusMessage: (value: string | undefined) => void;
}) {
    return {
        updateEditPreference: async (value: 'ask' | 'truncate' | 'branch') => {
            if (!input.selectedProfile) {
                return;
            }

            await input.setEditPreferenceMutation.mutateAsync({
                profileId: input.selectedProfile.id,
                value,
            });
            input.setStatusMessage('Updated conversation edit behavior.');
        },
        updateThreadTitleMode: async (mode: 'template' | 'ai_optional') => {
            if (!input.selectedProfile) {
                return;
            }

            if (mode === 'ai_optional' && input.threadTitleAiModelInput.trim().length === 0) {
                input.setStatusMessage(
                    'Set a title AI model (for example "openai/gpt-5-mini") before enabling AI optional mode.'
                );
                return;
            }

            await input.setThreadTitlePreferenceMutation.mutateAsync({
                profileId: input.selectedProfile.id,
                mode,
                ...(mode === 'ai_optional' ? { aiModel: input.threadTitleAiModelInput.trim() } : {}),
            });
            input.setStatusMessage('Updated thread title generation settings.');
        },
        saveThreadTitleAiModel: async () => {
            if (!input.selectedProfile || input.threadTitleAiModelInput.trim().length === 0) {
                return;
            }

            await input.setThreadTitlePreferenceMutation.mutateAsync({
                profileId: input.selectedProfile.id,
                mode: 'ai_optional',
                aiModel: input.threadTitleAiModelInput.trim(),
            });
            input.setStatusMessage('Updated title AI model.');
        },
    };
}

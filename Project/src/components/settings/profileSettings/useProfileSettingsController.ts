import { useEffect, useState } from 'react';

import { createProfileSettingsActions } from '@/web/components/settings/profileSettings/actions';
import { resolveSelectedProfileId } from '@/web/components/settings/profileSettings/selection';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { invalidateRuntimeResetQueries } from '@/web/lib/runtime/invalidation/queryInvalidation';
import { trpc } from '@/web/trpc/client';

import type { ProfileRecord } from '@/app/backend/persistence/types';
import { FACTORY_RESET_CONFIRMATION_TEXT } from '@/app/backend/runtime/contracts';

export function useProfileSettingsController(input: {
    activeProfileId: string;
    onProfileActivated: (profileId: string) => void;
}) {
    const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);
    const [newProfileName, setNewProfileName] = useState('');
    const [renameValue, setRenameValue] = useState('');
    const [threadTitleAiModelInput, setThreadTitleAiModelInput] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [confirmFactoryResetOpen, setConfirmFactoryResetOpen] = useState(false);
    const [factoryResetConfirmationText, setFactoryResetConfirmationText] = useState('');

    const utils = trpc.useUtils();
    const profilesQuery = trpc.profile.list.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const createMutation = trpc.profile.create.useMutation();
    const renameMutation = trpc.profile.rename.useMutation();
    const duplicateMutation = trpc.profile.duplicate.useMutation();
    const deleteMutation = trpc.profile.delete.useMutation();
    const setActiveMutation = trpc.profile.setActive.useMutation();
    const factoryResetMutation = trpc.runtime.factoryReset.useMutation({
        onSuccess: async (result) => {
            setConfirmFactoryResetOpen(false);
            setFactoryResetConfirmationText('');
            setSelectedProfileId(result.resetProfileId);
            input.onProfileActivated(result.resetProfileId);
            await invalidateRuntimeResetQueries(utils);
            setStatusMessage('Factory reset completed. App data was reset to the default profile.');
        },
    });

    const profiles = profilesQuery.data?.profiles ?? [];

    useEffect(() => {
        const nextSelectedProfileId = resolveSelectedProfileId(profiles, selectedProfileId, input.activeProfileId);
        if (nextSelectedProfileId !== selectedProfileId) {
            setSelectedProfileId(nextSelectedProfileId);
        }
    }, [input.activeProfileId, profiles, selectedProfileId]);

    const selectedProfile = selectedProfileId ? profiles.find((profile) => profile.id === selectedProfileId) : undefined;
    const selectedProfileIdForSettings = selectedProfileId ?? input.activeProfileId;

    function updateProfileList(
        updater: (profiles: ProfileRecord[]) => ProfileRecord[]
    ) {
        utils.profile.list.setData(undefined, (current) => {
            if (!current) {
                return current;
            }

            return {
                profiles: updater(current.profiles),
            };
        });
    }

    function setActiveProfileCache(profileId: string) {
        const nextActiveProfile = profiles.find((profile) => profile.id === profileId);
        if (!nextActiveProfile) {
            return;
        }

        utils.profile.getActive.setData(undefined, {
            activeProfileId: profileId,
            profile: nextActiveProfile,
        });
        updateProfileList((profiles) =>
            profiles.map((profile) => ({
                ...profile,
                isActive: profile.id === profileId,
            }))
        );
    }

    const editPreferenceQuery = trpc.conversation.getEditPreference.useQuery(
        {
            profileId: selectedProfileIdForSettings,
        },
        {
            enabled: Boolean(selectedProfileIdForSettings),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const setEditPreferenceMutation = trpc.conversation.setEditPreference.useMutation({
        onMutate: async (variables) => {
            await utils.conversation.getEditPreference.cancel({
                profileId: variables.profileId,
            });
            const previous = utils.conversation.getEditPreference.getData({
                profileId: variables.profileId,
            });
            utils.conversation.getEditPreference.setData(
                {
                    profileId: variables.profileId,
                },
                {
                    value: variables.value,
                }
            );
            return {
                previous,
                profileId: variables.profileId,
            };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                utils.conversation.getEditPreference.setData(
                    {
                        profileId: context.profileId,
                    },
                    context.previous
                );
            }
        },
        onSuccess: (result, variables) => {
            utils.conversation.getEditPreference.setData(
                {
                    profileId: variables.profileId,
                },
                result
            );
        },
    });
    const threadTitlePreferenceQuery = trpc.conversation.getThreadTitlePreference.useQuery(
        {
            profileId: selectedProfileIdForSettings,
        },
        {
            enabled: Boolean(selectedProfileIdForSettings),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const setThreadTitlePreferenceMutation = trpc.conversation.setThreadTitlePreference.useMutation({
        onMutate: async (variables) => {
            await utils.conversation.getThreadTitlePreference.cancel({
                profileId: variables.profileId,
            });
            const previous = utils.conversation.getThreadTitlePreference.getData({
                profileId: variables.profileId,
            });
            utils.conversation.getThreadTitlePreference.setData(
                {
                    profileId: variables.profileId,
                },
                {
                    mode: variables.mode,
                    ...(variables.aiModel ? { aiModel: variables.aiModel } : {}),
                }
            );
            return {
                previous,
                profileId: variables.profileId,
            };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                utils.conversation.getThreadTitlePreference.setData(
                    {
                        profileId: context.profileId,
                    },
                    context.previous
                );
            }
        },
        onSuccess: (result, variables) => {
            utils.conversation.getThreadTitlePreference.setData(
                {
                    profileId: variables.profileId,
                },
                result
            );
        },
    });
    const setEditPreference = async (input: {
        profileId: string;
        value: 'ask' | 'truncate' | 'branch';
    }): Promise<void> => {
        await setEditPreferenceMutation.mutateAsync(input);
    };
    const setThreadTitlePreference = async (input: {
        profileId: string;
        mode: 'template' | 'ai_optional';
        aiModel?: string;
    }): Promise<void> => {
        await setThreadTitlePreferenceMutation.mutateAsync(input);
    };
    const executionPresetQuery = trpc.profile.getExecutionPreset.useQuery(
        {
            profileId: selectedProfileIdForSettings,
        },
        {
            enabled: Boolean(selectedProfileIdForSettings),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const setExecutionPresetMutation = trpc.profile.setExecutionPreset.useMutation({
        onMutate: async (variables) => {
            await utils.profile.getExecutionPreset.cancel({
                profileId: variables.profileId,
            });
            const previous = utils.profile.getExecutionPreset.getData({
                profileId: variables.profileId,
            });
            utils.profile.getExecutionPreset.setData(
                {
                    profileId: variables.profileId,
                },
                {
                    preset: variables.preset,
                }
            );
            return {
                previous,
                profileId: variables.profileId,
            };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                utils.profile.getExecutionPreset.setData(
                    {
                        profileId: context.profileId,
                    },
                    context.previous
                );
            }
        },
        onSuccess: (result, variables) => {
            utils.profile.getExecutionPreset.setData(
                {
                    profileId: variables.profileId,
                },
                result
            );
            utils.runtime.getShellBootstrap.setData(
                {
                    profileId: variables.profileId,
                },
                (current) =>
                    current
                        ? {
                              ...current,
                              executionPreset: result.preset,
                          }
                        : current
            );
        },
    });

    useEffect(() => {
        setRenameValue(selectedProfile?.name ?? '');
    }, [selectedProfile?.id, selectedProfile?.name]);

    useEffect(() => {
        const aiModel = threadTitlePreferenceQuery.data?.aiModel ?? '';
        setThreadTitleAiModelInput(aiModel);
    }, [threadTitlePreferenceQuery.data?.aiModel, threadTitlePreferenceQuery.data?.mode]);

    const actions = createProfileSettingsActions({
        activeProfileId: input.activeProfileId,
        selectedProfile,
        newProfileName,
        renameValue,
        threadTitleAiModelInput,
        updateProfileList,
        setActiveProfileCache,
        createMutation,
        renameMutation,
        duplicateMutation,
        deleteMutation,
        setActiveMutation,
        setEditPreferenceMutation: {
            mutateAsync: setEditPreference,
        },
        setThreadTitlePreferenceMutation: {
            mutateAsync: setThreadTitlePreference,
        },
        setNewProfileName,
        setSelectedProfileId,
        setStatusMessage,
        setConfirmDeleteOpen,
        onProfileActivated: input.onProfileActivated,
    });

    return {
        feedbackMessage:
            createMutation.error?.message ??
            renameMutation.error?.message ??
            duplicateMutation.error?.message ??
            deleteMutation.error?.message ??
            setActiveMutation.error?.message ??
            factoryResetMutation.error?.message ??
            setEditPreferenceMutation.error?.message ??
            setThreadTitlePreferenceMutation.error?.message ??
            setExecutionPresetMutation.error?.message ??
            statusMessage,
        feedbackTone:
            createMutation.error ??
            renameMutation.error ??
            duplicateMutation.error ??
            deleteMutation.error ??
            setActiveMutation.error ??
            factoryResetMutation.error ??
            setEditPreferenceMutation.error ??
            setThreadTitlePreferenceMutation.error ??
            setExecutionPresetMutation.error
                ? ('error' as const)
                : statusMessage
                  ? ('success' as const)
                  : ('info' as const),
        profiles,
        selectedProfile,
        selectedProfileId,
        newProfileName,
        renameValue,
        threadTitleAiModelInput,
        statusMessage,
        confirmDeleteOpen,
        confirmFactoryResetOpen,
        factoryResetConfirmationText,
        factoryResetConfirmationPhrase: FACTORY_RESET_CONFIRMATION_TEXT,
        cannotDeleteLastProfile: profiles.length <= 1,
        profilesQuery,
        createMutation,
        renameMutation,
        duplicateMutation,
        deleteMutation,
        setActiveMutation,
        factoryResetMutation,
        editPreferenceQuery,
        setEditPreferenceMutation,
        threadTitlePreferenceQuery,
        setThreadTitlePreferenceMutation,
        executionPresetQuery,
        setExecutionPresetMutation,
        setSelectedProfileId: (profileId: string | undefined) => {
            setSelectedProfileId(profileId);
            setStatusMessage(undefined);
        },
        setNewProfileName,
        setRenameValue,
        setThreadTitleAiModelInput,
        setStatusMessage,
        setConfirmDeleteOpen,
        setConfirmFactoryResetOpen,
        setFactoryResetConfirmationText,
        updateExecutionPreset: async (preset: 'privacy' | 'standard' | 'yolo') => {
            if (!selectedProfile) {
                return;
            }

            await setExecutionPresetMutation.mutateAsync({
                profileId: selectedProfile.id,
                preset,
            });
            setStatusMessage('Updated execution preset.');
        },
        factoryResetAppData: async () => {
            await factoryResetMutation.mutateAsync({
                confirm: true,
                confirmationText: factoryResetConfirmationText,
            });
        },
        ...actions,
    };
}

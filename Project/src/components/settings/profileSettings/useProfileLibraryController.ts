import { useState } from 'react';

import { createProfileLibraryActions } from '@/web/components/settings/profileSettings/actions';
import { resolveProfileRenameValue, type ProfileRenameDraft } from '@/web/components/settings/profileSettings/drafts';
import type { ProfileSelectionState } from '@/web/components/settings/profileSettings/useProfileSelectionState';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type { ProfileRecord } from '@/app/backend/persistence/types';

interface ProfileLibraryControllerInput {
    activeProfileId: string;
    selection: ProfileSelectionState;
    setStatusMessage: (value: string | undefined) => void;
    onProfileActivated: (profileId: string) => void;
}

function updateProfileList(
    utils: ReturnType<typeof trpc.useUtils>,
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

function setActiveProfileCache(input: {
    utils: ReturnType<typeof trpc.useUtils>;
    profiles: ProfileRecord[];
    profileId: string;
}) {
    const nextActiveProfile = input.profiles.find((profile) => profile.id === input.profileId);
    if (!nextActiveProfile) {
        return;
    }

    input.utils.profile.getActive.setData(undefined, {
        activeProfileId: input.profileId,
        profile: nextActiveProfile,
    });
    updateProfileList(input.utils, (profiles) =>
        profiles.map((profile) => ({
            ...profile,
            isActive: profile.id === input.profileId,
        }))
    );
}

export function useProfileLibraryController(input: ProfileLibraryControllerInput) {
    const utils = trpc.useUtils();
    const [newProfileName, setNewProfileName] = useState('');
    const [renameDraft, setRenameDraft] = useState<ProfileRenameDraft | undefined>(undefined);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const createMutation = trpc.profile.create.useMutation();
    const renameMutation = trpc.profile.rename.useMutation();
    const duplicateMutation = trpc.profile.duplicate.useMutation();
    const deleteMutation = trpc.profile.delete.useMutation();
    const setActiveMutation = trpc.profile.setActive.useMutation();

    const renameValue = resolveProfileRenameValue({
        selectedProfile: input.selection.selectedProfile,
        renameDraft,
    });

    const actions = createProfileLibraryActions({
        activeProfileId: input.activeProfileId,
        selectedProfile: input.selection.selectedProfile,
        newProfileName,
        renameValue,
        updateProfileList: (updater) => {
            updateProfileList(utils, updater);
        },
        setActiveProfileCache: (profileId) => {
            setActiveProfileCache({
                utils,
                profiles: input.selection.profiles,
                profileId,
            });
        },
        createMutation,
        renameMutation,
        duplicateMutation,
        deleteMutation,
        setActiveMutation,
        setNewProfileName,
        setRenameDraft,
        setSelectedProfileId: input.selection.setSelectedProfileId,
        setStatusMessage: input.setStatusMessage,
        setConfirmDeleteOpen,
        onProfileActivated: input.onProfileActivated,
    });
    const wrapFailClosedAction = <TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) =>
        createFailClosedAsyncAction(action);

    return {
        selectedProfile: input.selection.selectedProfile,
        newProfileName,
        renameValue,
        confirmDeleteOpen,
        cannotDeleteLastProfile: input.selection.profiles.length <= 1,
        createMutation,
        renameMutation,
        duplicateMutation,
        deleteMutation,
        setActiveMutation,
        setNewProfileName,
        setRenameValue: (value: string) => {
            setRenameDraft(
                input.selection.selectedProfileIdForSettings
                    ? {
                          profileId: input.selection.selectedProfileIdForSettings,
                          value,
                      }
                    : undefined
            );
        },
        setConfirmDeleteOpen,
        createProfile: wrapFailClosedAction(actions.createProfile),
        renameProfile: wrapFailClosedAction(actions.renameProfile),
        duplicateProfile: wrapFailClosedAction(actions.duplicateProfile),
        activateProfile: wrapFailClosedAction(actions.activateProfile),
        deleteProfile: wrapFailClosedAction(actions.deleteProfile),
    };
}

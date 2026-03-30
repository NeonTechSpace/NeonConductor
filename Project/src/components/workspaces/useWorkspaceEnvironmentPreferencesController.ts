import { useState } from 'react';

import { patchWorkspacePreferenceCache } from '@/web/components/workspaces/workspacesSurfaceCacheProjector';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type {
    WorkspaceEnvironmentSnapshot,
    WorkspacePreferenceRecord,
    WorkspacePreferredPackageManager,
    WorkspacePreferredVcs,
} from '@/shared/contracts/types/runtime';

const ENVIRONMENT_SAVE_SUCCESS_MESSAGE = 'Saved the tool preferences Neon should use for this workspace.';
const ENVIRONMENT_SAVE_ERROR_MESSAGE = 'Could not save workspace tool preferences.';

export interface WorkspaceEnvironmentPreferencesControllerInput {
    profileId: string;
    workspaceFingerprint: string;
    workspacePreference?: WorkspacePreferenceRecord;
}

export interface WorkspaceEnvironmentPreferencesControllerState {
    preferredVcs: WorkspacePreferredVcs;
    preferredPackageManager: WorkspacePreferredPackageManager;
    currentPreferredVcs: WorkspacePreferredVcs;
    currentPreferredPackageManager: WorkspacePreferredPackageManager;
    hasPendingChanges: boolean;
    feedbackMessage: string | undefined;
    isSaving: boolean;
    environmentSnapshot: WorkspaceEnvironmentSnapshot | undefined;
    environmentIsLoading: boolean;
    environmentErrorMessage: string | undefined;
    refetchEnvironment: () => Promise<unknown>;
    selectPreferredVcs: (value: WorkspacePreferredVcs) => void;
    selectPreferredPackageManager: (value: WorkspacePreferredPackageManager) => void;
    savePreferences: () => Promise<void>;
}

export function useWorkspaceEnvironmentPreferencesController(
    input: WorkspaceEnvironmentPreferencesControllerInput
): WorkspaceEnvironmentPreferencesControllerState {
    const utils = trpc.useUtils();
    const [preferredVcs, setPreferredVcs] = useState<WorkspacePreferredVcs>(
        input.workspacePreference?.preferredVcs ?? 'auto'
    );
    const [preferredPackageManager, setPreferredPackageManager] = useState<WorkspacePreferredPackageManager>(
        input.workspacePreference?.preferredPackageManager ?? 'auto'
    );
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const environmentQuery = trpc.runtime.inspectWorkspaceEnvironment.useQuery(
        {
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            patchWorkspacePreferenceCache({
                utils,
                profileId: input.profileId,
                workspacePreference,
            });
            setFeedbackMessage(ENVIRONMENT_SAVE_SUCCESS_MESSAGE);
            void environmentQuery.refetch();
        },
        onError: () => {
            setFeedbackMessage(ENVIRONMENT_SAVE_ERROR_MESSAGE);
        },
    });
    const currentPreferredVcs = input.workspacePreference?.preferredVcs ?? 'auto';
    const currentPreferredPackageManager = input.workspacePreference?.preferredPackageManager ?? 'auto';
    const hasPendingChanges =
        preferredVcs !== currentPreferredVcs || preferredPackageManager !== currentPreferredPackageManager;

    async function savePreferences() {
        await setWorkspacePreferenceMutation
            .mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                preferredVcs,
                preferredPackageManager,
            })
            .catch(() => undefined);
    }

    return {
        preferredVcs,
        preferredPackageManager,
        currentPreferredVcs,
        currentPreferredPackageManager,
        hasPendingChanges,
        feedbackMessage,
        isSaving: setWorkspacePreferenceMutation.isPending,
        environmentSnapshot: environmentQuery.data?.snapshot,
        environmentIsLoading: environmentQuery.isLoading,
        environmentErrorMessage: environmentQuery.error?.message,
        refetchEnvironment: environmentQuery.refetch,
        selectPreferredVcs: (value) => {
            setFeedbackMessage(undefined);
            setPreferredVcs(value);
        },
        selectPreferredPackageManager: (value) => {
            setFeedbackMessage(undefined);
            setPreferredPackageManager(value);
        },
        savePreferences,
    };
}

export { ENVIRONMENT_SAVE_ERROR_MESSAGE, ENVIRONMENT_SAVE_SUCCESS_MESSAGE };

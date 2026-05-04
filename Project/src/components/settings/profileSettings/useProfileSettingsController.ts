import { useState } from 'react';

import { useProfileFileReadGuardController } from '@/web/components/settings/profileSettings/useProfileFileReadGuardController';
import { useProfileLibraryController } from '@/web/components/settings/profileSettings/useProfileLibraryController';
import { useProfilePreferencesController } from '@/web/components/settings/profileSettings/useProfilePreferencesController';
import { useProfileSelectionState } from '@/web/components/settings/profileSettings/useProfileSelectionState';

export function useProfileSettingsController(input: {
    activeProfileId: string;
    onProfileActivated: (profileId: string) => void;
}) {
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    const selection = useProfileSelectionState({
        activeProfileId: input.activeProfileId,
    });
    const library = useProfileLibraryController({
        activeProfileId: input.activeProfileId,
        selection,
        setStatusMessage,
        onProfileActivated: input.onProfileActivated,
    });
    const preferences = useProfilePreferencesController({
        selection,
        setStatusMessage,
    });
    const fileReadGuard = useProfileFileReadGuardController({
        selection,
        setStatusMessage,
    });
    return {
        selection: {
            ...selection,
            setSelectedProfileId: (profileId: string | undefined) => {
                selection.setSelectedProfileId(profileId);
                setStatusMessage(undefined);
            },
        },
        library,
        preferences,
        fileReadGuard,
        feedback: {
            message:
                library.createMutation.error?.message ??
                library.renameMutation.error?.message ??
                library.duplicateMutation.error?.message ??
                library.deleteMutation.error?.message ??
                library.setActiveMutation.error?.message ??
                preferences.setEditPreferenceMutation.error?.message ??
                preferences.setThreadTitlePreferenceMutation.error?.message ??
                preferences.setExecutionPresetMutation.error?.message ??
                preferences.setUtilityModelMutation.error?.message ??
                preferences.setUtilityModelConsumerPreferenceMutation.error?.message ??
                preferences.setMemoryRetrievalModelMutation.error?.message ??
                fileReadGuard.setSettingsMutation.error?.message ??
                statusMessage,
            tone:
                (library.createMutation.error ??
                library.renameMutation.error ??
                library.duplicateMutation.error ??
                library.deleteMutation.error ??
                library.setActiveMutation.error ??
                preferences.setEditPreferenceMutation.error ??
                preferences.setThreadTitlePreferenceMutation.error ??
                preferences.setExecutionPresetMutation.error ??
                preferences.setUtilityModelMutation.error ??
                preferences.setUtilityModelConsumerPreferenceMutation.error ??
                preferences.setMemoryRetrievalModelMutation.error ??
                fileReadGuard.setSettingsMutation.error)
                    ? ('error' as const)
                    : statusMessage
                      ? ('success' as const)
                      : ('info' as const),
            setStatusMessage,
        },
    };
}

import { useState } from 'react';

import { useProfileLibraryController } from '@/web/components/settings/profileSettings/useProfileLibraryController';
import { useProfilePreferencesController } from '@/web/components/settings/profileSettings/useProfilePreferencesController';
import { useProfileResetController } from '@/web/components/settings/profileSettings/useProfileResetController';
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
    const reset = useProfileResetController({
        setSelectedProfileId: selection.setSelectedProfileId,
        setStatusMessage,
        onProfileActivated: input.onProfileActivated,
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
        reset,
        feedback: {
            message:
                library.createMutation.error?.message ??
                library.renameMutation.error?.message ??
                library.duplicateMutation.error?.message ??
                library.deleteMutation.error?.message ??
                library.setActiveMutation.error?.message ??
                reset.factoryResetMutation.error?.message ??
                preferences.setEditPreferenceMutation.error?.message ??
                preferences.setThreadTitlePreferenceMutation.error?.message ??
                preferences.setExecutionPresetMutation.error?.message ??
                preferences.setUtilityModelMutation.error?.message ??
                statusMessage,
            tone:
                (library.createMutation.error ??
                library.renameMutation.error ??
                library.duplicateMutation.error ??
                library.deleteMutation.error ??
                library.setActiveMutation.error ??
                reset.factoryResetMutation.error ??
                preferences.setEditPreferenceMutation.error ??
                preferences.setThreadTitlePreferenceMutation.error ??
                preferences.setExecutionPresetMutation.error ??
                preferences.setUtilityModelMutation.error)
                    ? ('error' as const)
                    : statusMessage
                      ? ('success' as const)
                      : ('info' as const),
            setStatusMessage,
        },
    };
}

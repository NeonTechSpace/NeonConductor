import { useEffect, useState } from 'react';

import type { ProfileSelectionState } from '@/web/components/settings/profileSettings/useProfileSelectionState';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { ProfileFileReadGuardSettings } from '@/shared/contracts';
import { DEFAULT_PROFILE_FILE_READ_GUARD_SETTINGS } from '@/shared/fileReadGuardPolicy';

interface ProfileFileReadGuardControllerInput {
    selection: ProfileSelectionState;
    setStatusMessage: (value: string | undefined) => void;
}

function joinLines(values: readonly string[]): string {
    return values.join('\n');
}

function splitLines(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function useProfileFileReadGuardController(input: ProfileFileReadGuardControllerInput) {
    const utils = trpc.useUtils();
    const [allowedExtensionsText, setAllowedExtensionsText] = useState('');
    const [blockedPatternsText, setBlockedPatternsText] = useState('');
    const [allowSecretLikeTextFiles, setAllowSecretLikeTextFiles] = useState(false);
    const [allowUnknownUtf8Text, setAllowUnknownUtf8Text] = useState(false);
    const [maxTextFileBytesText, setMaxTextFileBytesText] = useState(
        String(DEFAULT_PROFILE_FILE_READ_GUARD_SETTINGS.maxTextFileBytes)
    );

    const settingsQuery = trpc.profile.getFileReadGuardSettings.useQuery(
        { profileId: input.selection.selectedProfileIdForSettings },
        {
            enabled: Boolean(input.selection.selectedProfileIdForSettings),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const setSettingsMutation = trpc.profile.setFileReadGuardSettings.useMutation({
        onSuccess: async (_result, variables) => {
            await utils.profile.getFileReadGuardSettings.invalidate({ profileId: variables.profileId });
            input.setStatusMessage('File read guard settings saved.');
        },
    });

    useEffect(() => {
        const settings = settingsQuery.data?.settings;
        if (!settings) {
            return;
        }
        setAllowedExtensionsText(joinLines(settings.additionalAllowedExtensions));
        setBlockedPatternsText(joinLines(settings.additionalBlockedPatterns));
        setAllowSecretLikeTextFiles(settings.allowSecretLikeTextFiles);
        setAllowUnknownUtf8Text(settings.allowUnknownUtf8Text);
        setMaxTextFileBytesText(String(settings.maxTextFileBytes));
    }, [settingsQuery.data?.settings]);

    const maxTextFileBytes = Number(maxTextFileBytesText);

    function buildSettings(): ProfileFileReadGuardSettings {
        return {
            additionalAllowedExtensions: splitLines(allowedExtensionsText),
            additionalBlockedPatterns: splitLines(blockedPatternsText),
            allowSecretLikeTextFiles,
            allowUnknownUtf8Text,
            maxTextFileBytes: Number.isFinite(maxTextFileBytes)
                ? Math.floor(maxTextFileBytes)
                : DEFAULT_PROFILE_FILE_READ_GUARD_SETTINGS.maxTextFileBytes,
        };
    }

    async function saveSettings(): Promise<void> {
        await setSettingsMutation.mutateAsync({
            profileId: input.selection.selectedProfileIdForSettings,
            settings: buildSettings(),
        });
    }

    return {
        settings: settingsQuery.data?.settings ?? DEFAULT_PROFILE_FILE_READ_GUARD_SETTINGS,
        policy: settingsQuery.data?.policy,
        isLoading: settingsQuery.isLoading,
        allowedExtensionsText,
        setAllowedExtensionsText,
        blockedPatternsText,
        setBlockedPatternsText,
        allowSecretLikeTextFiles,
        setAllowSecretLikeTextFiles,
        allowUnknownUtf8Text,
        setAllowUnknownUtf8Text,
        maxTextFileBytesText,
        setMaxTextFileBytesText,
        setSettingsMutation,
        saveSettings,
    };
}


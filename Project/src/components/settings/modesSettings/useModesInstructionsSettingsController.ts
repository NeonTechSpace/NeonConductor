import { useState } from 'react';


import type { PromptSettingsSnapshot } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { useModesInstructionsBuiltInModesController } from '@/web/components/settings/modesSettings/useModesInstructionsBuiltInModesController';
import { useModesInstructionsCustomModesController } from '@/web/components/settings/modesSettings/useModesInstructionsCustomModesController';
import { useModesInstructionsGlobalController } from '@/web/components/settings/modesSettings/useModesInstructionsGlobalController';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

export function useModesInstructionsSettingsController(input: {
    profileId: string;
    workspaceFingerprint?: string;
    selectedWorkspaceLabel?: string;
}) {
    const { profileId, workspaceFingerprint, selectedWorkspaceLabel } = input;
    const utils = trpc.useUtils();
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');

    const settingsQueryInput = {
        profileId,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
    const settingsQuery = trpc.prompt.getSettings.useQuery(settingsQueryInput, PROGRESSIVE_QUERY_OPTIONS);

    function applySettings(settings: PromptSettingsSnapshot) {
        utils.prompt.getSettings.setData(settingsQueryInput, { settings });
    }

    function clearFeedback(): void {
        setFeedbackMessage(undefined);
        setFeedbackTone('info');
    }

    const setSuccessFeedback = (message: string) => {
        setFeedbackTone('success');
        setFeedbackMessage(message);
    };
    const setErrorFeedback = (message: string) => {
        setFeedbackTone('error');
        setFeedbackMessage(message);
    };

    const persistedSettings = settingsQuery.data?.settings;
    const globalController = useModesInstructionsGlobalController({
        profileId,
        persistedSettings,
        applySettings,
        clearFeedback,
        setErrorFeedback,
        setSuccessFeedback,
    });
    const builtInModesController = useModesInstructionsBuiltInModesController({
        profileId,
        persistedSettings,
        applySettings,
        clearFeedback,
        setErrorFeedback,
        setSuccessFeedback,
    });
    const customModesController = useModesInstructionsCustomModesController({
        profileId,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(selectedWorkspaceLabel ? { selectedWorkspaceLabel } : {}),
        persistedSettings,
        applySettings,
        clearFeedback,
        setErrorFeedback,
        setSuccessFeedback,
    });

    return {
        feedback: {
            message: feedbackMessage,
            tone: feedbackTone,
            clear: clearFeedback,
        },
        query: settingsQuery,
        workspace: {
            fingerprint: workspaceFingerprint,
            selectedLabel: selectedWorkspaceLabel,
        },
        ...globalController,
        ...builtInModesController,
        ...customModesController,
    };
}

import { useState } from 'react';


import type { PromptSettingsSnapshot } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { useModesInstructionsBuiltInModesController } from '@/web/components/settings/modesSettings/useModesInstructionsBuiltInModesController';
import { useModesInstructionsCustomModesController } from '@/web/components/settings/modesSettings/useModesInstructionsCustomModesController';
import { useModesInstructionsGlobalController } from '@/web/components/settings/modesSettings/useModesInstructionsGlobalController';
import { buildModesInstructionsViewModel } from '@/web/components/settings/modesSettings/modesInstructionsViewModel';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';

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
    const topLevelTabs: TopLevelTab[] = ['chat', 'agent', 'orchestrator'];
    const topLevelValues = Object.fromEntries(
        topLevelTabs.map((topLevelTab) => [topLevelTab, globalController.topLevel.getValue(topLevelTab)])
    ) as Record<TopLevelTab, string>;
    const builtInModesByTab = Object.fromEntries(
        topLevelTabs.map((topLevelTab) => [topLevelTab, builtInModesController.builtInModes.getItems(topLevelTab)])
    ) as Record<TopLevelTab, ReturnType<typeof builtInModesController.builtInModes.getItems>>;
    const viewModel = buildModesInstructionsViewModel({
        appGlobalValue: globalController.appGlobal.value,
        appGlobalIsSaving: globalController.appGlobal.isSaving,
        profileGlobalValue: globalController.profileGlobal.value,
        profileGlobalIsSaving: globalController.profileGlobal.isSaving,
        topLevelValues,
        topLevelIsSaving: globalController.topLevel.isSaving,
        builtInModesByTab,
        builtInModesIsSaving: builtInModesController.builtInModes.isSaving,
        fileBackedGlobalModes: customModesController.customModes.global,
        fileBackedWorkspaceModes: customModesController.customModes.workspace,
        hasWorkspaceScope: Boolean(workspaceFingerprint),
        ...(selectedWorkspaceLabel ? { selectedWorkspaceLabel } : {}),
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
        viewModel,
        ...globalController,
        ...builtInModesController,
        ...customModesController,
    };
}

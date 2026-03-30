import { useState } from 'react';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import {
    buildWorkspaceModelOptions,
    resolveWorkspaceDefaultDraft,
    type WorkspaceModelOption,
    isWorkspaceRuntimeProviderId,
} from '@/web/components/workspaces/workspacesSurfaceSectionHelpers';
import { patchWorkspacePreferenceCache } from '@/web/components/workspaces/workspacesSurfaceCacheProjector';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';

const DEFAULTS_SAVE_SUCCESS_MESSAGE = 'Saved the defaults Neon will use for new threads in this workspace.';
const DEFAULTS_SAVE_ERROR_MESSAGE = 'Could not save workspace defaults.';

export interface WorkspaceDefaultsControllerInput {
    profileId: string;
    workspaceFingerprint: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    workspacePreference?: WorkspacePreferenceRecord;
}

export interface WorkspaceDefaultsControllerState {
    topLevelTab: TopLevelTab;
    providerId: RuntimeProviderId | undefined;
    modelId: string;
    selectedProvider: ProviderListItem | undefined;
    modelOptions: WorkspaceModelOption[];
    selectedModelId: string;
    selectedModelOption: WorkspaceModelOption | undefined;
    feedbackMessage: string | undefined;
    isSaving: boolean;
    selectTopLevelTab: (value: TopLevelTab) => void;
    selectProvider: (value: RuntimeProviderId | undefined) => void;
    selectModel: (value: string) => void;
    selectModelOption: (option: WorkspaceModelOption) => void;
    saveDefaults: () => Promise<void>;
}

export function useWorkspaceDefaultsController(input: WorkspaceDefaultsControllerInput): WorkspaceDefaultsControllerState {
    const utils = trpc.useUtils();
    const initialDraft = resolveWorkspaceDefaultDraft({
        providers: input.providers,
        providerModels: input.providerModels,
        defaults: input.defaults,
        ...(input.workspacePreference ? { workspacePreference: input.workspacePreference } : {}),
    });
    const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>(initialDraft.topLevelTab);
    const [providerId, setProviderId] = useState<RuntimeProviderId | undefined>(initialDraft.providerId);
    const [modelId, setModelId] = useState(initialDraft.modelId);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            patchWorkspacePreferenceCache({
                utils,
                profileId: input.profileId,
                workspacePreference,
            });
            setFeedbackMessage(DEFAULTS_SAVE_SUCCESS_MESSAGE);
        },
        onError: () => {
            setFeedbackMessage(DEFAULTS_SAVE_ERROR_MESSAGE);
        },
    });
    const selectedProvider = providerId ? input.providers.find((provider) => provider.id === providerId) : undefined;
    const modelOptions = buildWorkspaceModelOptions(selectedProvider, input.providerModels);
    const selectedModelId =
        modelId && modelOptions.some((option) => option.id === modelId) ? modelId : (modelOptions[0]?.id ?? '');
    const selectedModelOption = modelOptions.find((option) => option.id === selectedModelId);

    async function saveDefaults() {
        if (!providerId || selectedModelId.length === 0) {
            return;
        }

        await setWorkspacePreferenceMutation
            .mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                defaultTopLevelTab: topLevelTab,
                defaultProviderId: providerId,
                defaultModelId: selectedModelId,
            })
            .catch(() => undefined);
    }

    return {
        topLevelTab,
        providerId,
        modelId,
        selectedProvider,
        modelOptions,
        selectedModelId,
        selectedModelOption,
        feedbackMessage,
        isSaving: setWorkspacePreferenceMutation.isPending,
        selectTopLevelTab: (value) => {
            setFeedbackMessage(undefined);
            setTopLevelTab(value);
        },
        selectProvider: (value) => {
            setFeedbackMessage(undefined);
            setProviderId(value);
            const nextProvider = value ? input.providers.find((provider) => provider.id === value) : undefined;
            const nextModelId = buildWorkspaceModelOptions(nextProvider, input.providerModels)[0]?.id ?? '';
            setModelId(nextModelId);
        },
        selectModel: (value) => {
            setFeedbackMessage(undefined);
            setModelId(value);
        },
        selectModelOption: (option) => {
            setFeedbackMessage(undefined);
            if (
                option.providerId &&
                option.providerId !== providerId &&
                isWorkspaceRuntimeProviderId(option.providerId)
            ) {
                setProviderId(option.providerId);
            }
            setModelId(option.id);
        },
        saveDefaults,
    };
}

export { DEFAULTS_SAVE_ERROR_MESSAGE, DEFAULTS_SAVE_SUCCESS_MESSAGE };

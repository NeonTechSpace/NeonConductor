import { useState } from 'react';

import type {
    BuiltInModeDraftState,
    PromptSettingsSnapshot,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    clonePreparedContextModeOverrides,
    createDefaultPreparedContextModeOverridesSnapshot,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type {
    PreparedContextEditablePromptLayerGroup,
    PreparedContextInjectionCheckpoint,
    PreparedContextModeOverrideValue,
    TopLevelTab,
} from '@/shared/contracts';


function getBuiltInModeDraftKey(topLevelTab: TopLevelTab, modeKey: string): string {
    return `${topLevelTab}:${modeKey}`;
}

export function useModesInstructionsBuiltInModesController(input: {
    profileId: string;
    persistedSettings: PromptSettingsSnapshot | undefined;
    applySettings: (settings: PromptSettingsSnapshot) => void;
    clearFeedback: () => void;
    setErrorFeedback: (message: string) => void;
    setSuccessFeedback: (message: string) => void;
}) {
    const wrapFailClosedAction = <TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) =>
        createFailClosedAsyncAction(action);
    const [builtInModeDrafts, setBuiltInModeDrafts] = useState<BuiltInModeDraftState>({});

    function resolveBuiltInModePrompt(resolveInput: {
        topLevelTab: TopLevelTab;
        modeKey: string;
        persistedPrompt: {
            roleDefinition?: string;
            customInstructions?: string;
        };
        persistedOverrides: PromptSettingsSnapshot['builtInModes'][TopLevelTab][number]['promptLayerOverrides'];
    }): { roleDefinition: string; customInstructions: string; promptLayerOverrides: PromptSettingsSnapshot['builtInModes'][TopLevelTab][number]['promptLayerOverrides'] } {
        const draft = builtInModeDrafts[getBuiltInModeDraftKey(resolveInput.topLevelTab, resolveInput.modeKey)];
        if (draft?.profileId === input.profileId) {
            return {
                roleDefinition: draft.roleDefinition,
                customInstructions: draft.customInstructions,
                promptLayerOverrides: draft.promptLayerOverrides,
            };
        }

        return {
            roleDefinition: resolveInput.persistedPrompt.roleDefinition ?? '',
            customInstructions: resolveInput.persistedPrompt.customInstructions ?? '',
            promptLayerOverrides: clonePreparedContextModeOverrides(resolveInput.persistedOverrides),
        };
    }

    const setBuiltInModePromptMutation = trpc.prompt.setBuiltInModePrompt.useMutation({
        onSuccess: ({ settings }, variables) => {
            input.applySettings(settings);
            setBuiltInModeDrafts((currentDrafts) => ({
                ...currentDrafts,
                [getBuiltInModeDraftKey(variables.topLevelTab, variables.modeKey)]: undefined,
            }));
            input.setSuccessFeedback(`Saved built-in ${variables.topLevelTab}:${variables.modeKey} mode prompt.`);
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const resetBuiltInModePromptMutation = trpc.prompt.resetBuiltInModePrompt.useMutation({
        onSuccess: ({ settings }, variables) => {
            input.applySettings(settings);
            setBuiltInModeDrafts((currentDrafts) => ({
                ...currentDrafts,
                [getBuiltInModeDraftKey(variables.topLevelTab, variables.modeKey)]: undefined,
            }));
            input.setSuccessFeedback(`Reset built-in ${variables.topLevelTab}:${variables.modeKey} mode prompt.`);
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });

    return {
        builtInModes: {
            isSaving: setBuiltInModePromptMutation.isPending || resetBuiltInModePromptMutation.isPending,
            getItems: (topLevelTab: TopLevelTab) =>
                (input.persistedSettings?.builtInModes[topLevelTab] ?? []).map((mode) => ({
                    ...mode,
                    prompt: resolveBuiltInModePrompt({
                    topLevelTab,
                    modeKey: mode.modeKey,
                    persistedPrompt: mode.prompt,
                    persistedOverrides: mode.promptLayerOverrides,
                }),
                })),
            setPromptField: (
                topLevelTab: TopLevelTab,
                modeKey: string,
                field: 'roleDefinition' | 'customInstructions',
                value: string
            ) => {
                const draftKey = getBuiltInModeDraftKey(topLevelTab, modeKey);
                const persistedMode = (input.persistedSettings?.builtInModes[topLevelTab] ?? []).find(
                    (candidate) => candidate.modeKey === modeKey
                );
                const currentPrompt = resolveBuiltInModePrompt({
                    topLevelTab,
                    modeKey,
                    persistedPrompt: persistedMode?.prompt ?? {},
                    persistedOverrides: persistedMode?.promptLayerOverrides ?? createDefaultPreparedContextModeOverridesSnapshot(),
                });
                setBuiltInModeDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [draftKey]: {
                        profileId: input.profileId,
                        roleDefinition: field === 'roleDefinition' ? value : currentPrompt.roleDefinition,
                        customInstructions: field === 'customInstructions' ? value : currentPrompt.customInstructions,
                        promptLayerOverrides: currentPrompt.promptLayerOverrides,
                    },
                }));
                input.clearFeedback();
            },
            setPromptLayerOverride: (
                topLevelTab: TopLevelTab,
                modeKey: string,
                group: PreparedContextEditablePromptLayerGroup,
                checkpoint: PreparedContextInjectionCheckpoint,
                value: PreparedContextModeOverrideValue
            ) => {
                const draftKey = getBuiltInModeDraftKey(topLevelTab, modeKey);
                const persistedMode = (input.persistedSettings?.builtInModes[topLevelTab] ?? []).find(
                    (candidate) => candidate.modeKey === modeKey
                );
                const currentPrompt = resolveBuiltInModePrompt({
                    topLevelTab,
                    modeKey,
                    persistedPrompt: persistedMode?.prompt ?? {},
                    persistedOverrides: persistedMode?.promptLayerOverrides ?? createDefaultPreparedContextModeOverridesSnapshot(),
                });
                setBuiltInModeDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [draftKey]: {
                        profileId: input.profileId,
                        roleDefinition: currentPrompt.roleDefinition,
                        customInstructions: currentPrompt.customInstructions,
                        promptLayerOverrides: {
                            ...currentPrompt.promptLayerOverrides,
                            [group]: {
                                ...currentPrompt.promptLayerOverrides[group],
                                [checkpoint]: value,
                            },
                        },
                    },
                }));
                input.clearFeedback();
            },
            save: wrapFailClosedAction(async (topLevelTab: TopLevelTab, modeKey: string) => {
                const persistedMode = (input.persistedSettings?.builtInModes[topLevelTab] ?? []).find(
                    (candidate) => candidate.modeKey === modeKey
                );
                const prompt = resolveBuiltInModePrompt({
                    topLevelTab,
                    modeKey,
                    persistedPrompt: persistedMode?.prompt ?? {},
                    persistedOverrides: persistedMode?.promptLayerOverrides ?? createDefaultPreparedContextModeOverridesSnapshot(),
                });
                await setBuiltInModePromptMutation.mutateAsync({
                    profileId: input.profileId,
                    topLevelTab,
                    modeKey,
                    roleDefinition: prompt.roleDefinition,
                    customInstructions: prompt.customInstructions,
                    promptLayerOverrides: prompt.promptLayerOverrides,
                });
            }),
            reset: wrapFailClosedAction(async (topLevelTab: TopLevelTab, modeKey: string) => {
                await resetBuiltInModePromptMutation.mutateAsync({
                    profileId: input.profileId,
                    topLevelTab,
                    modeKey,
                });
            }),
        },
    };
}

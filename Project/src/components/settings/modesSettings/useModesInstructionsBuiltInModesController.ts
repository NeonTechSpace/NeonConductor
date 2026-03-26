import { useState } from 'react';

import type {
    BuiltInModeDraftState,
    PromptSettingsSnapshot,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';


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
    }): { roleDefinition: string; customInstructions: string } {
        const draft = builtInModeDrafts[getBuiltInModeDraftKey(resolveInput.topLevelTab, resolveInput.modeKey)];
        if (draft?.profileId === input.profileId) {
            return {
                roleDefinition: draft.roleDefinition,
                customInstructions: draft.customInstructions,
            };
        }

        return {
            roleDefinition: resolveInput.persistedPrompt.roleDefinition ?? '',
            customInstructions: resolveInput.persistedPrompt.customInstructions ?? '',
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
                });
                setBuiltInModeDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [draftKey]: {
                        profileId: input.profileId,
                        roleDefinition: field === 'roleDefinition' ? value : currentPrompt.roleDefinition,
                        customInstructions: field === 'customInstructions' ? value : currentPrompt.customInstructions,
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
                });
                await setBuiltInModePromptMutation.mutateAsync({
                    profileId: input.profileId,
                    topLevelTab,
                    modeKey,
                    roleDefinition: prompt.roleDefinition,
                    customInstructions: prompt.customInstructions,
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

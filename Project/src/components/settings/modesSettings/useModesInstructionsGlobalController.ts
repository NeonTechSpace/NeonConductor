import { useState } from 'react';

import type {
    PreparedContextProfileDefaultsDraftState,
    PromptSettingsSnapshot,
    TopLevelDraftState,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    clonePreparedContextProfileDefaults,
    createDefaultPreparedContextProfileDefaultsSnapshot,
    resolveTopLevelDraftValue,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type {
    PreparedContextEditablePromptLayerGroup,
    PreparedContextInjectionCheckpoint,
    PreparedContextProfileDefaultValue,
    TopLevelTab,
} from '@/shared/contracts';


export function useModesInstructionsGlobalController(input: {
    profileId: string;
    persistedSettings: PromptSettingsSnapshot | undefined;
    applySettings: (settings: PromptSettingsSnapshot) => void;
    clearFeedback: () => void;
    setErrorFeedback: (message: string) => void;
    setSuccessFeedback: (message: string) => void;
}) {
    const wrapFailClosedAction = <TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) =>
        createFailClosedAsyncAction(action);
    const [appGlobalDraft, setAppGlobalDraft] = useState<string | undefined>(undefined);
    const [profileGlobalDraft, setProfileGlobalDraft] = useState<{ profileId: string; value: string } | undefined>(
        undefined
    );
    const [topLevelDrafts, setTopLevelDrafts] = useState<TopLevelDraftState>({});
    const [preparedContextDefaultsDraft, setPreparedContextDefaultsDraft] =
        useState<PreparedContextProfileDefaultsDraftState>(undefined);

    const setAppGlobalInstructionsMutation = trpc.prompt.setAppGlobalInstructions.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setAppGlobalDraft(undefined);
            input.setSuccessFeedback('Saved app-wide instructions.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const resetAppGlobalInstructionsMutation = trpc.prompt.resetAppGlobalInstructions.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setAppGlobalDraft(undefined);
            input.setSuccessFeedback('Reset app-wide instructions.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const setProfileGlobalInstructionsMutation = trpc.prompt.setProfileGlobalInstructions.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setProfileGlobalDraft(undefined);
            input.setSuccessFeedback('Saved profile-wide instructions.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const resetProfileGlobalInstructionsMutation = trpc.prompt.resetProfileGlobalInstructions.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setProfileGlobalDraft(undefined);
            input.setSuccessFeedback('Reset profile-wide instructions.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const setTopLevelInstructionsMutation = trpc.prompt.setTopLevelInstructions.useMutation({
        onSuccess: ({ settings }, variables) => {
            input.applySettings(settings);
            setTopLevelDrafts((currentDrafts) => ({
                ...currentDrafts,
                [variables.topLevelTab]: undefined,
            }));
            input.setSuccessFeedback(`Saved ${variables.topLevelTab} instructions.`);
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const resetTopLevelInstructionsMutation = trpc.prompt.resetTopLevelInstructions.useMutation({
        onSuccess: ({ settings }, variables) => {
            input.applySettings(settings);
            setTopLevelDrafts((currentDrafts) => ({
                ...currentDrafts,
                [variables.topLevelTab]: undefined,
            }));
            input.setSuccessFeedback(`Reset ${variables.topLevelTab} instructions.`);
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const setPreparedContextProfileDefaultsMutation = trpc.prompt.setPreparedContextProfileDefaults.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setPreparedContextDefaultsDraft(undefined);
            input.setSuccessFeedback('Saved prepared-context profile defaults.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const resetPreparedContextProfileDefaultsMutation = trpc.prompt.resetPreparedContextProfileDefaults.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setPreparedContextDefaultsDraft(undefined);
            input.setSuccessFeedback('Reset prepared-context profile defaults.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });

    const appGlobalInstructions = appGlobalDraft ?? input.persistedSettings?.appGlobalInstructions ?? '';
    const profileGlobalInstructions =
        profileGlobalDraft?.profileId === input.profileId
            ? profileGlobalDraft.value
            : (input.persistedSettings?.profileGlobalInstructions ?? '');
    const preparedContextProfileDefaults =
        preparedContextDefaultsDraft?.profileId === input.profileId
            ? preparedContextDefaultsDraft.values
            : clonePreparedContextProfileDefaults(
                  input.persistedSettings?.preparedContextProfileDefaults ??
                      createDefaultPreparedContextProfileDefaultsSnapshot()
              );

    return {
        appGlobal: {
            value: appGlobalInstructions,
            isSaving: setAppGlobalInstructionsMutation.isPending || resetAppGlobalInstructionsMutation.isPending,
            setValue: (value: string) => {
                setAppGlobalDraft(value);
                input.clearFeedback();
            },
            save: wrapFailClosedAction(async () => {
                await setAppGlobalInstructionsMutation.mutateAsync({
                    profileId: input.profileId,
                    value: appGlobalInstructions,
                });
            }),
            reset: wrapFailClosedAction(async () => {
                await resetAppGlobalInstructionsMutation.mutateAsync({ profileId: input.profileId });
            }),
        },
        profileGlobal: {
            value: profileGlobalInstructions,
            isSaving:
                setProfileGlobalInstructionsMutation.isPending || resetProfileGlobalInstructionsMutation.isPending,
            setValue: (value: string) => {
                setProfileGlobalDraft({ profileId: input.profileId, value });
                input.clearFeedback();
            },
            save: wrapFailClosedAction(async () => {
                await setProfileGlobalInstructionsMutation.mutateAsync({
                    profileId: input.profileId,
                    value: profileGlobalInstructions,
                });
            }),
            reset: wrapFailClosedAction(async () => {
                await resetProfileGlobalInstructionsMutation.mutateAsync({ profileId: input.profileId });
            }),
        },
        topLevel: {
            isSaving: setTopLevelInstructionsMutation.isPending || resetTopLevelInstructionsMutation.isPending,
            getValue: (topLevelTab: TopLevelTab) =>
                resolveTopLevelDraftValue({
                    profileId: input.profileId,
                    topLevelTab,
                    persistedValue: input.persistedSettings?.topLevelInstructions[topLevelTab],
                    drafts: topLevelDrafts,
                }),
            setValue: (topLevelTab: TopLevelTab, value: string) => {
                setTopLevelDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [topLevelTab]: { profileId: input.profileId, value },
                }));
                input.clearFeedback();
            },
            save: wrapFailClosedAction(async (topLevelTab: TopLevelTab) => {
                await setTopLevelInstructionsMutation.mutateAsync({
                    profileId: input.profileId,
                    topLevelTab,
                    value: resolveTopLevelDraftValue({
                        profileId: input.profileId,
                        topLevelTab,
                        persistedValue: input.persistedSettings?.topLevelInstructions[topLevelTab],
                        drafts: topLevelDrafts,
                    }),
                });
            }),
            reset: wrapFailClosedAction(async (topLevelTab: TopLevelTab) => {
                await resetTopLevelInstructionsMutation.mutateAsync({
                    profileId: input.profileId,
                    topLevelTab,
                });
            }),
        },
        preparedContextDefaults: {
            value: preparedContextProfileDefaults,
            isSaving:
                setPreparedContextProfileDefaultsMutation.isPending ||
                resetPreparedContextProfileDefaultsMutation.isPending,
            setValue: (
                group: PreparedContextEditablePromptLayerGroup,
                checkpoint: PreparedContextInjectionCheckpoint,
                value: PreparedContextProfileDefaultValue
            ) => {
                setPreparedContextDefaultsDraft({
                    profileId: input.profileId,
                    values: {
                        ...preparedContextProfileDefaults,
                        [group]: {
                            ...preparedContextProfileDefaults[group],
                            [checkpoint]: value,
                        },
                    },
                });
                input.clearFeedback();
            },
            save: wrapFailClosedAction(async () => {
                await setPreparedContextProfileDefaultsMutation.mutateAsync({
                    profileId: input.profileId,
                    defaults: preparedContextProfileDefaults,
                });
            }),
            reset: wrapFailClosedAction(async () => {
                await resetPreparedContextProfileDefaultsMutation.mutateAsync({
                    profileId: input.profileId,
                });
            }),
        },
    };
}

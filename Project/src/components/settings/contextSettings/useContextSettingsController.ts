import { useState } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import {
    resolveComposerMediaSettingsDraft,
    type ComposerMediaSettingsDraft,
} from '@/web/components/settings/composerMediaSettingsDrafts';
import {
    resolveContextGlobalDraft,
    resolveContextProfileDraft,
    type ContextGlobalDraft,
    type ContextProfileDraft,
} from '@/web/components/settings/contextSettingsDrafts';
import { resolveSelectedProfileId } from '@/web/components/settings/profileSettings/selection';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { findProviderControlEntry, getProviderControlDefaults } from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseContextSettingsControllerInput {
    activeProfileId: string;
}

export function useContextSettingsController({ activeProfileId }: UseContextSettingsControllerInput) {
    const wrapFailClosedAction = <TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) =>
        createFailClosedAsyncAction(action);
    const utils = trpc.useUtils();
    const [selectedProfileId, setSelectedProfileId] = useState(activeProfileId);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');

    const profilesQuery = trpc.profile.list.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const profiles = profilesQuery.data?.profiles ?? [];
    const resolvedSelectedProfileId =
        resolveSelectedProfileId(profiles, selectedProfileId, activeProfileId) ?? activeProfileId;

    const globalSettingsQuery = trpc.context.getGlobalSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const profileSettingsQuery = trpc.context.getProfileSettings.useQuery(
        { profileId: resolvedSelectedProfileId },
        { enabled: resolvedSelectedProfileId.length > 0, ...PROGRESSIVE_QUERY_OPTIONS }
    );
    const composerMediaSettingsQuery = trpc.composer.getSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery(
        { profileId: resolvedSelectedProfileId },
        { enabled: resolvedSelectedProfileId.length > 0, ...PROGRESSIVE_QUERY_OPTIONS }
    );

    const providerControl = shellBootstrapQuery.data?.providerControl;
    const defaults = getProviderControlDefaults(providerControl);
    const defaultProviderId = defaults?.providerId;
    const defaultModelId = defaults?.modelId;
    const effectiveProviderId: RuntimeProviderId = isProviderId(defaultProviderId) ? defaultProviderId : 'openai';
    const effectiveModelId = defaultModelId ?? 'openai/gpt-5';
    const defaultProviderEntry = findProviderControlEntry(providerControl, effectiveProviderId);
    const defaultModel = defaultProviderEntry?.models.find((model) => model.id === defaultModelId);
    const defaultProvider = defaultProviderEntry?.provider;

    const resolvedContextStateQueryInput = {
        profileId: resolvedSelectedProfileId,
        providerId: effectiveProviderId,
        modelId: effectiveModelId,
    };
    const resolvedContextStateQuery = trpc.context.getResolvedState.useQuery(resolvedContextStateQueryInput, {
        enabled: resolvedSelectedProfileId.length > 0 && Boolean(defaultProviderId) && Boolean(defaultModelId),
        ...PROGRESSIVE_QUERY_OPTIONS,
    });

    const globalDraft = resolveContextGlobalDraft({
        settings: globalSettingsQuery.data?.settings,
        draft: undefined,
    });
    const profileDraft = resolveContextProfileDraft({
        profileId: resolvedSelectedProfileId,
        inheritedPercent: globalDraft.percent,
        settings: profileSettingsQuery.data?.settings,
        draft: undefined,
    });
    const composerMediaDraft = resolveComposerMediaSettingsDraft({
        settings: composerMediaSettingsQuery.data?.settings,
        draft: undefined,
    });

    const setGlobalSettingsMutation = trpc.context.setGlobalSettings.useMutation({
        onSuccess: ({ settings, resolvedState }) => {
            setFeedbackTone('success');
            setFeedbackMessage('Saved global context defaults.');
            utils.context.getGlobalSettings.setData(undefined, { settings });
            if (resolvedState) {
                setResolvedContextStateCache({
                    utils,
                    queryInput: resolvedContextStateQueryInput,
                    state: resolvedState,
                });
            }
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    const setProfileSettingsMutation = trpc.context.setProfileSettings.useMutation({
        onSuccess: ({ settings, resolvedState }) => {
            setFeedbackTone('success');
            setFeedbackMessage('Saved profile context override.');
            utils.context.getProfileSettings.setData({ profileId: resolvedSelectedProfileId }, { settings });
            if (resolvedState) {
                setResolvedContextStateCache({
                    utils,
                    queryInput: resolvedContextStateQueryInput,
                    state: resolvedState,
                });
            }
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    const setComposerMediaSettingsMutation = trpc.composer.setSettings.useMutation({
        onSuccess: ({ settings }) => {
            setFeedbackTone('success');
            setFeedbackMessage('Saved composer media defaults.');
            utils.composer.getSettings.setData(undefined, { settings });
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    async function saveGlobalSettings(draft: ContextGlobalDraft): Promise<void> {
        const percent = Number(draft.percent);
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
            setFeedbackTone('error');
            setFeedbackMessage('Global compact threshold must be an integer between 1 and 100.');
            return;
        }

        await setGlobalSettingsMutation.mutateAsync({
            enabled: draft.enabled,
            mode: 'percent',
            percent,
            preview: resolvedContextStateQueryInput,
        });
    }

    async function saveProfileSettings(draft: ContextProfileDraft): Promise<void> {
        if (draft.overrideMode === 'inherit') {
            await setProfileSettingsMutation.mutateAsync({
                profileId: resolvedSelectedProfileId,
                overrideMode: 'inherit',
                preview: resolvedContextStateQueryInput,
            });
            return;
        }

        if (draft.overrideMode === 'percent') {
            const percent = Number(draft.percent);
            if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
                setFeedbackTone('error');
                setFeedbackMessage('Profile compact threshold must be an integer between 1 and 100.');
                return;
            }

            await setProfileSettingsMutation.mutateAsync({
                profileId: resolvedSelectedProfileId,
                overrideMode: 'percent',
                percent,
                preview: resolvedContextStateQueryInput,
            });
            return;
        }

        const fixedInputTokens = Number(draft.fixedInputTokens);
        if (!Number.isInteger(fixedInputTokens) || fixedInputTokens < 1) {
            setFeedbackTone('error');
            setFeedbackMessage('Fixed input tokens must be a positive integer.');
            return;
        }

        await setProfileSettingsMutation.mutateAsync({
            profileId: resolvedSelectedProfileId,
            overrideMode: 'fixed_tokens',
            fixedInputTokens,
            preview: resolvedContextStateQueryInput,
        });
    }

    async function saveComposerMediaSettings(draft: ComposerMediaSettingsDraft): Promise<void> {
        const maxImageAttachmentsPerMessage = Number(draft.maxImageAttachmentsPerMessage);
        if (!Number.isInteger(maxImageAttachmentsPerMessage)) {
            return;
        }

        const imageCompressionConcurrency = Number(draft.imageCompressionConcurrency);
        if (!Number.isInteger(imageCompressionConcurrency)) {
            return;
        }

        await setComposerMediaSettingsMutation.mutateAsync({
            maxImageAttachmentsPerMessage,
            imageCompressionConcurrency,
        });
    }

    function clearFeedback(): void {
        setFeedbackMessage(undefined);
    }

    return {
        selection: {
            profiles,
            selectedProfileId: resolvedSelectedProfileId,
            setSelectedProfileId: (profileId: string) => {
                setSelectedProfileId(profileId);
                clearFeedback();
            },
        },
        feedback: {
            message: feedbackMessage,
            tone: feedbackTone,
            clear: clearFeedback,
        },
        composerMedia: {
            draft: composerMediaDraft,
            draftKey: `${composerMediaDraft.maxImageAttachmentsPerMessage}:${composerMediaDraft.imageCompressionConcurrency}`,
            isSaving: setComposerMediaSettingsMutation.isPending,
            save: wrapFailClosedAction(saveComposerMediaSettings),
        },
        globalDefaults: {
            draft: globalDraft,
            draftKey: `${String(globalDraft.enabled)}:${globalDraft.percent}`,
            isSaving: setGlobalSettingsMutation.isPending,
            save: wrapFailClosedAction(saveGlobalSettings),
        },
        profileOverride: {
            draft: profileDraft,
            draftKey: [
                resolvedSelectedProfileId,
                profileDraft.overrideMode,
                profileDraft.percent,
                profileDraft.fixedInputTokens,
            ].join(':'),
            isSaving: setProfileSettingsMutation.isPending,
            save: wrapFailClosedAction(saveProfileSettings),
            modelLimitsKnown: resolvedContextStateQuery.data?.policy.limits.modelLimitsKnown ?? false,
        },
        resolvedPreview: {
            defaultModel,
            defaultProvider,
            state: resolvedContextStateQuery.data,
        },
    };
}

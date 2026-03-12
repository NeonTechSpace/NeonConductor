import { useEffect, useState } from 'react';

import { createProviderSettingsActions } from '@/web/components/settings/providerSettings/hooks/providerSettingsActions';
import { resetProviderSettingsState } from '@/web/components/settings/providerSettings/hooks/providerSettingsState';
import { useKiloRoutingDraft } from '@/web/components/settings/providerSettings/hooks/useKiloRoutingDraft';
import { useProviderSettingsAuthPolling } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsAuthPolling';
import { useProviderSettingsMutations } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutations';
import { useProviderSettingsQueries } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsQueries';
import { prefetchProviderSettingsData } from '@/web/components/settings/providerSettings/providerSettingsPrefetch';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderSettingsControllerOptions {
    initialProviderId?: RuntimeProviderId;
}

export function useProviderSettingsController(profileId: string, options?: ProviderSettingsControllerOptions) {
    const utils = trpc.useUtils();
    const [requestedProviderId, setRequestedProviderId] = useState<RuntimeProviderId | undefined>(
        () => options?.initialProviderId
    );
    const [requestedModelId, setRequestedModelId] = useState('');
    const [activeAuthFlow, setActiveAuthFlow] = useState<ActiveAuthFlow | undefined>(undefined);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    const queries = useProviderSettingsQueries({
        profileId,
        requestedProviderId,
        requestedModelId,
    });
    const selectedProviderId = queries.selectedProviderId;

    useEffect(() => {
        resetProviderSettingsState({
            setActiveAuthFlow,
            setStatusMessage,
        });
        setRequestedProviderId(options?.initialProviderId);
        setRequestedModelId('');
    }, [options?.initialProviderId, profileId]);

    const mutations = useProviderSettingsMutations({
        profileId,
        selectedProviderId,
        setStatusMessage,
        setActiveAuthFlow,
    });
    const ignoreMutationResult = <TInput, TResult>(mutateAsync: (input: TInput) => Promise<TResult>) => {
        return async (input: TInput): Promise<void> => {
            await mutateAsync(input);
        };
    };

    useProviderSettingsAuthPolling({
        profileId,
        activeAuthFlow,
        isPolling: mutations.pollAuthMutation.isPending,
        pollAuth: ignoreMutationResult(mutations.pollAuthMutation.mutateAsync),
    });

    const { kiloRoutingDraft } = useKiloRoutingDraft({
        profileId,
        selectedProviderId,
        selectedModelId: queries.selectedModelId,
        preference: queries.kiloRoutingPreferenceQuery.data?.preference,
        providerOptions: queries.kiloModelProviders,
        setStatusMessage,
        savePreference: async (saveInput) => {
            await mutations.setModelRoutingPreferenceMutation.mutateAsync(saveInput);
        },
    });

    const loadStoredCredential = async (): Promise<string | undefined> => {
        if (!selectedProviderId) {
            return undefined;
        }

        const result = await utils.provider.getCredentialValue.fetch({
            profileId,
            providerId: selectedProviderId,
        });
        if (!result.credential) {
            setStatusMessage('No stored credential is available for this provider.');
            return undefined;
        }

        return result.credential.value;
    };

    const actions = createProviderSettingsActions({
        profileId,
        selectedProviderId,
        selectedModelId: queries.selectedModelId,
        currentOptionProfileId: queries.selectedProvider?.connectionProfile.optionProfileId ?? 'default',
        activeAuthFlow,
        kiloModelProviderIds: queries.kiloModelProviders.map((provider) => provider.providerId),
        kiloRoutingDraft,
        setSelectedProviderId: setRequestedProviderId,
        setStatusMessage,
        mutations: {
            setDefaultMutation: {
                mutateAsync: ignoreMutationResult(mutations.setDefaultMutation.mutateAsync),
            },
            syncCatalogMutation: {
                mutateAsync: ignoreMutationResult(mutations.syncCatalogMutation.mutateAsync),
            },
            setModelRoutingPreferenceMutation: {
                mutateAsync: ignoreMutationResult(mutations.setModelRoutingPreferenceMutation.mutateAsync),
            },
            setConnectionProfileMutation: {
                mutateAsync: ignoreMutationResult(mutations.setConnectionProfileMutation.mutateAsync),
            },
            setOrganizationMutation: {
                mutateAsync: ignoreMutationResult(mutations.setOrganizationMutation.mutateAsync),
            },
            setApiKeyMutation: {
                mutateAsync: ignoreMutationResult(mutations.setApiKeyMutation.mutateAsync),
            },
            startAuthMutation: {
                mutateAsync: ignoreMutationResult(mutations.startAuthMutation.mutateAsync),
            },
            pollAuthMutation: {
                mutateAsync: ignoreMutationResult(mutations.pollAuthMutation.mutateAsync),
            },
            cancelAuthMutation: {
                mutateAsync: ignoreMutationResult(mutations.cancelAuthMutation.mutateAsync),
            },
            openExternalUrlMutation: {
                mutateAsync: ignoreMutationResult(mutations.openExternalUrlMutation.mutateAsync),
            },
        },
        onPreviewProvider: (providerId) => {
            prefetchProviderSettingsData({
                profileId,
                providerId,
                trpcUtils: utils,
            });
        },
    });

    const feedbackMessage =
        mutations.setDefaultMutation.error?.message ??
        mutations.setApiKeyMutation.error?.message ??
        mutations.setConnectionProfileMutation.error?.message ??
        mutations.syncCatalogMutation.error?.message ??
        mutations.setModelRoutingPreferenceMutation.error?.message ??
        mutations.setOrganizationMutation.error?.message ??
        mutations.startAuthMutation.error?.message ??
        mutations.pollAuthMutation.error?.message ??
        mutations.cancelAuthMutation.error?.message ??
        statusMessage;
    const feedbackTone =
        mutations.setDefaultMutation.error ??
        mutations.setApiKeyMutation.error ??
        mutations.setConnectionProfileMutation.error ??
        mutations.syncCatalogMutation.error ??
        mutations.setModelRoutingPreferenceMutation.error ??
        mutations.setOrganizationMutation.error ??
        mutations.startAuthMutation.error ??
        mutations.pollAuthMutation.error ??
        mutations.cancelAuthMutation.error
            ? ('error' as const)
            : statusMessage
              ? ('success' as const)
              : ('info' as const);

    return {
        feedback: {
            message: feedbackMessage,
            tone: feedbackTone,
        },
        selection: {
            providerItems: queries.providerItems,
            selectedProviderId,
            selectedProvider: queries.selectedProvider,
            selectProvider: actions.selectProvider,
            prefetchProvider: (providerId: RuntimeProviderId) => {
                prefetchProviderSettingsData({
                    profileId,
                    providerId,
                    trpcUtils: utils,
                });
            },
        },
        providerStatus: {
            authState: queries.selectedAuthState,
            accountContext: queries.kiloAccountContext,
            usageSummary: queries.selectedProviderUsageSummary,
            openAISubscriptionUsage: queries.openAISubscriptionUsage,
            openAISubscriptionRateLimits: queries.openAISubscriptionRateLimits,
            isLoadingAccountContext: queries.accountContextQuery.isLoading,
            isLoadingUsageSummary: queries.usageSummaryQuery.isLoading,
            isLoadingOpenAIUsage: queries.openAISubscriptionUsageQuery.isLoading,
            isLoadingOpenAIRateLimits: queries.openAISubscriptionRateLimitsQuery.isLoading,
        },
        authentication: {
            methods: queries.selectedProvider?.availableAuthMethods ?? [],
            credentialSummary: queries.credentialSummary,
            activeAuthFlow,
            isSavingApiKey: mutations.setApiKeyMutation.isPending,
            isSavingConnectionProfile: mutations.setConnectionProfileMutation.isPending,
            isStartingAuth: mutations.startAuthMutation.isPending,
            isPollingAuth: mutations.pollAuthMutation.isPending,
            isCancellingAuth: mutations.cancelAuthMutation.isPending,
            isOpeningVerificationPage: mutations.openExternalUrlMutation.isPending,
            changeConnectionProfile: actions.changeConnectionProfile,
            saveApiKey: actions.saveApiKey,
            saveBaseUrlOverride: actions.saveBaseUrlOverride,
            loadStoredCredential,
            startOAuthDevice: actions.startOAuthDevice,
            startDeviceCode: actions.startDeviceCode,
            pollNow: actions.pollNow,
            cancelFlow: actions.cancelFlow,
            openVerificationPage: actions.openVerificationPage,
        },
        models: {
            selectedModelId: queries.selectedModelId,
            options: queries.modelOptions,
            isDefaultModel: queries.selectedIsDefaultModel,
            isSavingDefault: mutations.setDefaultMutation.isPending,
            isSyncingCatalog: mutations.syncCatalogMutation.isPending,
            setSelectedModelId: setRequestedModelId,
            setDefaultModel: actions.setDefaultModel,
            syncCatalog: actions.syncCatalog,
        },
        kilo: {
            routingDraft: kiloRoutingDraft,
            modelProviders: queries.kiloModelProviders,
            accountContext: queries.kiloAccountContext,
            isLoadingRoutingPreference: queries.kiloRoutingPreferenceQuery.isLoading,
            isLoadingModelProviders: queries.kiloModelProvidersQuery.isLoading,
            isSavingRoutingPreference: mutations.setModelRoutingPreferenceMutation.isPending,
            isSavingOrganization: mutations.setOrganizationMutation.isPending,
            changeRoutingMode: actions.changeRoutingMode,
            changeRoutingSort: actions.changeRoutingSort,
            changePinnedProvider: actions.changePinnedProvider,
            changeOrganization: actions.changeOrganization,
        },
    };
}

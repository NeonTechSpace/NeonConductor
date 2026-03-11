import { useEffect, useState } from 'react';

import { createProviderSettingsActions } from '@/web/components/settings/providerSettings/hooks/providerSettingsActions';
import { resetProviderSettingsState } from '@/web/components/settings/providerSettings/hooks/providerSettingsState';
import { useKiloRoutingDraft } from '@/web/components/settings/providerSettings/hooks/useKiloRoutingDraft';
import { useProviderSettingsAuthPolling } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsAuthPolling';
import { useProviderSettingsMutations } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutations';
import { prefetchProviderSettingsData } from '@/web/components/settings/providerSettings/providerSettingsPrefetch';
import {
    resolveSelectedModelId,
    resolveSelectedProviderId,
} from '@/web/components/settings/providerSettings/selection';
import type {
    ActiveAuthFlow,
    ProviderAuthStateView,
    ProviderListItem,
} from '@/web/components/settings/providerSettings/types';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
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
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [activeAuthFlow, setActiveAuthFlow] = useState<ActiveAuthFlow | undefined>(undefined);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const [isCredentialVisible, setIsCredentialVisible] = useState(false);
    const [hasLoadedStoredCredential, setHasLoadedStoredCredential] = useState(false);

    const providersQuery = trpc.provider.listProviders.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const defaultsQuery = trpc.provider.getDefaults.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const providers = providersQuery.data?.providers ?? [];
    const defaults = defaultsQuery.data?.defaults;
    const selectedProviderId = resolveSelectedProviderId(providers, requestedProviderId);

    const listModelsQuery = trpc.provider.listModels.useQuery(
        {
            profileId,
            providerId: selectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(selectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const authStateQuery = trpc.provider.getAuthState.useQuery(
        {
            profileId,
            providerId: selectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(selectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const credentialSummaryQuery = trpc.provider.getCredentialSummary.useQuery(
        {
            profileId,
            providerId: selectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(selectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const models = listModelsQuery.data?.models ?? [];
    const selectedModelId = resolveSelectedModelId({
        selectedProviderId,
        selectedModelId: requestedModelId,
        models,
        defaults,
    });

    const kiloRoutingPreferenceQuery = trpc.provider.getModelRoutingPreference.useQuery(
        {
            profileId,
            providerId: 'kilo',
            modelId: selectedModelId,
        },
        {
            enabled: selectedProviderId === 'kilo' && selectedModelId.trim().length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const kiloModelProvidersQuery = trpc.provider.listModelProviders.useQuery(
        {
            profileId,
            providerId: 'kilo',
            modelId: selectedModelId,
        },
        {
            enabled: selectedProviderId === 'kilo' && selectedModelId.trim().length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const accountContextQuery = trpc.provider.getAccountContext.useQuery(
        {
            profileId,
            providerId: selectedProviderId ?? 'kilo',
        },
        {
            enabled: selectedProviderId === 'kilo',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const usageSummaryQuery = trpc.provider.getUsageSummary.useQuery(
        {
            profileId,
        },
        {
            enabled: Boolean(selectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const openAISubscriptionUsageQuery = trpc.provider.getOpenAISubscriptionUsage.useQuery(
        {
            profileId,
        },
        {
            enabled: selectedProviderId === 'openai',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const openAISubscriptionRateLimitsQuery = trpc.provider.getOpenAISubscriptionRateLimits.useQuery(
        {
            profileId,
        },
        {
            enabled: selectedProviderId === 'openai',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const queries = {
        providersQuery,
        defaultsQuery,
        listModelsQuery,
        authStateQuery,
        credentialSummaryQuery,
        kiloRoutingPreferenceQuery,
        kiloModelProvidersQuery,
        accountContextQuery,
        usageSummaryQuery,
        openAISubscriptionUsageQuery,
        openAISubscriptionRateLimitsQuery,
    };
    const providerItems: ProviderListItem[] = providers;
    const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
    const kiloModelProviders = kiloModelProvidersQuery.data?.providers ?? [];

    useEffect(() => {
        resetProviderSettingsState({
            setActiveAuthFlow,
            setApiKeyInput,
            setStatusMessage,
        });
        setRequestedProviderId(options?.initialProviderId);
    }, [options?.initialProviderId, profileId]);

    useEffect(() => {
        setApiKeyInput('');
        setIsCredentialVisible(false);
        setHasLoadedStoredCredential(false);
    }, [selectedProviderId]);

    const mutations = useProviderSettingsMutations({
        profileId,
        selectedProviderId,
        setStatusMessage,
        setApiKeyInput,
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

    const selectedAuthState: ProviderAuthStateView | undefined = authStateQuery.data?.found
        ? authStateQuery.data.state
        : undefined;
    const credentialSummary = credentialSummaryQuery.data?.credential;
    const kiloAccountContext =
        accountContextQuery.data?.providerId === 'kilo' ? accountContextQuery.data.kiloAccountContext : undefined;
    const selectedProviderUsageSummary = usageSummaryQuery.data?.summaries.find(
        (summary) => summary.providerId === selectedProviderId
    );
    const selectedIsDefaultProvider = defaults?.providerId === selectedProviderId;
    const selectedIsDefaultModel = selectedIsDefaultProvider && defaults?.modelId === selectedModelId;
    const openAISubscriptionUsage = openAISubscriptionUsageQuery.data?.usage;
    const openAISubscriptionRateLimits = openAISubscriptionRateLimitsQuery.data?.rateLimits;

    const { kiloRoutingDraft } = useKiloRoutingDraft({
        profileId,
        selectedProviderId,
        selectedModelId,
        preference: kiloRoutingPreferenceQuery.data?.preference,
        providerOptions: kiloModelProviders,
        setStatusMessage,
        savePreference: async (saveInput) => {
            await mutations.setModelRoutingPreferenceMutation.mutateAsync(saveInput);
        },
    });

    useEffect(() => {
        if (
            selectedProviderId !== 'kilo' ||
            hasLoadedStoredCredential ||
            credentialSummary?.credentialSource !== 'access_token' ||
            apiKeyInput.trim().length > 0
        ) {
            return;
        }

        let cancelled = false;
        void (async () => {
            const result = await utils.provider.getCredentialValue.fetch({
                profileId,
                providerId: 'kilo',
            });
            if (!result.credential || cancelled) {
                return;
            }

            setApiKeyInput(result.credential.value);
            setHasLoadedStoredCredential(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [
        apiKeyInput,
        credentialSummary?.credentialSource,
        hasLoadedStoredCredential,
        profileId,
        selectedProviderId,
        utils.provider.getCredentialValue,
    ]);

    const revealStoredCredential = async () => {
        if (!selectedProviderId) {
            return;
        }

        if (apiKeyInput.trim().length === 0 && credentialSummary?.hasStoredCredential) {
            const result = await utils.provider.getCredentialValue.fetch({
                profileId,
                providerId: selectedProviderId,
            });
            if (!result.credential) {
                setStatusMessage('No stored credential is available for this provider.');
                return;
            }

            setApiKeyInput(result.credential.value);
            setHasLoadedStoredCredential(true);
        }

        setIsCredentialVisible(true);
    };

    const hideStoredCredential = () => {
        setIsCredentialVisible(false);
    };

    const copyStoredCredential = async () => {
        if (!selectedProviderId) {
            return;
        }

        const credentialValue =
            apiKeyInput.trim().length > 0
                ? apiKeyInput
                : (await utils.provider.getCredentialValue.fetch({
                      profileId,
                      providerId: selectedProviderId,
                  })).credential?.value;
        if (!credentialValue) {
            setStatusMessage('No stored credential is available for this provider.');
            return;
        }

        await navigator.clipboard.writeText(credentialValue);
        setHasLoadedStoredCredential(true);
        setStatusMessage('Stored credential copied.');
    };
    const actions = createProviderSettingsActions({
        profileId,
        selectedProviderId,
        selectedModelId,
        apiKeyInput,
        activeAuthFlow,
        kiloModelProviderIds: kiloModelProviders.map((provider) => provider.providerId),
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
            setEndpointProfileMutation: {
                mutateAsync: ignoreMutationResult(mutations.setEndpointProfileMutation.mutateAsync),
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

    return {
        feedbackMessage:
            mutations.setDefaultMutation.error?.message ??
            mutations.setApiKeyMutation.error?.message ??
            mutations.setEndpointProfileMutation.error?.message ??
            mutations.syncCatalogMutation.error?.message ??
            mutations.setModelRoutingPreferenceMutation.error?.message ??
            mutations.setOrganizationMutation.error?.message ??
            mutations.startAuthMutation.error?.message ??
            mutations.pollAuthMutation.error?.message ??
            mutations.cancelAuthMutation.error?.message ??
            statusMessage,
        feedbackTone:
            (mutations.setDefaultMutation.error ??
            mutations.setApiKeyMutation.error ??
            mutations.setEndpointProfileMutation.error ??
            mutations.syncCatalogMutation.error ??
            mutations.setModelRoutingPreferenceMutation.error ??
            mutations.setOrganizationMutation.error ??
            mutations.startAuthMutation.error ??
            mutations.pollAuthMutation.error ??
            mutations.cancelAuthMutation.error)
                ? ('error' as const)
                : statusMessage
                  ? ('success' as const)
                  : ('info' as const),
        selectedProviderId,
        selectedModelId,
        apiKeyInput,
        isCredentialVisible,
        activeAuthFlow,
        statusMessage,
        providerItems,
        selectedProvider,
        models,
        credentialSummary,
        methods: selectedProvider?.availableAuthMethods ?? [],
        kiloModelProviders,
        selectedAuthState,
        kiloAccountContext,
        selectedProviderUsageSummary,
        selectedIsDefaultModel,
        openAISubscriptionUsage,
        openAISubscriptionRateLimits,
        kiloRoutingDraft,
        queries,
        mutations,
        ...actions,
        prefetchProvider: (providerId: RuntimeProviderId) => {
            prefetchProviderSettingsData({
                profileId,
                providerId,
                trpcUtils: utils,
            });
        },
        revealStoredCredential,
        hideStoredCredential,
        copyStoredCredential,
        setSelectedModelId: setRequestedModelId,
        setApiKeyInput,
        setStatusMessage,
    };
}

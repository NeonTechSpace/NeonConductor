import { useEffect, useState } from 'react';

import { createProviderSettingsActions } from '@/web/components/settings/providerSettings/hooks/providerSettingsActions';
import { resetProviderSettingsState } from '@/web/components/settings/providerSettings/hooks/providerSettingsState';
import { useKiloRoutingDraft } from '@/web/components/settings/providerSettings/hooks/useKiloRoutingDraft';
import { useProviderSettingsAuthPolling } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsAuthPolling';
import { useProviderSettingsMutations } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutations';
import { useProviderSettingsQueries } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsQueries';
import { prefetchProviderSettingsData } from '@/web/components/settings/providerSettings/providerSettingsPrefetch';
import { resolveSelectedModelId, resolveSelectedProviderId } from '@/web/components/settings/providerSettings/selection';
import type {
    ActiveAuthFlow,
    ProviderAuthStateView,
    ProviderListItem,
} from '@/web/components/settings/providerSettings/types';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export function useProviderSettingsController(profileId: string) {
    const utils = trpc.useUtils();
    const [selectedProviderId, setSelectedProviderId] = useState<RuntimeProviderId | undefined>(undefined);
    const [selectedModelId, setSelectedModelId] = useState('');
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [activeAuthFlow, setActiveAuthFlow] = useState<ActiveAuthFlow | undefined>(undefined);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    const queries = useProviderSettingsQueries({
        profileId,
        selectedProviderId,
        selectedModelId,
    });
    const providers = queries.providersQuery.data?.providers ?? [];
    const defaults = queries.defaultsQuery.data?.defaults;
    const providerItems: ProviderListItem[] = providers;
    const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
    const models = queries.listModelsQuery.data?.models ?? [];
    const kiloModelProviders = queries.kiloModelProvidersQuery.data?.providers ?? [];

    useEffect(() => {
        resetProviderSettingsState({
            setActiveAuthFlow,
            setApiKeyInput,
            setStatusMessage,
        });
    }, [profileId]);

    useEffect(() => {
        const nextProviderId = resolveSelectedProviderId(providers, selectedProviderId);
        if (nextProviderId && nextProviderId !== selectedProviderId) {
            setSelectedProviderId(nextProviderId);
        }
    }, [providers, selectedProviderId]);

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

    useEffect(() => {
        const nextModelId = resolveSelectedModelId({
            selectedProviderId,
            selectedModelId,
            models,
            defaults,
        });
        if (nextModelId !== selectedModelId) {
            setSelectedModelId(nextModelId);
        }
    }, [defaults, models, selectedModelId, selectedProviderId]);

    const selectedAuthState: ProviderAuthStateView | undefined = queries.authStateQuery.data?.found
        ? queries.authStateQuery.data.state
        : undefined;
    const kiloAccountContext =
        queries.accountContextQuery.data?.providerId === 'kilo'
            ? queries.accountContextQuery.data.kiloAccountContext
            : undefined;
    const selectedProviderUsageSummary = queries.usageSummaryQuery.data?.summaries.find(
        (summary) => summary.providerId === selectedProviderId
    );
    const selectedIsDefaultProvider = defaults?.providerId === selectedProviderId;
    const selectedIsDefaultModel = selectedIsDefaultProvider && defaults?.modelId === selectedModelId;
    const openAISubscriptionUsage = queries.openAISubscriptionUsageQuery.data?.usage;
    const openAISubscriptionRateLimits = queries.openAISubscriptionRateLimitsQuery.data?.rateLimits;

    const { kiloRoutingDraft } = useKiloRoutingDraft({
        profileId,
        selectedProviderId,
        selectedModelId,
        preference: queries.kiloRoutingPreferenceQuery.data?.preference,
        providerOptions: kiloModelProviders,
        setStatusMessage,
        savePreference: async (saveInput) => {
            await mutations.setModelRoutingPreferenceMutation.mutateAsync(saveInput);
        },
    });
    const actions = createProviderSettingsActions({
        profileId,
        selectedProviderId,
        selectedModelId,
        apiKeyInput,
        activeAuthFlow,
        kiloModelProviderIds: kiloModelProviders.map((provider) => provider.providerId),
        kiloRoutingDraft,
        setSelectedProviderId,
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
            mutations.setDefaultMutation.error ??
            mutations.setApiKeyMutation.error ??
            mutations.setEndpointProfileMutation.error ??
            mutations.syncCatalogMutation.error ??
            mutations.setModelRoutingPreferenceMutation.error ??
            mutations.setOrganizationMutation.error ??
            mutations.startAuthMutation.error ??
            mutations.pollAuthMutation.error ??
            mutations.cancelAuthMutation.error
                ? ('error' as const)
                : statusMessage
                  ? ('success' as const)
                  : ('info' as const),
        selectedProviderId,
        selectedModelId,
        apiKeyInput,
        activeAuthFlow,
        statusMessage,
        providerItems,
        selectedProvider,
        models,
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
        setSelectedModelId,
        setApiKeyInput,
        setStatusMessage,
    };
}

import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import {
    resolveSelectedModelId,
    resolveSelectedProviderId,
} from '@/web/components/settings/providerSettings/selection';
import type { ProviderAuthStateView, ProviderListItem } from '@/web/components/settings/providerSettings/types';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsQueriesInput {
    profileId: string;
    requestedProviderId: RuntimeProviderId | undefined;
    requestedModelId: string;
}

export function useProviderSettingsQueries(input: UseProviderSettingsQueriesInput) {
    const providersQuery = trpc.provider.listProviders.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const defaultsQuery = trpc.provider.getDefaults.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const providers = providersQuery.data?.providers ?? [];
    const defaults = defaultsQuery.data?.defaults;
    const resolvedSelectedProviderId = resolveSelectedProviderId(providers, input.requestedProviderId);

    const listModelsQuery = trpc.provider.listModels.useQuery(
        {
            profileId: input.profileId,
            providerId: resolvedSelectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(resolvedSelectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const authStateQuery = trpc.provider.getAuthState.useQuery(
        {
            profileId: input.profileId,
            providerId: resolvedSelectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(resolvedSelectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const credentialSummaryQuery = trpc.provider.getCredentialSummary.useQuery(
        {
            profileId: input.profileId,
            providerId: resolvedSelectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(resolvedSelectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const selectedProvider = providers.find((provider) => provider.id === resolvedSelectedProviderId);
    const models = listModelsQuery.data?.models ?? [];
    const selectedModelId = resolveSelectedModelId({
        selectedProviderId: resolvedSelectedProviderId,
        selectedModelId: input.requestedModelId,
        models,
        defaults,
    });

    const kiloRoutingPreferenceQuery = trpc.provider.getModelRoutingPreference.useQuery(
        {
            profileId: input.profileId,
            providerId: 'kilo',
            modelId: selectedModelId,
        },
        {
            enabled: resolvedSelectedProviderId === 'kilo' && selectedModelId.trim().length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const kiloModelProvidersQuery = trpc.provider.listModelProviders.useQuery(
        {
            profileId: input.profileId,
            providerId: 'kilo',
            modelId: selectedModelId,
        },
        {
            enabled: resolvedSelectedProviderId === 'kilo' && selectedModelId.trim().length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const accountContextQuery = trpc.provider.getAccountContext.useQuery(
        {
            profileId: input.profileId,
            providerId: resolvedSelectedProviderId ?? 'kilo',
        },
        {
            enabled: resolvedSelectedProviderId === 'kilo',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const usageSummaryQuery = trpc.provider.getUsageSummary.useQuery(
        {
            profileId: input.profileId,
        },
        {
            enabled: Boolean(resolvedSelectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const openAISubscriptionUsageQuery = trpc.provider.getOpenAISubscriptionUsage.useQuery(
        {
            profileId: input.profileId,
        },
        {
            enabled: resolvedSelectedProviderId === 'openai_codex',
            ...PROGRESSIVE_QUERY_OPTIONS,
            refetchOnWindowFocus: resolvedSelectedProviderId === 'openai_codex',
        }
    );

    const openAISubscriptionRateLimitsQuery = trpc.provider.getOpenAISubscriptionRateLimits.useQuery(
        {
            profileId: input.profileId,
        },
        {
            enabled: resolvedSelectedProviderId === 'openai_codex',
            ...PROGRESSIVE_QUERY_OPTIONS,
            refetchOnWindowFocus: resolvedSelectedProviderId === 'openai_codex',
        }
    );

    const providerItems: ProviderListItem[] = providers;
    const modelOptions = models.map((model) =>
        buildModelPickerOption({
            model,
            ...(selectedProvider ? { provider: selectedProvider } : {}),
            compatibilityContext: {
                surface: 'settings',
            },
        })
    );
    const selectedAuthState: ProviderAuthStateView | undefined = authStateQuery.data?.found
        ? authStateQuery.data.state
        : undefined;
    const credentialSummary = credentialSummaryQuery.data?.credential;
    const kiloAccountContext =
        accountContextQuery.data?.providerId === 'kilo' ? accountContextQuery.data.kiloAccountContext : undefined;
    const selectedProviderUsageSummary = usageSummaryQuery.data?.summaries.find(
        (summary) => summary.providerId === resolvedSelectedProviderId
    );
    const selectedIsDefaultProvider = defaults?.providerId === resolvedSelectedProviderId;
    const selectedIsDefaultModel = selectedIsDefaultProvider && defaults?.modelId === selectedModelId;
    const kiloModelProviders = kiloModelProvidersQuery.data?.providers ?? [];
    const catalogStateDetail = listModelsQuery.data && 'detail' in listModelsQuery.data ? listModelsQuery.data.detail : undefined;

    return {
        providerItems,
        defaults,
        selectedProviderId: resolvedSelectedProviderId,
        selectedProvider,
        models,
        modelOptions,
        selectedModelId,
        selectedAuthState,
        credentialSummary,
        kiloModelProviders,
        kiloAccountContext,
        selectedProviderUsageSummary,
        selectedIsDefaultModel,
        catalogStateReason: listModelsQuery.data?.reason ?? null,
        catalogStateDetail,
        openAISubscriptionUsage: openAISubscriptionUsageQuery.data?.usage,
        openAISubscriptionRateLimits: openAISubscriptionRateLimitsQuery.data?.rateLimits,
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
}


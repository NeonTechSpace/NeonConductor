import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsSupplementalQueriesInput {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string;
}

export function useProviderSettingsSupplementalQueries(input: UseProviderSettingsSupplementalQueriesInput) {
    const selectedProviderId = input.selectedProviderId;

    const authStateQuery = trpc.provider.getAuthState.useQuery(
        {
            profileId: input.profileId,
            providerId: selectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(selectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const credentialSummaryQuery = trpc.provider.getCredentialSummary.useQuery(
        {
            profileId: input.profileId,
            providerId: selectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(selectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const kiloRoutingPreferenceQuery = trpc.provider.getModelRoutingPreference.useQuery(
        {
            profileId: input.profileId,
            providerId: 'kilo',
            modelId: input.selectedModelId,
        },
        {
            enabled: selectedProviderId === 'kilo' && input.selectedModelId.trim().length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const kiloModelProvidersQuery = trpc.provider.listModelProviders.useQuery(
        {
            profileId: input.profileId,
            providerId: 'kilo',
            modelId: input.selectedModelId,
        },
        {
            enabled: selectedProviderId === 'kilo' && input.selectedModelId.trim().length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const accountContextQuery = trpc.provider.getAccountContext.useQuery(
        {
            profileId: input.profileId,
            providerId: selectedProviderId ?? 'kilo',
        },
        {
            enabled: selectedProviderId === 'kilo',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const kiloCloudSessionPrerequisitesQuery = trpc.provider.getCloudSessionPrerequisites.useQuery(
        {
            profileId: input.profileId,
            providerId: 'kilo',
        },
        {
            enabled: selectedProviderId === 'kilo',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const usageSummaryQuery = trpc.provider.getUsageSummary.useQuery(
        {
            profileId: input.profileId,
        },
        {
            enabled: Boolean(selectedProviderId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const openAISubscriptionUsageQuery = trpc.provider.getOpenAISubscriptionUsage.useQuery(
        {
            profileId: input.profileId,
        },
        {
            enabled: selectedProviderId === 'openai_codex',
            ...PROGRESSIVE_QUERY_OPTIONS,
            refetchOnWindowFocus: selectedProviderId === 'openai_codex',
        }
    );

    const openAISubscriptionRateLimitsQuery = trpc.provider.getOpenAISubscriptionRateLimits.useQuery(
        {
            profileId: input.profileId,
        },
        {
            enabled: selectedProviderId === 'openai_codex',
            ...PROGRESSIVE_QUERY_OPTIONS,
            refetchOnWindowFocus: selectedProviderId === 'openai_codex',
        }
    );

    return {
        authStateQuery,
        credentialSummaryQuery,
        kiloRoutingPreferenceQuery,
        kiloModelProvidersQuery,
        accountContextQuery,
        kiloCloudSessionPrerequisitesQuery,
        usageSummaryQuery,
        openAISubscriptionUsageQuery,
        openAISubscriptionRateLimitsQuery,
        selectedAuthState: authStateQuery.data?.found ? authStateQuery.data.state : undefined,
        credentialSummary: credentialSummaryQuery.data?.credential,
        kiloRoutingPreference: kiloRoutingPreferenceQuery.data?.preference,
        kiloModelProviders: kiloModelProvidersQuery.data?.providers ?? [],
        kiloAccountContext:
            accountContextQuery.data?.providerId === 'kilo' ? accountContextQuery.data.kiloAccountContext : undefined,
        kiloCloudSessionPrerequisites: kiloCloudSessionPrerequisitesQuery.data?.prerequisites,
        selectedProviderUsageSummary: usageSummaryQuery.data?.summaries.find(
            (summary) => summary.providerId === selectedProviderId
        ),
        openAISubscriptionUsage: openAISubscriptionUsageQuery.data?.usage,
        openAISubscriptionRateLimits: openAISubscriptionRateLimitsQuery.data?.rateLimits,
    };
}

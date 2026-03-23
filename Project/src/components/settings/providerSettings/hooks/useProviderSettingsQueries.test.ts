import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    listProvidersUseQuery,
    getDefaultsUseQuery,
    listModelsUseQuery,
    getAuthStateUseQuery,
    getCredentialSummaryUseQuery,
    getModelRoutingPreferenceUseQuery,
    listModelProvidersUseQuery,
    getAccountContextUseQuery,
    getUsageSummaryUseQuery,
    getOpenAISubscriptionUsageUseQuery,
    getOpenAISubscriptionRateLimitsUseQuery,
} = vi.hoisted(() => ({
    listProvidersUseQuery: vi.fn(),
    getDefaultsUseQuery: vi.fn(),
    listModelsUseQuery: vi.fn(),
    getAuthStateUseQuery: vi.fn(),
    getCredentialSummaryUseQuery: vi.fn(),
    getModelRoutingPreferenceUseQuery: vi.fn(),
    listModelProvidersUseQuery: vi.fn(),
    getAccountContextUseQuery: vi.fn(),
    getUsageSummaryUseQuery: vi.fn(),
    getOpenAISubscriptionUsageUseQuery: vi.fn(),
    getOpenAISubscriptionRateLimitsUseQuery: vi.fn(),
}));

vi.mock('@/web/components/modelSelection/modelCapabilities', () => ({
    buildModelPickerOption: vi.fn(({ model }: { model: { id: string; label: string } }) => ({
        id: model.id,
        label: model.label,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        capabilityBadges: [],
        compatibilityState: 'compatible',
    })),
}));

vi.mock('@/web/components/settings/providerSettings/selection', () => ({
    resolveSelectedProviderId: vi.fn(
        (providers: Array<{ id: string }>, requestedProviderId: string | undefined) =>
            requestedProviderId ?? providers[0]?.id
    ),
    resolveSelectedModelId: vi.fn(() => 'openai_codex/gpt-5-codex'),
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        provider: {
            listProviders: { useQuery: listProvidersUseQuery },
            getDefaults: { useQuery: getDefaultsUseQuery },
            listModels: { useQuery: listModelsUseQuery },
            getAuthState: { useQuery: getAuthStateUseQuery },
            getCredentialSummary: { useQuery: getCredentialSummaryUseQuery },
            getModelRoutingPreference: { useQuery: getModelRoutingPreferenceUseQuery },
            listModelProviders: { useQuery: listModelProvidersUseQuery },
            getAccountContext: { useQuery: getAccountContextUseQuery },
            getUsageSummary: { useQuery: getUsageSummaryUseQuery },
            getOpenAISubscriptionUsage: { useQuery: getOpenAISubscriptionUsageUseQuery },
            getOpenAISubscriptionRateLimits: { useQuery: getOpenAISubscriptionRateLimitsUseQuery },
        },
    },
}));

import { useProviderSettingsQueries } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsQueries';

function createProvider(id: 'openai' | 'openai_codex') {
    return {
        id,
        label: id === 'openai' ? 'OpenAI' : 'OpenAI Codex',
        isDefault: false,
        authState: 'authenticated',
        authMethod: id === 'openai' ? 'api_key' : 'oauth_pkce',
        availableAuthMethods: id === 'openai' ? ['api_key'] : ['oauth_pkce'],
        connectionProfile: {
            optionProfileId: 'default',
            label: 'Default',
            options: [{ value: 'default', label: 'Default' }],
            resolvedBaseUrl: null,
        },
        apiKeyCta: { label: 'Create key', url: 'https://example.com' },
        features: {
            catalogStrategy: 'static' as const,
            supportsKiloRouting: false,
            supportsModelProviderListing: false,
            supportsConnectionOptions: false,
            supportsCustomBaseUrl: id === 'openai',
            supportsOrganizationScope: false,
        },
    };
}

describe('useProviderSettingsQueries', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        listProvidersUseQuery.mockReturnValue({
            data: {
                providers: [createProvider('openai'), createProvider('openai_codex')],
            },
        });
        getDefaultsUseQuery.mockReturnValue({
            data: {
                defaults: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
            },
        });
        listModelsUseQuery.mockReturnValue({ data: { models: [] } });
        getAuthStateUseQuery.mockReturnValue({ data: { found: false } });
        getCredentialSummaryUseQuery.mockReturnValue({ data: { credential: null } });
        getModelRoutingPreferenceUseQuery.mockReturnValue({ data: undefined });
        listModelProvidersUseQuery.mockReturnValue({ data: { providers: [] } });
        getAccountContextUseQuery.mockReturnValue({ data: undefined });
        getUsageSummaryUseQuery.mockReturnValue({ data: { summaries: [] } });
        getOpenAISubscriptionUsageUseQuery.mockReturnValue({ data: undefined });
        getOpenAISubscriptionRateLimitsUseQuery.mockReturnValue({ data: undefined });
    });

    it('enables Codex-only focus refetch when OpenAI Codex is selected', () => {
        useProviderSettingsQueries({
            profileId: 'profile_default',
            requestedProviderId: 'openai_codex',
            requestedModelId: '',
        });

        expect(getOpenAISubscriptionUsageUseQuery).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.objectContaining({
                enabled: true,
                refetchOnWindowFocus: true,
            })
        );
        expect(getOpenAISubscriptionRateLimitsUseQuery).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.objectContaining({
                enabled: true,
                refetchOnWindowFocus: true,
            })
        );
    });

    it('keeps Codex account queries disabled when direct OpenAI is selected', () => {
        useProviderSettingsQueries({
            profileId: 'profile_default',
            requestedProviderId: 'openai',
            requestedModelId: '',
        });

        expect(getOpenAISubscriptionUsageUseQuery).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.objectContaining({
                enabled: false,
                refetchOnWindowFocus: false,
            })
        );
        expect(getOpenAISubscriptionRateLimitsUseQuery).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.objectContaining({
                enabled: false,
                refetchOnWindowFocus: false,
            })
        );
    });
});

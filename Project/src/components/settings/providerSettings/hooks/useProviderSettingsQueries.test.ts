import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getControlPlaneUseQuery,
    getAuthStateUseQuery,
    getCredentialSummaryUseQuery,
    getModelRoutingPreferenceUseQuery,
    listModelProvidersUseQuery,
    getAccountContextUseQuery,
    getCloudSessionPrerequisitesUseQuery,
    getUsageSummaryUseQuery,
    getOpenAISubscriptionUsageUseQuery,
    getOpenAISubscriptionRateLimitsUseQuery,
} = vi.hoisted(() => ({
    getControlPlaneUseQuery: vi.fn(),
    getAuthStateUseQuery: vi.fn(),
    getCredentialSummaryUseQuery: vi.fn(),
    getModelRoutingPreferenceUseQuery: vi.fn(),
    listModelProvidersUseQuery: vi.fn(),
    getAccountContextUseQuery: vi.fn(),
    getCloudSessionPrerequisitesUseQuery: vi.fn(),
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

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        provider: {
            getControlPlane: { useQuery: getControlPlaneUseQuery },
            getAuthState: { useQuery: getAuthStateUseQuery },
            getCredentialSummary: { useQuery: getCredentialSummaryUseQuery },
            getModelRoutingPreference: { useQuery: getModelRoutingPreferenceUseQuery },
            listModelProviders: { useQuery: listModelProvidersUseQuery },
            getAccountContext: { useQuery: getAccountContextUseQuery },
            getCloudSessionPrerequisites: { useQuery: getCloudSessionPrerequisitesUseQuery },
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
        isDefault: id === 'openai',
        authState: 'authenticated',
        authMethod: id === 'openai' ? 'api_key' : 'oauth_device',
        availableAuthMethods: id === 'openai' ? ['api_key'] : ['oauth_device'],
        connectionProfile: {
            optionProfileId: 'default',
            label: 'Default',
            options: [{ value: 'default', label: 'Default' }],
            resolvedBaseUrl: id === 'openai' ? 'https://api.openai.com/v1' : null,
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

function createModel(id: string, label: string) {
    return {
        id,
        label,
    };
}

describe('useProviderSettingsQueries', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        getControlPlaneUseQuery.mockReturnValue({
            data: {
                providerControl: {
                    defaults: {
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                    },
                    specialistDefaults: [],
                    entries: [
                        {
                            provider: createProvider('openai'),
                            models: [createModel('openai/gpt-5', 'GPT-5')],
                            catalogState: {
                                reason: null,
                                invalidModelCount: 0,
                            },
                        },
                        {
                            provider: createProvider('openai_codex'),
                            models: [createModel('openai_codex/gpt-5-codex', 'GPT-5 Codex')],
                            catalogState: {
                                reason: 'catalog_sync_failed',
                                detail: 'Auth required before syncing the Codex catalog.',
                                invalidModelCount: 1,
                            },
                        },
                    ],
                },
            },
        });
        getAuthStateUseQuery.mockReturnValue({ data: { found: false } });
        getCredentialSummaryUseQuery.mockReturnValue({ data: { credential: null } });
        getModelRoutingPreferenceUseQuery.mockReturnValue({ data: undefined });
        listModelProvidersUseQuery.mockReturnValue({ data: { providers: [] } });
        getAccountContextUseQuery.mockReturnValue({ data: undefined });
        getCloudSessionPrerequisitesUseQuery.mockReturnValue({ data: undefined });
        getUsageSummaryUseQuery.mockReturnValue({ data: { summaries: [] } });
        getOpenAISubscriptionUsageUseQuery.mockReturnValue({ data: undefined });
        getOpenAISubscriptionRateLimitsUseQuery.mockReturnValue({ data: undefined });
    });

    it('resolves provider and model selection from the provider control snapshot', () => {
        const result = useProviderSettingsQueries({
            profileId: 'profile_default',
            requestedProviderId: undefined,
            requestedModelId: '',
        });

        expect(getControlPlaneUseQuery).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.any(Object)
        );
        expect(result.selectedProviderId).toBe('openai');
        expect(result.selectedModelId).toBe('openai/gpt-5');
        expect(result.modelOptions).toHaveLength(1);
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

    it('propagates catalog state details from the provider control snapshot', () => {
        const result = useProviderSettingsQueries({
            profileId: 'profile_default',
            requestedProviderId: 'openai_codex',
            requestedModelId: '',
        });

        expect(result.catalogStateReason).toBe('catalog_sync_failed');
        expect(result.catalogStateDetail).toBe('Auth required before syncing the Codex catalog.');
    });
});

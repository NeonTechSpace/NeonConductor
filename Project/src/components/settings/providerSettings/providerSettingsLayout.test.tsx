import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsController', () => ({
    useProviderSettingsController: () => ({
        selection: {
            providerItems: [
                {
                    id: 'kilo',
                    label: 'Kilo',
                    authState: 'authenticated',
                    authMethod: 'device_code',
                    connectionProfile: {
                        providerId: 'kilo',
                        optionProfileId: 'gateway',
                        label: 'Gateway',
                        options: [{ value: 'gateway', label: 'Gateway' }],
                        resolvedBaseUrl: null,
                    },
                    apiKeyCta: { label: 'Create key', url: 'https://example.com' },
                    isDefault: true,
                    availableAuthMethods: ['device_code', 'api_key'],
                    features: {
                        supportsKiloRouting: true,
                        catalogStrategy: 'dynamic',
                        supportsModelProviderListing: true,
                        supportsConnectionOptions: false,
                        supportsCustomBaseUrl: false,
                        supportsOrganizationScope: true,
                    },
                },
                {
                    id: 'openai',
                    label: 'OpenAI',
                    authState: 'logged_out',
                    authMethod: 'oauth_device',
                    connectionProfile: {
                        providerId: 'openai',
                        optionProfileId: 'default',
                        label: 'Default',
                        options: [{ value: 'default', label: 'Default' }],
                        resolvedBaseUrl: 'https://api.openai.com/v1',
                    },
                    apiKeyCta: { label: 'Create key', url: 'https://example.com' },
                    isDefault: false,
                    availableAuthMethods: ['oauth_device', 'api_key'],
                    features: {
                        supportsKiloRouting: false,
                        catalogStrategy: 'static',
                        supportsModelProviderListing: false,
                        supportsConnectionOptions: false,
                        supportsCustomBaseUrl: true,
                        supportsOrganizationScope: false,
                    },
                },
            ],
            selectedProviderId: 'openai',
            prefetchProvider: vi.fn(),
            selectProvider: vi.fn(),
            selectedProvider: {
                id: 'openai',
                label: 'OpenAI',
                authState: 'logged_out',
                authMethod: 'oauth_device',
                connectionProfile: {
                    providerId: 'openai',
                    optionProfileId: 'default',
                    label: 'Default',
                    options: [{ value: 'default', label: 'Default' }],
                    resolvedBaseUrl: 'https://api.openai.com/v1',
                },
                apiKeyCta: { label: 'Create key', url: 'https://example.com' },
                features: {
                    supportsKiloRouting: false,
                    catalogStrategy: 'static',
                    supportsModelProviderListing: false,
                    supportsConnectionOptions: false,
                    supportsCustomBaseUrl: true,
                    supportsOrganizationScope: false,
                },
            },
        },
        providerStatus: {
            authState: undefined,
            accountContext: undefined,
            usageSummary: undefined,
            openAISubscriptionUsage: undefined,
            openAISubscriptionRateLimits: undefined,
            isLoadingAccountContext: false,
            isLoadingUsageSummary: false,
            isLoadingOpenAIUsage: false,
            isLoadingOpenAIRateLimits: false,
        },
        authentication: {
            methods: [],
            credentialSummary: undefined,
            executionPreference: undefined,
            activeAuthFlow: undefined,
            isSavingApiKey: false,
            isSavingConnectionProfile: false,
            isSavingExecutionPreference: false,
            isStartingAuth: false,
            isPollingAuth: false,
            isCancellingAuth: false,
            isOpeningVerificationPage: false,
            changeConnectionProfile: vi.fn(),
            changeExecutionPreference: vi.fn(),
            saveBaseUrlOverride: vi.fn(),
            saveApiKey: vi.fn(),
            loadStoredCredential: vi.fn(),
            startOAuthDevice: vi.fn(),
            startDeviceCode: vi.fn(),
            pollNow: vi.fn(),
            cancelFlow: vi.fn(),
            openVerificationPage: vi.fn(),
        },
        models: {
            selectedModelId: '',
            options: [],
            catalogStateReason: null,
            catalogStateDetail: undefined,
            isDefaultModel: false,
            isSavingDefault: false,
            isSyncingCatalog: false,
            setSelectedModelId: vi.fn(),
            setDefaultModel: vi.fn(),
            syncCatalog: vi.fn(),
        },
        kilo: {
            routingDraft: undefined,
            modelProviders: [],
            accountContext: undefined,
            isLoadingRoutingPreference: false,
            isLoadingModelProviders: false,
            isSavingRoutingPreference: false,
            isSavingOrganization: false,
            changeRoutingMode: vi.fn(),
            changeRoutingSort: vi.fn(),
            changePinnedProvider: vi.fn(),
            changeOrganization: vi.fn(),
        },
        feedback: {
            message: undefined,
            tone: 'info',
        },
    }),
}));

vi.mock('@/web/components/settings/providerSettings/providerSidebar', () => ({
    ProviderSidebar: () => <aside>Providers &amp; Models</aside>,
}));

vi.mock('@/web/components/settings/providerSettings/providerStatusSection', () => ({
    ProviderStatusSection: () => <section>status</section>,
}));

vi.mock('@/web/components/settings/providerSettings/authenticationSection', () => ({
    ProviderAuthenticationSection: () => <section>auth</section>,
}));

vi.mock('@/web/components/settings/providerSettings/defaultModelSection', () => ({
    ProviderDefaultModelSection: () => <section>model</section>,
}));

vi.mock('@/web/components/settings/providerSettings/specialistDefaultsSection', () => ({
    ProviderSpecialistDefaultsSection: () => <section>specialist defaults</section>,
}));

vi.mock('@/web/components/settings/providerSettings/kiloRoutingSection', () => ({
    KiloRoutingSection: () => <section>routing</section>,
}));

vi.mock('@/web/components/settings/shared/settingsFeedbackBanner', () => ({
    SettingsFeedbackBanner: () => null,
}));

import { ProviderSettingsView } from '@/web/components/settings/providerSettingsView';

describe('provider settings layout', () => {
    it('keeps the split pane height-constrained and the detail column scrollable', () => {
        const html = renderToStaticMarkup(<ProviderSettingsView profileId='profile_default' />);

        expect(html).toContain('grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]');
        expect(html).toContain('min-h-0 min-w-0 overflow-y-auto p-4 md:p-5');
        expect(html).toContain('Providers &amp; Models');
        expect(html).toContain('Kilo Gateway');
    });
});

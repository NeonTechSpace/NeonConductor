import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { createDirectProviderControllerState, useDirectProviderSettingsControllerMock } = vi.hoisted(() => {
    function createDirectProviderControllerState() {
        return {
            selection: {
                providerItems: [
                    {
                        id: 'openai',
                        label: 'OpenAI',
                        authState: 'logged_out',
                        authMethod: 'api_key',
                        connectionProfile: {
                            providerId: 'openai',
                            optionProfileId: 'default',
                            label: 'Default',
                            options: [{ value: 'default', label: 'Default' }],
                            resolvedBaseUrl: 'https://api.openai.com/v1',
                        },
                        apiKeyCta: { label: 'Create key', url: 'https://example.com' },
                        isDefault: false,
                        availableAuthMethods: ['api_key'],
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
                    authMethod: 'api_key',
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
                isRefreshingOpenAICodexUsage: false,
                refreshOpenAICodexUsage: vi.fn(),
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
            feedback: {
                message: undefined,
                tone: 'info',
            },
            isKiloSelected: false,
        };
    }

    return {
        createDirectProviderControllerState,
        useDirectProviderSettingsControllerMock: vi.fn(() => createDirectProviderControllerState()),
    };
});

vi.mock('@/web/components/settings/providerSettings/hooks/useDirectProviderSettingsController', () => ({
    useDirectProviderSettingsController: useDirectProviderSettingsControllerMock,
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

vi.mock('@/web/components/settings/shared/settingsFeedbackBanner', () => ({
    SettingsFeedbackBanner: () => null,
}));

import { ProviderSettingsView } from '@/web/components/settings/providerSettingsView';

describe('provider settings layout', () => {
    it('passes the selected provider into a fresh direct-provider controller boundary', () => {
        renderToStaticMarkup(<ProviderSettingsView profileId='profile_default' selectedProviderId='openai' />);

        expect(useDirectProviderSettingsControllerMock).toHaveBeenCalledWith('profile_default', {
            initialProviderId: 'openai',
        });
    });

    it('keeps the split pane height-constrained and the detail column scrollable', () => {
        const html = renderToStaticMarkup(<ProviderSettingsView profileId='profile_default' selectedProviderId='openai' />);

        expect(html).toContain('grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]');
        expect(html).toContain('min-h-0 min-w-0 overflow-y-auto p-4 md:p-5');
        expect(html).toContain('Providers &amp; Models');
        expect(html).toContain('Connect direct providers and adjust their settings here.');
    });

    it('renders the Kilo handoff panel instead of duplicated Kilo controls', () => {
        const handoffState = createDirectProviderControllerState();
        useDirectProviderSettingsControllerMock.mockReturnValueOnce({
            ...handoffState,
            selection: {
                ...handoffState.selection,
                selectedProviderId: 'kilo',
                selectedProvider: undefined as never,
            },
            isKiloSelected: true,
        });

        const html = renderToStaticMarkup(
            <ProviderSettingsView
                profileId='profile_default'
                selectedProviderId='kilo'
                onOpenKiloSettings={vi.fn()}
            />
        );

        expect(html).toContain('Kilo settings live in the dedicated Kilo route');
        expect(html).toContain('Open Kilo settings');
        expect(html).not.toContain('auth</section>');
        expect(html).not.toContain('model</section>');
    });
});

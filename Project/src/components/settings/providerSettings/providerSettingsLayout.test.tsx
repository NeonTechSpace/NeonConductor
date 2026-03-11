import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsController', () => ({
    useProviderSettingsController: () => ({
        providerItems: [],
        selectedProviderId: 'kilo',
        prefetchProvider: vi.fn(),
        selectProvider: vi.fn(),
        selectedProvider: {
            id: 'kilo',
            label: 'Kilo',
            authState: 'logged_out',
            authMethod: 'none',
            endpointProfile: { value: 'gateway' },
            endpointProfiles: [],
            apiKeyCta: null,
            features: { supportsKiloRouting: false },
        },
        selectedAuthState: undefined,
        kiloAccountContext: undefined,
        selectedProviderUsageSummary: undefined,
        openAISubscriptionUsage: undefined,
        openAISubscriptionRateLimits: undefined,
        queries: {
            accountContextQuery: { isLoading: false },
            usageSummaryQuery: { isLoading: false },
            openAISubscriptionUsageQuery: { isLoading: false },
            openAISubscriptionRateLimitsQuery: { isLoading: false },
            kiloRoutingPreferenceQuery: { isLoading: false },
            kiloModelProvidersQuery: { isLoading: false },
        },
        methods: [],
        apiKeyInput: '',
        isCredentialVisible: false,
        activeAuthFlow: undefined,
        mutations: {
            setApiKeyMutation: { isPending: false },
            setEndpointProfileMutation: { isPending: false },
            startAuthMutation: { isPending: false },
            pollAuthMutation: { isPending: false },
            cancelAuthMutation: { isPending: false },
            openExternalUrlMutation: { isPending: false },
            setDefaultMutation: { isPending: false },
            syncCatalogMutation: { isPending: false },
            setModelRoutingPreferenceMutation: { isPending: false },
        },
        setApiKeyInput: vi.fn(),
        changeEndpointProfile: vi.fn(),
        saveApiKey: vi.fn(),
        revealStoredCredential: vi.fn(),
        hideStoredCredential: vi.fn(),
        copyStoredCredential: vi.fn(),
        startOAuthDevice: vi.fn(),
        startDeviceCode: vi.fn(),
        pollNow: vi.fn(),
        cancelFlow: vi.fn(),
        openVerificationPage: vi.fn(),
        credentialSummary: undefined,
        selectedModelId: '',
        models: [],
        selectedIsDefaultModel: false,
        setSelectedModelId: vi.fn(),
        setDefaultModel: vi.fn(),
        syncCatalog: vi.fn(),
        kiloRoutingDraft: undefined,
        kiloModelProviders: [],
        changeRoutingMode: vi.fn(),
        changeRoutingSort: vi.fn(),
        changePinnedProvider: vi.fn(),
        feedbackMessage: undefined,
        feedbackTone: 'info',
    }),
}));

vi.mock('@/web/components/settings/providerSettings/providerSidebar', () => ({
    ProviderSidebar: () => <aside>sidebar</aside>,
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
    });
});

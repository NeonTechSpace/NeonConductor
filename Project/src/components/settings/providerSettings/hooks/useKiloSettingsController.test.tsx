import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kiloControllerTestState = vi.hoisted(() => {
    const mixedControllerState = {
        feedback: { message: undefined, tone: 'info' as const },
        selection: {
            providerItems: [
                { id: 'kilo', label: 'Kilo', authState: 'authenticated' },
                { id: 'openai', label: 'OpenAI', authState: 'logged_out' },
            ],
            selectedProviderId: 'kilo',
            selectedProvider: undefined,
            selectProvider: vi.fn(),
            prefetchProvider: vi.fn(),
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
            refreshOpenAICodexUsage: vi.fn().mockResolvedValue(undefined),
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
            changeConnectionProfile: vi.fn().mockResolvedValue(undefined),
            changeExecutionPreference: vi.fn().mockResolvedValue(undefined),
            saveApiKey: vi.fn().mockResolvedValue(undefined),
            saveBaseUrlOverride: vi.fn().mockResolvedValue(undefined),
            loadStoredCredential: vi.fn().mockResolvedValue(undefined),
            startOAuthDevice: vi.fn().mockResolvedValue(undefined),
            startDeviceCode: vi.fn().mockResolvedValue(undefined),
            pollNow: vi.fn().mockResolvedValue(undefined),
            cancelFlow: vi.fn().mockResolvedValue(undefined),
            openVerificationPage: vi.fn().mockResolvedValue(undefined),
        },
        models: {
            selectedModelId: 'kilo/frontier',
            options: [],
            catalogStateReason: null,
            catalogStateDetail: undefined,
            isDefaultModel: true,
            isSavingDefault: false,
            isSyncingCatalog: false,
            setSelectedModelId: vi.fn(),
            setDefaultModel: vi.fn().mockResolvedValue(undefined),
            syncCatalog: vi.fn().mockResolvedValue(undefined),
        },
        kilo: {
            routingDraft: undefined,
            modelProviders: [],
            accountContext: undefined,
            isLoadingRoutingPreference: false,
            isLoadingModelProviders: false,
            isSavingRoutingPreference: false,
            isSavingOrganization: false,
            changeRoutingMode: vi.fn().mockResolvedValue(undefined),
            changeRoutingSort: vi.fn().mockResolvedValue(undefined),
            changePinnedProvider: vi.fn().mockResolvedValue(undefined),
            changeOrganization: vi.fn().mockResolvedValue(undefined),
        },
    };

    return {
        mixedControllerState,
        useProviderSettingsSurfaceStateMock: vi.fn(() => ({})),
        buildProviderSettingsControllerStateMock: vi.fn(() => mixedControllerState),
    };
});

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsSurfaceState', () => ({
    useProviderSettingsSurfaceState: kiloControllerTestState.useProviderSettingsSurfaceStateMock,
}));

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsController', () => ({
    buildProviderSettingsControllerState: kiloControllerTestState.buildProviderSettingsControllerStateMock,
}));

import { useKiloSettingsController } from '@/web/components/settings/providerSettings/hooks/useKiloSettingsController';

let lastControllerState: ReturnType<typeof useKiloSettingsController> | undefined;

function ControllerProbe() {
    lastControllerState = useKiloSettingsController('profile_default');
    return null;
}

describe('useKiloSettingsController', () => {
    beforeEach(() => {
        lastControllerState = undefined;
        kiloControllerTestState.useProviderSettingsSurfaceStateMock.mockClear();
        kiloControllerTestState.buildProviderSettingsControllerStateMock.mockClear();
    });

    it('keeps the dedicated Kilo route authoritative even when the mixed controller fallback selectedProvider is missing', () => {
        renderToStaticMarkup(<ControllerProbe />);

        expect(lastControllerState?.selectedProvider?.id).toBe('kilo');
        expect(lastControllerState?.effectiveAuthState).toBe('authenticated');
    });
});

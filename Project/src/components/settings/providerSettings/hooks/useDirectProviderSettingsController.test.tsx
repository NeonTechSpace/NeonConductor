import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const directControllerTestState = vi.hoisted(() => {
    const mixedControllerState = {
        feedback: { message: 'Saved.', tone: 'success' as const },
        selection: {
            providerItems: [
                { id: 'kilo', label: 'Kilo' },
                { id: 'openai', label: 'OpenAI' },
            ],
            selectedProviderId: 'kilo',
            selectedProvider: { id: 'kilo', label: 'Kilo' },
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
            selectedModelId: 'model_selected',
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
    useProviderSettingsSurfaceState: directControllerTestState.useProviderSettingsSurfaceStateMock,
}));

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsController', () => ({
    buildProviderSettingsControllerState: directControllerTestState.buildProviderSettingsControllerStateMock,
}));

import { useDirectProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useDirectProviderSettingsController';

let lastControllerState: ReturnType<typeof useDirectProviderSettingsController> | undefined;

function ControllerProbe() {
    lastControllerState = useDirectProviderSettingsController('profile_default', {
        initialProviderId: 'kilo',
    });
    return null;
}

describe('useDirectProviderSettingsController', () => {
    beforeEach(() => {
        lastControllerState = undefined;
        directControllerTestState.useProviderSettingsSurfaceStateMock.mockClear();
        directControllerTestState.buildProviderSettingsControllerStateMock.mockClear();
    });

    it('filters Kilo out of the providers screen and exposes a handoff state when Kilo is selected', () => {
        renderToStaticMarkup(<ControllerProbe />);

        expect(lastControllerState?.selection.providerItems.map((provider) => provider.id)).toEqual(['openai']);
        expect(lastControllerState?.selection.selectedProvider).toBeUndefined();
        expect(lastControllerState?.isKiloSelected).toBe(true);
    });
});

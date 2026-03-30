import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerTestState = vi.hoisted(() => {
    const surfaceState = {
        profileId: 'profile_default',
        utils: {
            provider: {
                getCredentialValue: {
                    fetch: vi.fn(),
                },
            },
        },
        selectionState: {
            requestedProviderId: 'kilo',
            setRequestedProviderId: vi.fn(),
            requestedModelId: 'model_requested',
            setRequestedModelId: vi.fn(),
            activeAuthFlow: {
                providerId: 'kilo',
                flowId: 'flow_123',
                verificationUri: 'https://example.com/verify',
                pollAfterSeconds: 5,
            },
            setActiveAuthFlow: vi.fn(),
            statusMessage: 'Saved.',
            setStatusMessage: vi.fn(),
        },
        queries: {
            providerItems: [{ id: 'openai', label: 'OpenAI' }],
            selectedProviderId: 'openai',
            selectedProvider: {
                id: 'openai',
                availableAuthMethods: ['api_key'],
                executionPreference: undefined,
                connectionProfile: {
                    optionProfileId: 'default',
                },
            },
            selectedAuthState: { authState: 'authenticated', authMethod: 'api_key' },
            kiloAccountContext: undefined,
            selectedProviderUsageSummary: undefined,
            openAISubscriptionUsage: undefined,
            openAISubscriptionRateLimits: undefined,
            accountContextQuery: { isLoading: false },
            usageSummaryQuery: { isLoading: false },
            openAISubscriptionUsageQuery: {
                isLoading: false,
                isRefetching: false,
                refetch: vi.fn().mockResolvedValue(undefined),
            },
            openAISubscriptionRateLimitsQuery: {
                isLoading: false,
                isRefetching: false,
                refetch: vi.fn().mockResolvedValue(undefined),
            },
            credentialSummary: { authMethod: 'api_key' },
            selectedModelId: 'model_selected',
            modelOptions: [{ id: 'model_selected', label: 'Model Selected' }],
            catalogStateReason: null,
            catalogStateDetail: undefined,
            selectedIsDefaultModel: true,
            kiloModelProviders: [],
            kiloRoutingPreferenceQuery: { isLoading: false },
            kiloModelProvidersQuery: { isLoading: false },
        },
        mutationModel: {
            feedback: {
                message: 'Saved.',
                tone: 'success' as const,
            },
        },
        mutations: {
            setDefaultMutation: { isPending: false },
            setApiKeyMutation: { isPending: false },
            setConnectionProfileMutation: { isPending: false },
            setExecutionPreferenceMutation: { isPending: false },
            syncCatalogMutation: { isPending: false },
            setModelRoutingPreferenceMutation: { isPending: false },
            setOrganizationMutation: { isPending: false },
            openExternalUrlMutation: { isPending: false },
            startAuthMutation: { isPending: false },
            pollAuthMutation: { isPending: false },
            cancelAuthMutation: { isPending: false },
        },
        kiloRoutingDraft: undefined,
        actions: {
            selectProvider: vi.fn(),
            changeConnectionProfile: vi.fn().mockResolvedValue(undefined),
            changeExecutionPreference: vi.fn().mockResolvedValue(undefined),
            saveApiKey: vi.fn().mockResolvedValue(undefined),
            saveBaseUrlOverride: vi.fn().mockResolvedValue(undefined),
            startOAuthDevice: vi.fn().mockResolvedValue(undefined),
            startDeviceCode: vi.fn().mockResolvedValue(undefined),
            pollNow: vi.fn().mockResolvedValue(undefined),
            cancelFlow: vi.fn().mockResolvedValue(undefined),
            openVerificationPage: vi.fn().mockResolvedValue(undefined),
            setDefaultModel: vi.fn().mockResolvedValue(undefined),
            syncCatalog: vi.fn().mockResolvedValue(undefined),
            changeRoutingMode: vi.fn().mockResolvedValue(undefined),
            changeRoutingSort: vi.fn().mockResolvedValue(undefined),
            changePinnedProvider: vi.fn().mockResolvedValue(undefined),
            changeOrganization: vi.fn().mockResolvedValue(undefined),
        },
        loadStoredCredential: vi.fn().mockResolvedValue('stored_credential'),
        refreshOpenAICodexUsage: vi.fn().mockResolvedValue(undefined),
    };

    return {
        surfaceState,
        useProviderSettingsSurfaceStateMock: vi.fn(() => surfaceState),
    };
});

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsSurfaceState', () => ({
    useProviderSettingsSurfaceState: controllerTestState.useProviderSettingsSurfaceStateMock,
}));

import { useProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';

let lastControllerState: ReturnType<typeof useProviderSettingsController> | undefined;

function ControllerProbe() {
    lastControllerState = useProviderSettingsController('profile_default', {
        initialProviderId: 'kilo',
    });
    return null;
}

describe('useProviderSettingsController', () => {
    beforeEach(() => {
        lastControllerState = undefined;
        controllerTestState.useProviderSettingsSurfaceStateMock.mockClear();
    });

    it('remains a thin compatibility facade over the shared provider settings surface state', async () => {
        renderToStaticMarkup(<ControllerProbe />);

        expect(controllerTestState.useProviderSettingsSurfaceStateMock).toHaveBeenCalledWith('profile_default', {
            initialProviderId: 'kilo',
        });
        expect(lastControllerState?.feedback).toEqual({
            message: 'Saved.',
            tone: 'success',
        });

        await lastControllerState?.authentication.changeConnectionProfile('gateway');
        expect(controllerTestState.surfaceState.actions.changeConnectionProfile).toHaveBeenCalledWith('gateway');
    });
});

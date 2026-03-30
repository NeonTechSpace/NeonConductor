import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeProviderId } from '@/shared/contracts';

const controllerTestState = vi.hoisted(() => {
    const selectionState = {
        requestedProviderId: 'kilo' as RuntimeProviderId | undefined,
        setRequestedProviderId: vi.fn(),
        requestedModelId: 'model_requested',
        setRequestedModelId: vi.fn(),
        activeAuthFlow: {
            providerId: 'kilo' as RuntimeProviderId,
            flowId: 'flow_123',
            verificationUri: 'https://example.com/verify',
            pollAfterSeconds: 5,
        },
        setActiveAuthFlow: vi.fn(),
        statusMessage: 'Saved.',
        setStatusMessage: vi.fn(),
    };

    const queries = {
        providerItems: [{ id: 'openai', label: 'OpenAI' }],
        selectedProviderId: 'openai_codex' as RuntimeProviderId,
        selectedProvider: {
            id: 'openai_codex' as RuntimeProviderId,
            availableAuthMethods: ['oauth_device'],
            executionPreference: undefined,
            connectionProfile: {
                optionProfileId: 'default',
            },
        },
        selectedAuthState: { authState: 'authenticated', authMethod: 'oauth_device' },
        kiloAccountContext: { organizationId: 'org_default' },
        selectedProviderUsageSummary: { used: 10, limit: 100 },
        openAISubscriptionUsage: { currentPeriod: 'month' },
        openAISubscriptionRateLimits: { requestsPerMinute: 10 },
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
        credentialSummary: { authMethod: 'oauth_device' },
        selectedModelId: 'model_selected',
        modelOptions: [{ value: 'model_selected', label: 'Model Selected' }],
        catalogStateReason: null,
        catalogStateDetail: undefined,
        selectedIsDefaultModel: true,
        kiloRoutingPreference: {
            routingMode: 'dynamic' as const,
            sort: 'latency' as const,
        },
        kiloModelProviders: [{ providerId: 'openai', label: 'OpenAI' }],
        kiloRoutingPreferenceQuery: { isLoading: false },
        kiloModelProvidersQuery: { isLoading: false },
    };

    const mutations = {
        setDefaultMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        setApiKeyMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        setConnectionProfileMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        setExecutionPreferenceMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        syncCatalogMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        setModelRoutingPreferenceMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        setOrganizationMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        openExternalUrlMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        startAuthMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        pollAuthMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
        cancelAuthMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
    };

    const mutationModel = {
        mutations,
        feedback: {
            message: 'Saved.',
            tone: 'success' as const,
        },
    };

    const kiloRoutingDraftState = {
        kiloRoutingDraft: {
            routingMode: 'dynamic' as const,
            sort: 'latency' as const,
        },
    };

    const actions = {
        selectProvider: vi.fn(),
        setDefaultModel: vi.fn().mockResolvedValue(undefined),
        syncCatalog: vi.fn().mockResolvedValue(undefined),
        changeRoutingMode: vi.fn().mockResolvedValue(undefined),
        changeRoutingSort: vi.fn().mockResolvedValue(undefined),
        changePinnedProvider: vi.fn().mockResolvedValue(undefined),
        changeConnectionProfile: vi.fn().mockResolvedValue(undefined),
        saveBaseUrlOverride: vi.fn().mockResolvedValue(undefined),
        changeExecutionPreference: vi.fn().mockResolvedValue(undefined),
        changeOrganization: vi.fn().mockResolvedValue(undefined),
        saveApiKey: vi.fn().mockResolvedValue(undefined),
        startOAuthDevice: vi.fn().mockResolvedValue(undefined),
        startDeviceCode: vi.fn().mockResolvedValue(undefined),
        pollNow: vi.fn().mockResolvedValue(undefined),
        cancelFlow: vi.fn().mockResolvedValue(undefined),
        openVerificationPage: vi.fn().mockResolvedValue(undefined),
    };

    const trpcUtils = {
        provider: {
            getCredentialValue: {
                fetch: vi.fn().mockResolvedValue({
                    credential: {
                        value: 'stored_credential',
                    },
                }),
            },
        },
    };

    return {
        selectionState,
        queries,
        mutations,
        mutationModel,
        kiloRoutingDraftState,
        actions,
        trpcUtils,
        useProviderSettingsQueriesMock: vi.fn(() => queries),
        useProviderSettingsSelectionStateMock: vi.fn(() => selectionState),
        useProviderSettingsMutationModelMock: vi.fn(() => mutationModel),
        useProviderSettingsAuthFlowMock: vi.fn(),
        useKiloRoutingDraftMock: vi.fn(() => kiloRoutingDraftState),
        createProviderSettingsActionsMock: vi.fn(() => actions),
        prefetchProviderSettingsDataMock: vi.fn(),
        useUtilsMock: vi.fn(() => trpcUtils),
    };
});

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsQueries', () => ({
    useProviderSettingsQueries: controllerTestState.useProviderSettingsQueriesMock,
}));

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsSelectionState', () => ({
    useProviderSettingsSelectionState: controllerTestState.useProviderSettingsSelectionStateMock,
}));

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsMutationModel', () => ({
    useProviderSettingsMutationModel: controllerTestState.useProviderSettingsMutationModelMock,
}));

vi.mock('@/web/components/settings/providerSettings/hooks/useProviderSettingsAuthFlow', () => ({
    useProviderSettingsAuthFlow: controllerTestState.useProviderSettingsAuthFlowMock,
}));

vi.mock('@/web/components/settings/providerSettings/hooks/useKiloRoutingDraft', () => ({
    useKiloRoutingDraft: controllerTestState.useKiloRoutingDraftMock,
}));

vi.mock('@/web/components/settings/providerSettings/hooks/providerSettingsActions', () => ({
    createProviderSettingsActions: controllerTestState.createProviderSettingsActionsMock,
}));

vi.mock('@/web/components/settings/providerSettings/providerSettingsPrefetch', () => ({
    prefetchProviderSettingsData: controllerTestState.prefetchProviderSettingsDataMock,
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: controllerTestState.useUtilsMock,
    },
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
        controllerTestState.useProviderSettingsQueriesMock.mockClear();
        controllerTestState.useProviderSettingsSelectionStateMock.mockClear();
        controllerTestState.useProviderSettingsMutationModelMock.mockClear();
        controllerTestState.useProviderSettingsAuthFlowMock.mockClear();
        controllerTestState.useKiloRoutingDraftMock.mockClear();
        controllerTestState.createProviderSettingsActionsMock.mockClear();
        controllerTestState.prefetchProviderSettingsDataMock.mockClear();
        controllerTestState.useUtilsMock.mockClear();
        controllerTestState.selectionState.setStatusMessage.mockClear();
        controllerTestState.actions.changeConnectionProfile.mockClear();
        controllerTestState.actions.changeOrganization.mockClear();
        controllerTestState.actions.selectProvider.mockClear();
        controllerTestState.queries.openAISubscriptionUsageQuery.refetch.mockClear();
        controllerTestState.queries.openAISubscriptionRateLimitsQuery.refetch.mockClear();
        controllerTestState.trpcUtils.provider.getCredentialValue.fetch.mockClear();
    });

    it('composes query, mutation, auth-flow, and action seams without owning their policy', async () => {
        renderToStaticMarkup(<ControllerProbe />);

        expect(controllerTestState.useProviderSettingsSelectionStateMock).toHaveBeenCalledWith({
            initialProviderId: 'kilo',
        });
        expect(controllerTestState.useProviderSettingsQueriesMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            requestedProviderId: 'kilo',
            requestedModelId: 'model_requested',
        });
        expect(controllerTestState.useProviderSettingsMutationModelMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            selectedProviderId: 'openai_codex',
            statusMessage: 'Saved.',
            setStatusMessage: controllerTestState.selectionState.setStatusMessage,
            setActiveAuthFlow: controllerTestState.selectionState.setActiveAuthFlow,
        });
        expect(controllerTestState.useProviderSettingsAuthFlowMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                activeAuthFlow: controllerTestState.selectionState.activeAuthFlow,
                isPolling: false,
            })
        );
        expect(controllerTestState.useKiloRoutingDraftMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            selectedProviderId: 'openai_codex',
            selectedModelId: 'model_selected',
            preference: controllerTestState.queries.kiloRoutingPreference,
            providerOptions: controllerTestState.queries.kiloModelProviders,
            setStatusMessage: controllerTestState.selectionState.setStatusMessage,
            savePreference: expect.any(Function),
        });
        expect(controllerTestState.createProviderSettingsActionsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                selectedProviderId: 'openai_codex',
                selectedModelId: 'model_selected',
                activeAuthFlow: controllerTestState.selectionState.activeAuthFlow,
                kiloRoutingDraft: controllerTestState.kiloRoutingDraftState.kiloRoutingDraft,
            })
        );

        expect(lastControllerState?.feedback).toEqual({
            message: 'Saved.',
            tone: 'success',
        });

        await lastControllerState?.authentication.changeConnectionProfile('gateway');
        expect(controllerTestState.actions.changeConnectionProfile).toHaveBeenCalledWith('gateway');

        await lastControllerState?.kilo.changeOrganization('org_other');
        expect(controllerTestState.actions.changeOrganization).toHaveBeenCalledWith('org_other');

        await lastControllerState?.selection.prefetchProvider('openai');
        expect(controllerTestState.prefetchProviderSettingsDataMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
            trpcUtils: controllerTestState.trpcUtils,
        });

        await lastControllerState?.providerStatus.refreshOpenAICodexUsage();
        expect(controllerTestState.queries.openAISubscriptionUsageQuery.refetch).toHaveBeenCalledTimes(1);
        expect(controllerTestState.queries.openAISubscriptionRateLimitsQuery.refetch).toHaveBeenCalledTimes(1);
    });

    it('loads stored credentials through trpc utils and sets a fail-closed status when none are stored', async () => {
        controllerTestState.trpcUtils.provider.getCredentialValue.fetch.mockResolvedValueOnce({
            credential: {
                value: 'stored_credential',
            },
        });

        renderToStaticMarkup(<ControllerProbe />);

        await expect(lastControllerState?.authentication.loadStoredCredential()).resolves.toBe('stored_credential');
        expect(controllerTestState.trpcUtils.provider.getCredentialValue.fetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai_codex',
        });

        controllerTestState.trpcUtils.provider.getCredentialValue.fetch.mockResolvedValueOnce({
            credential: null,
        });

        await expect(lastControllerState?.authentication.loadStoredCredential()).resolves.toBeUndefined();
        expect(controllerTestState.selectionState.setStatusMessage).toHaveBeenCalledWith(
            'No stored credential is available for this provider.'
        );
    });
});

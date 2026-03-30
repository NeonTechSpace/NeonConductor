import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';

import { prefetchProviderSettingsData } from '@/web/components/settings/providerSettings/providerSettingsPrefetch';
import {
    useProviderSettingsSurfaceState,
    type ProviderSettingsControllerOptions,
    type ProviderSettingsSurfaceState,
} from '@/web/components/settings/providerSettings/hooks/useProviderSettingsSurfaceState';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';

import type { RuntimeProviderId } from '@/shared/contracts';

function wrapFailClosedAction<TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) {
    return createFailClosedAsyncAction(action);
}

export interface ProviderSettingsControllerState {
    feedback: {
        message: string | undefined;
        tone: 'error' | 'success' | 'info';
    };
    selection: {
        providerItems: ProviderSettingsSurfaceState['queries']['providerItems'];
        selectedProviderId: ProviderSettingsSurfaceState['queries']['selectedProviderId'];
        selectedProvider: ProviderSettingsSurfaceState['queries']['selectedProvider'];
        selectProvider: (providerId: RuntimeProviderId) => void;
        prefetchProvider: (providerId: RuntimeProviderId) => void;
    };
    providerStatus: {
        authState: ProviderSettingsSurfaceState['queries']['selectedAuthState'];
        accountContext: ProviderSettingsSurfaceState['queries']['kiloAccountContext'];
        usageSummary: ProviderSettingsSurfaceState['queries']['selectedProviderUsageSummary'];
        openAISubscriptionUsage: ProviderSettingsSurfaceState['queries']['openAISubscriptionUsage'];
        openAISubscriptionRateLimits: ProviderSettingsSurfaceState['queries']['openAISubscriptionRateLimits'];
        isLoadingAccountContext: boolean;
        isLoadingUsageSummary: boolean;
        isLoadingOpenAIUsage: boolean;
        isLoadingOpenAIRateLimits: boolean;
        isRefreshingOpenAICodexUsage: boolean;
        refreshOpenAICodexUsage: () => Promise<void>;
    };
    authentication: {
        methods: NonNullable<ProviderSettingsSurfaceState['queries']['selectedProvider']>['availableAuthMethods'];
        credentialSummary: ProviderSettingsSurfaceState['queries']['credentialSummary'];
        executionPreference: NonNullable<ProviderSettingsSurfaceState['queries']['selectedProvider']>['executionPreference'];
        activeAuthFlow: ActiveAuthFlow | undefined;
        isSavingApiKey: boolean;
        isSavingConnectionProfile: boolean;
        isSavingExecutionPreference: boolean;
        isStartingAuth: boolean;
        isPollingAuth: boolean;
        isCancellingAuth: boolean;
        isOpeningVerificationPage: boolean;
        changeConnectionProfile: (value: string) => Promise<void>;
        changeExecutionPreference: (value: 'standard_http' | 'realtime_websocket') => Promise<void>;
        saveApiKey: (value: string) => Promise<void>;
        saveBaseUrlOverride: (value: string) => Promise<void>;
        loadStoredCredential: () => Promise<string | undefined>;
        startOAuthDevice: () => Promise<void>;
        startDeviceCode: () => Promise<void>;
        pollNow: () => Promise<void>;
        cancelFlow: () => Promise<void>;
        openVerificationPage: () => Promise<void>;
    };
    models: {
        selectedModelId: string;
        options: ProviderSettingsSurfaceState['queries']['modelOptions'];
        catalogStateReason: ProviderSettingsSurfaceState['queries']['catalogStateReason'];
        catalogStateDetail: ProviderSettingsSurfaceState['queries']['catalogStateDetail'];
        isDefaultModel: boolean;
        isSavingDefault: boolean;
        isSyncingCatalog: boolean;
        setSelectedModelId: (modelId: string) => void;
        setDefaultModel: (modelId?: string) => Promise<void>;
        syncCatalog: () => Promise<void>;
    };
    kilo: {
        routingDraft: ProviderSettingsSurfaceState['kiloRoutingDraft'];
        modelProviders: ProviderSettingsSurfaceState['queries']['kiloModelProviders'];
        accountContext: ProviderSettingsSurfaceState['queries']['kiloAccountContext'];
        isLoadingRoutingPreference: boolean;
        isLoadingModelProviders: boolean;
        isSavingRoutingPreference: boolean;
        isSavingOrganization: boolean;
        changeRoutingMode: (value: 'dynamic' | 'pinned') => Promise<void>;
        changeRoutingSort: (value: 'default' | 'price' | 'throughput' | 'latency') => Promise<void>;
        changePinnedProvider: (value: string) => Promise<void>;
        changeOrganization: (value?: string) => Promise<void>;
    };
}

export function buildProviderSettingsControllerState(
    surfaceState: ProviderSettingsSurfaceState
): ProviderSettingsControllerState {
    return {
        feedback: {
            message: surfaceState.mutationModel.feedback.message,
            tone: surfaceState.mutationModel.feedback.tone,
        },
        selection: {
            providerItems: surfaceState.queries.providerItems,
            selectedProviderId: surfaceState.queries.selectedProviderId,
            selectedProvider: surfaceState.queries.selectedProvider,
            selectProvider: surfaceState.actions.selectProvider,
            prefetchProvider: (providerId: RuntimeProviderId) => {
                prefetchProviderSettingsData({
                    profileId: surfaceState.profileId,
                    providerId,
                    trpcUtils: surfaceState.utils,
                });
            },
        },
        providerStatus: {
            authState: surfaceState.queries.selectedAuthState,
            accountContext: surfaceState.queries.kiloAccountContext,
            usageSummary: surfaceState.queries.selectedProviderUsageSummary,
            openAISubscriptionUsage: surfaceState.queries.openAISubscriptionUsage,
            openAISubscriptionRateLimits: surfaceState.queries.openAISubscriptionRateLimits,
            isLoadingAccountContext: surfaceState.queries.accountContextQuery.isLoading,
            isLoadingUsageSummary: surfaceState.queries.usageSummaryQuery.isLoading,
            isLoadingOpenAIUsage: surfaceState.queries.openAISubscriptionUsageQuery.isLoading,
            isLoadingOpenAIRateLimits: surfaceState.queries.openAISubscriptionRateLimitsQuery.isLoading,
            isRefreshingOpenAICodexUsage:
                surfaceState.queries.openAISubscriptionUsageQuery.isRefetching ||
                surfaceState.queries.openAISubscriptionRateLimitsQuery.isRefetching,
            refreshOpenAICodexUsage: wrapFailClosedAction(surfaceState.refreshOpenAICodexUsage),
        },
        authentication: {
            methods: surfaceState.queries.selectedProvider?.availableAuthMethods ?? [],
            credentialSummary: surfaceState.queries.credentialSummary,
            executionPreference: surfaceState.queries.selectedProvider?.executionPreference,
            activeAuthFlow: surfaceState.selectionState.activeAuthFlow,
            isSavingApiKey: surfaceState.mutations.setApiKeyMutation.isPending,
            isSavingConnectionProfile: surfaceState.mutations.setConnectionProfileMutation.isPending,
            isSavingExecutionPreference: surfaceState.mutations.setExecutionPreferenceMutation.isPending,
            isStartingAuth: surfaceState.mutations.startAuthMutation.isPending,
            isPollingAuth: surfaceState.mutations.pollAuthMutation.isPending,
            isCancellingAuth: surfaceState.mutations.cancelAuthMutation.isPending,
            isOpeningVerificationPage: surfaceState.mutations.openExternalUrlMutation.isPending,
            changeConnectionProfile: wrapFailClosedAction(surfaceState.actions.changeConnectionProfile),
            changeExecutionPreference: wrapFailClosedAction(surfaceState.actions.changeExecutionPreference),
            saveApiKey: surfaceState.actions.saveApiKey,
            saveBaseUrlOverride: surfaceState.actions.saveBaseUrlOverride,
            loadStoredCredential: surfaceState.loadStoredCredential,
            startOAuthDevice: wrapFailClosedAction(surfaceState.actions.startOAuthDevice),
            startDeviceCode: wrapFailClosedAction(surfaceState.actions.startDeviceCode),
            pollNow: wrapFailClosedAction(surfaceState.actions.pollNow),
            cancelFlow: wrapFailClosedAction(surfaceState.actions.cancelFlow),
            openVerificationPage: wrapFailClosedAction(surfaceState.actions.openVerificationPage),
        },
        models: {
            selectedModelId: surfaceState.queries.selectedModelId,
            options: surfaceState.queries.modelOptions,
            catalogStateReason: surfaceState.queries.catalogStateReason,
            catalogStateDetail: surfaceState.queries.catalogStateDetail,
            isDefaultModel: surfaceState.queries.selectedIsDefaultModel,
            isSavingDefault: surfaceState.mutations.setDefaultMutation.isPending,
            isSyncingCatalog: surfaceState.mutations.syncCatalogMutation.isPending,
            setSelectedModelId: surfaceState.selectionState.setRequestedModelId,
            setDefaultModel: wrapFailClosedAction(surfaceState.actions.setDefaultModel),
            syncCatalog: wrapFailClosedAction(surfaceState.actions.syncCatalog),
        },
        kilo: {
            routingDraft: surfaceState.kiloRoutingDraft,
            modelProviders: surfaceState.queries.kiloModelProviders,
            accountContext: surfaceState.queries.kiloAccountContext,
            isLoadingRoutingPreference: surfaceState.queries.kiloRoutingPreferenceQuery.isLoading,
            isLoadingModelProviders: surfaceState.queries.kiloModelProvidersQuery.isLoading,
            isSavingRoutingPreference: surfaceState.mutations.setModelRoutingPreferenceMutation.isPending,
            isSavingOrganization: surfaceState.mutations.setOrganizationMutation.isPending,
            changeRoutingMode: wrapFailClosedAction(surfaceState.actions.changeRoutingMode),
            changeRoutingSort: wrapFailClosedAction(surfaceState.actions.changeRoutingSort),
            changePinnedProvider: wrapFailClosedAction(surfaceState.actions.changePinnedProvider),
            changeOrganization: wrapFailClosedAction(surfaceState.actions.changeOrganization),
        },
    };
}

export function useProviderSettingsController(profileId: string, options?: ProviderSettingsControllerOptions) {
    return buildProviderSettingsControllerState(useProviderSettingsSurfaceState(profileId, options));
}

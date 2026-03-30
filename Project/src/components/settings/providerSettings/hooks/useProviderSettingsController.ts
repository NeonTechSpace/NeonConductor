import { createProviderSettingsActions } from '@/web/components/settings/providerSettings/hooks/providerSettingsActions';
import { useKiloRoutingDraft } from '@/web/components/settings/providerSettings/hooks/useKiloRoutingDraft';
import { useProviderSettingsAuthFlow } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsAuthFlow';
import { useProviderSettingsMutationModel } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutationModel';
import { useProviderSettingsQueries } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsQueries';
import { useProviderSettingsSelectionState } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsSelectionState';
import { prefetchProviderSettingsData } from '@/web/components/settings/providerSettings/providerSettingsPrefetch';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderSettingsControllerOptions {
    initialProviderId?: RuntimeProviderId;
}

function ignoreMutationResult<TInput, TResult>(mutateAsync: (input: TInput) => Promise<TResult>) {
    return async (input: TInput): Promise<void> => {
        await mutateAsync(input);
    };
}

function wrapFailClosedAction<TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) {
    return createFailClosedAsyncAction(action);
}

function createLoadStoredCredential(input: {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    fetchCredentialValue: ReturnType<typeof trpc.useUtils>['provider']['getCredentialValue']['fetch'];
    setStatusMessage: (value: string | undefined) => void;
}) {
    return async (): Promise<string | undefined> => {
        if (!input.selectedProviderId) {
            return undefined;
        }

        const result = await input.fetchCredentialValue({
            profileId: input.profileId,
            providerId: input.selectedProviderId,
        });
        if (!result.credential) {
            input.setStatusMessage('No stored credential is available for this provider.');
            return undefined;
        }

        return result.credential.value;
    };
}

function createRefreshOpenAICodexUsage(input: {
    selectedProviderId: RuntimeProviderId | undefined;
    refetchUsage: () => Promise<unknown>;
    refetchRateLimits: () => Promise<unknown>;
}) {
    return async (): Promise<void> => {
        if (input.selectedProviderId !== 'openai_codex') {
            return;
        }

        await Promise.all([input.refetchUsage(), input.refetchRateLimits()]);
    };
}

export interface ProviderSettingsControllerState {
    feedback: {
        message: string | undefined;
        tone: 'error' | 'success' | 'info';
    };
    selection: {
        providerItems: ReturnType<typeof useProviderSettingsQueries>['providerItems'];
        selectedProviderId: ReturnType<typeof useProviderSettingsQueries>['selectedProviderId'];
        selectedProvider: ReturnType<typeof useProviderSettingsQueries>['selectedProvider'];
        selectProvider: (providerId: RuntimeProviderId) => void;
        prefetchProvider: (providerId: RuntimeProviderId) => void;
    };
    providerStatus: {
        authState: ReturnType<typeof useProviderSettingsQueries>['selectedAuthState'];
        accountContext: ReturnType<typeof useProviderSettingsQueries>['kiloAccountContext'];
        usageSummary: ReturnType<typeof useProviderSettingsQueries>['selectedProviderUsageSummary'];
        openAISubscriptionUsage: ReturnType<typeof useProviderSettingsQueries>['openAISubscriptionUsage'];
        openAISubscriptionRateLimits: ReturnType<typeof useProviderSettingsQueries>['openAISubscriptionRateLimits'];
        isLoadingAccountContext: boolean;
        isLoadingUsageSummary: boolean;
        isLoadingOpenAIUsage: boolean;
        isLoadingOpenAIRateLimits: boolean;
        isRefreshingOpenAICodexUsage: boolean;
        refreshOpenAICodexUsage: () => Promise<void>;
    };
    authentication: {
        methods: NonNullable<ReturnType<typeof useProviderSettingsQueries>['selectedProvider']>['availableAuthMethods'];
        credentialSummary: ReturnType<typeof useProviderSettingsQueries>['credentialSummary'];
        executionPreference: NonNullable<
            ReturnType<typeof useProviderSettingsQueries>['selectedProvider']
        >['executionPreference'];
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
        options: ReturnType<typeof useProviderSettingsQueries>['modelOptions'];
        catalogStateReason: ReturnType<typeof useProviderSettingsQueries>['catalogStateReason'];
        catalogStateDetail: ReturnType<typeof useProviderSettingsQueries>['catalogStateDetail'];
        isDefaultModel: boolean;
        isSavingDefault: boolean;
        isSyncingCatalog: boolean;
        setSelectedModelId: (modelId: string) => void;
        setDefaultModel: (modelId?: string) => Promise<void>;
        syncCatalog: () => Promise<void>;
    };
    kilo: {
        routingDraft: ReturnType<typeof useKiloRoutingDraft>['kiloRoutingDraft'];
        modelProviders: ReturnType<typeof useProviderSettingsQueries>['kiloModelProviders'];
        accountContext: ReturnType<typeof useProviderSettingsQueries>['kiloAccountContext'];
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

export function useProviderSettingsController(profileId: string, options?: ProviderSettingsControllerOptions) {
    const utils = trpc.useUtils();
    const selectionState = useProviderSettingsSelectionState(options);

    const queries = useProviderSettingsQueries({
        profileId,
        requestedProviderId: selectionState.requestedProviderId,
        requestedModelId: selectionState.requestedModelId,
    });
    const selectedProviderId = queries.selectedProviderId;

    const mutationModel = useProviderSettingsMutationModel({
        profileId,
        selectedProviderId,
        statusMessage: selectionState.statusMessage,
        setStatusMessage: selectionState.setStatusMessage,
        setActiveAuthFlow: selectionState.setActiveAuthFlow,
    });
    const mutations = mutationModel.mutations;

    useProviderSettingsAuthFlow({
        profileId,
        activeAuthFlow: selectionState.activeAuthFlow,
        isPolling: mutations.pollAuthMutation.isPending,
        pollAuth: ignoreMutationResult(mutations.pollAuthMutation.mutateAsync),
    });

    const { kiloRoutingDraft } = useKiloRoutingDraft({
        profileId,
        selectedProviderId,
        selectedModelId: queries.selectedModelId,
        preference: queries.kiloRoutingPreference,
        providerOptions: queries.kiloModelProviders,
        setStatusMessage: selectionState.setStatusMessage,
        savePreference: async (saveInput) => {
            await mutations.setModelRoutingPreferenceMutation.mutateAsync(saveInput);
        },
    });

    const loadStoredCredential = createLoadStoredCredential({
        profileId,
        selectedProviderId,
        fetchCredentialValue: utils.provider.getCredentialValue.fetch,
        setStatusMessage: selectionState.setStatusMessage,
    });

    const actions = createProviderSettingsActions({
        profileId,
        selectedProviderId,
        selectedModelId: queries.selectedModelId,
        currentOptionProfileId: queries.selectedProvider?.connectionProfile.optionProfileId ?? 'default',
        activeAuthFlow: selectionState.activeAuthFlow,
        kiloModelProviderIds: queries.kiloModelProviders.map((provider) => provider.providerId),
        kiloRoutingDraft,
        setSelectedProviderId: selectionState.setRequestedProviderId,
        setStatusMessage: selectionState.setStatusMessage,
        mutations: {
            setDefaultMutation: {
                mutateAsync: ignoreMutationResult(mutations.setDefaultMutation.mutateAsync),
            },
            syncCatalogMutation: {
                mutateAsync: ignoreMutationResult(mutations.syncCatalogMutation.mutateAsync),
            },
            setModelRoutingPreferenceMutation: {
                mutateAsync: ignoreMutationResult(mutations.setModelRoutingPreferenceMutation.mutateAsync),
            },
            setConnectionProfileMutation: {
                mutateAsync: ignoreMutationResult(mutations.setConnectionProfileMutation.mutateAsync),
            },
            setExecutionPreferenceMutation: {
                mutateAsync: ignoreMutationResult(mutations.setExecutionPreferenceMutation.mutateAsync),
            },
            setOrganizationMutation: {
                mutateAsync: ignoreMutationResult(mutations.setOrganizationMutation.mutateAsync),
            },
            setApiKeyMutation: {
                mutateAsync: ignoreMutationResult(mutations.setApiKeyMutation.mutateAsync),
            },
            startAuthMutation: {
                mutateAsync: ignoreMutationResult(mutations.startAuthMutation.mutateAsync),
            },
            pollAuthMutation: {
                mutateAsync: ignoreMutationResult(mutations.pollAuthMutation.mutateAsync),
            },
            cancelAuthMutation: {
                mutateAsync: ignoreMutationResult(mutations.cancelAuthMutation.mutateAsync),
            },
            openExternalUrlMutation: {
                mutateAsync: ignoreMutationResult(mutations.openExternalUrlMutation.mutateAsync),
            },
        },
        onPreviewProvider: (providerId) => {
            prefetchProviderSettingsData({
                profileId,
                providerId,
                trpcUtils: utils,
            });
        },
    });

    const refreshOpenAICodexUsage = createRefreshOpenAICodexUsage({
        selectedProviderId,
        refetchUsage: queries.openAISubscriptionUsageQuery.refetch,
        refetchRateLimits: queries.openAISubscriptionRateLimitsQuery.refetch,
    });

    return {
        feedback: {
            message: mutationModel.feedback.message,
            tone: mutationModel.feedback.tone,
        },
        selection: {
            providerItems: queries.providerItems,
            selectedProviderId,
            selectedProvider: queries.selectedProvider,
            selectProvider: actions.selectProvider,
            prefetchProvider: (providerId: RuntimeProviderId) => {
                prefetchProviderSettingsData({
                    profileId,
                    providerId,
                    trpcUtils: utils,
                });
            },
        },
        providerStatus: {
            authState: queries.selectedAuthState,
            accountContext: queries.kiloAccountContext,
            usageSummary: queries.selectedProviderUsageSummary,
            openAISubscriptionUsage: queries.openAISubscriptionUsage,
            openAISubscriptionRateLimits: queries.openAISubscriptionRateLimits,
            isLoadingAccountContext: queries.accountContextQuery.isLoading,
            isLoadingUsageSummary: queries.usageSummaryQuery.isLoading,
            isLoadingOpenAIUsage: queries.openAISubscriptionUsageQuery.isLoading,
            isLoadingOpenAIRateLimits: queries.openAISubscriptionRateLimitsQuery.isLoading,
            isRefreshingOpenAICodexUsage:
                queries.openAISubscriptionUsageQuery.isRefetching ||
                queries.openAISubscriptionRateLimitsQuery.isRefetching,
            refreshOpenAICodexUsage: wrapFailClosedAction(refreshOpenAICodexUsage),
        },
        authentication: {
            methods: queries.selectedProvider?.availableAuthMethods ?? [],
            credentialSummary: queries.credentialSummary,
            executionPreference: queries.selectedProvider?.executionPreference,
            activeAuthFlow: selectionState.activeAuthFlow,
            isSavingApiKey: mutations.setApiKeyMutation.isPending,
            isSavingConnectionProfile: mutations.setConnectionProfileMutation.isPending,
            isSavingExecutionPreference: mutations.setExecutionPreferenceMutation.isPending,
            isStartingAuth: mutations.startAuthMutation.isPending,
            isPollingAuth: mutations.pollAuthMutation.isPending,
            isCancellingAuth: mutations.cancelAuthMutation.isPending,
            isOpeningVerificationPage: mutations.openExternalUrlMutation.isPending,
            changeConnectionProfile: wrapFailClosedAction(actions.changeConnectionProfile),
            changeExecutionPreference: wrapFailClosedAction(actions.changeExecutionPreference),
            saveApiKey: actions.saveApiKey,
            saveBaseUrlOverride: actions.saveBaseUrlOverride,
            loadStoredCredential,
            startOAuthDevice: wrapFailClosedAction(actions.startOAuthDevice),
            startDeviceCode: wrapFailClosedAction(actions.startDeviceCode),
            pollNow: wrapFailClosedAction(actions.pollNow),
            cancelFlow: wrapFailClosedAction(actions.cancelFlow),
            openVerificationPage: wrapFailClosedAction(actions.openVerificationPage),
        },
        models: {
            selectedModelId: queries.selectedModelId,
            options: queries.modelOptions,
            catalogStateReason: queries.catalogStateReason,
            catalogStateDetail: queries.catalogStateDetail,
            isDefaultModel: queries.selectedIsDefaultModel,
            isSavingDefault: mutations.setDefaultMutation.isPending,
            isSyncingCatalog: mutations.syncCatalogMutation.isPending,
            setSelectedModelId: selectionState.setRequestedModelId,
            setDefaultModel: wrapFailClosedAction(actions.setDefaultModel),
            syncCatalog: wrapFailClosedAction(actions.syncCatalog),
        },
        kilo: {
            routingDraft: kiloRoutingDraft,
            modelProviders: queries.kiloModelProviders,
            accountContext: queries.kiloAccountContext,
            isLoadingRoutingPreference: queries.kiloRoutingPreferenceQuery.isLoading,
            isLoadingModelProviders: queries.kiloModelProvidersQuery.isLoading,
            isSavingRoutingPreference: mutations.setModelRoutingPreferenceMutation.isPending,
            isSavingOrganization: mutations.setOrganizationMutation.isPending,
            changeRoutingMode: wrapFailClosedAction(actions.changeRoutingMode),
            changeRoutingSort: wrapFailClosedAction(actions.changeRoutingSort),
            changePinnedProvider: wrapFailClosedAction(actions.changePinnedProvider),
            changeOrganization: wrapFailClosedAction(actions.changeOrganization),
        },
    } satisfies ProviderSettingsControllerState;
}

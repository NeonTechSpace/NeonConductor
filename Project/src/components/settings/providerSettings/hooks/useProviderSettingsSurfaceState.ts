import { createProviderSettingsActions } from '@/web/components/settings/providerSettings/hooks/providerSettingsActions';
import { useKiloRoutingDraft } from '@/web/components/settings/providerSettings/hooks/useKiloRoutingDraft';
import { useProviderSettingsAuthFlow } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsAuthFlow';
import { useProviderSettingsMutationModel } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutationModel';
import { useProviderSettingsQueries } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsQueries';
import { useProviderSettingsSelectionState } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsSelectionState';
import { prefetchProviderSettingsData } from '@/web/components/settings/providerSettings/providerSettingsPrefetch';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';

export interface ProviderSettingsControllerOptions {
    initialProviderId?: RuntimeProviderId;
}

function ignoreMutationResult<TInput, TResult>(mutateAsync: (input: TInput) => Promise<TResult>) {
    return async (input: TInput): Promise<void> => {
        await mutateAsync(input);
    };
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

export interface ProviderSettingsSurfaceState {
    profileId: string;
    utils: ReturnType<typeof trpc.useUtils>;
    selectionState: ReturnType<typeof useProviderSettingsSelectionState>;
    queries: ReturnType<typeof useProviderSettingsQueries>;
    mutationModel: ReturnType<typeof useProviderSettingsMutationModel>;
    mutations: ReturnType<typeof useProviderSettingsMutationModel>['mutations'];
    kiloRoutingDraft: ReturnType<typeof useKiloRoutingDraft>['kiloRoutingDraft'];
    actions: ReturnType<typeof createProviderSettingsActions>;
    loadStoredCredential: () => Promise<string | undefined>;
    refreshOpenAICodexUsage: () => Promise<void>;
}

export function useProviderSettingsSurfaceState(profileId: string, options?: ProviderSettingsControllerOptions) {
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
        profileId,
        utils,
        selectionState,
        queries,
        mutationModel,
        mutations,
        kiloRoutingDraft,
        actions,
        loadStoredCredential,
        refreshOpenAICodexUsage,
    } satisfies ProviderSettingsSurfaceState;
}

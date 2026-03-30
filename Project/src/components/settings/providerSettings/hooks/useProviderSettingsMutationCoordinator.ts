import { methodLabel } from '@/web/components/settings/providerSettings/helpers';
import { patchProviderCache } from '@/web/components/settings/providerSettings/providerSettingsCache';
import {
    getApiKeySavedStatusMessage,
    getAuthFlowCancelledStatusMessage,
    getAuthFlowCompletedStatusMessage,
    getAuthFlowStartedStatusMessage,
    getAuthFlowWaitingStatusMessage,
    getCatalogSyncFailureStatusMessage,
    getCatalogSyncSuccessStatusMessage,
    getConnectionProfileUpdatedStatusMessage,
    getDefaultUpdateFailureStatusMessage,
    getDefaultUpdateSuccessStatusMessage,
    getExecutionPreferenceStatusMessage,
    getOpenExternalUrlFallbackStatusMessage,
    getOrganizationUpdatedStatusMessage,
    getProviderNotFoundStatusMessage,
    getUnsupportedDefaultProviderStatusMessage,
} from '@/web/components/settings/providerSettings/hooks/providerSettingsStatusPolicy';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';
import { trpc } from '@/web/trpc/client';

import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';

import { providerIds, type RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsMutationCoordinatorInput {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    setStatusMessage: (value: string | undefined) => void;
    setActiveAuthFlow: (value: ActiveAuthFlow | undefined) => void;
}

function isRuntimeProviderId(value: string): value is RuntimeProviderId {
    return isOneOf(value, providerIds);
}

export function useProviderSettingsMutationCoordinator(input: UseProviderSettingsMutationCoordinatorInput) {
    const utils = trpc.useUtils();
    const selectedProviderId = input.selectedProviderId ?? 'openai';
    type ProviderAuthStateQueryData = Awaited<ReturnType<typeof utils.provider.getAuthState.fetch>>;

    const setAuthStateCache = (providerId: RuntimeProviderId, state: ProviderAuthStateRecord) => {
        const nextAuthState: ProviderAuthStateQueryData = {
            found: true,
            state,
        };

        utils.provider.getAuthState.setData(
            {
                profileId: input.profileId,
                providerId,
            },
            nextAuthState
        );
        patchProviderCache({
            utils,
            profileId: input.profileId,
            providerId,
            authState: state,
        });
    };

    const invalidateShellBootstrap = () => {
        void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
    };

    const invalidateCodexUsageAndRateLimits = () => {
        void utils.provider.getOpenAISubscriptionUsage.invalidate({ profileId: input.profileId });
        void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
    };

    const setDefaultMutation = trpc.provider.setDefault.useMutation({
        onSuccess: (result) => {
            if (!result.success) {
                input.setStatusMessage(getDefaultUpdateFailureStatusMessage(result.reason));
                return;
            }

            input.setStatusMessage(getDefaultUpdateSuccessStatusMessage());
            if (!isRuntimeProviderId(result.defaultProviderId)) {
                input.setStatusMessage(getUnsupportedDefaultProviderStatusMessage());
                return;
            }
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: result.defaultProviderId,
                defaults: {
                    providerId: result.defaultProviderId,
                    modelId: result.defaultModelId,
                },
            });
            invalidateShellBootstrap();
        },
    });

    const setApiKeyMutation = trpc.provider.setApiKey.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                input.setStatusMessage(getProviderNotFoundStatusMessage());
                return;
            }

            input.setStatusMessage(getApiKeySavedStatusMessage());
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: variables.providerId,
                authState: result.state,
            });
            void utils.provider.getCredentialSummary.invalidate({
                profileId: input.profileId,
                providerId: variables.providerId,
            });
            void utils.provider.getCredentialValue.invalidate({
                profileId: input.profileId,
                providerId: variables.providerId,
            });
            if (variables.providerId === 'openai_codex') {
                invalidateCodexUsageAndRateLimits();
            }
            invalidateShellBootstrap();
        },
    });

    const setConnectionProfileMutation = trpc.provider.setConnectionProfile.useMutation({
        onSuccess: ({ connectionProfile, defaults, models, provider }) => {
            input.setStatusMessage(getConnectionProfileUpdatedStatusMessage());
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: selectedProviderId,
                connectionProfile,
                defaults,
                models,
                ...(provider ? { provider } : {}),
            });
        },
    });

    const syncCatalogMutation = trpc.provider.syncCatalog.useMutation({
        onSuccess: (result) => {
            if (!result.ok) {
                input.setStatusMessage(getCatalogSyncFailureStatusMessage(result.reason));
                return;
            }

            const catalogStateReason =
                result.reason === 'catalog_sync_failed' || result.reason === 'catalog_empty_after_normalization'
                    ? result.reason
                    : undefined;

            input.setStatusMessage(getCatalogSyncSuccessStatusMessage(result.modelCount, catalogStateReason));
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: selectedProviderId,
                defaults: result.defaults,
                models: result.models,
                ...(catalogStateReason ? { catalogStateReason } : {}),
                ...(result.detail ? { catalogStateDetail: result.detail } : {}),
                ...(result.provider ? { provider: result.provider } : {}),
            });
            invalidateShellBootstrap();
        },
    });

    const setExecutionPreferenceMutation = trpc.provider.setExecutionPreference.useMutation({
        onSuccess: ({ executionPreference, provider }) => {
            input.setStatusMessage(getExecutionPreferenceStatusMessage(executionPreference.mode));
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: 'openai',
                executionPreference,
                ...(provider ? { provider } : {}),
            });
            invalidateShellBootstrap();
        },
    });

    const setModelRoutingPreferenceMutation = trpc.provider.setModelRoutingPreference.useMutation({
        onSuccess: ({ preference, providers }) => {
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: 'kilo',
                routingPreference: preference,
                routingProviders: providers,
                routingModelId: preference.modelId,
            });
        },
    });

    const setOrganizationMutation = trpc.provider.setOrganization.useMutation({
        onSuccess: (result) => {
            input.setStatusMessage(getOrganizationUpdatedStatusMessage());
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: 'kilo',
                accountContext: result,
                authState: result.authState,
                defaults: result.defaults,
                models: result.models,
                ...(result.provider ? { provider: result.provider } : {}),
            });
            invalidateShellBootstrap();
        },
    });

    const openExternalUrlMutation = trpc.system.openExternalUrl.useMutation({
        onError: () => {
            input.setStatusMessage(getOpenExternalUrlFallbackStatusMessage());
        },
    });

    const startAuthMutation = trpc.provider.startAuth.useMutation({
        onSuccess: (result, variables) => {
            input.setStatusMessage(getAuthFlowStartedStatusMessage(methodLabel(variables.method)));
            input.setActiveAuthFlow({
                providerId: variables.providerId,
                flowId: result.flow.id,
                ...(result.userCode ? { userCode: result.userCode } : {}),
                ...(result.verificationUri ? { verificationUri: result.verificationUri } : {}),
                pollAfterSeconds: result.pollAfterSeconds ?? 5,
            });
            setAuthStateCache(variables.providerId, {
                profileId: input.profileId,
                providerId: variables.providerId,
                authMethod: variables.method,
                authState: 'pending',
                updatedAt: new Date().toISOString(),
            });
            if (variables.providerId === 'kilo' && result.verificationUri) {
                void openExternalUrlMutation.mutateAsync({ url: result.verificationUri }).catch(() => undefined);
            }
            if (variables.providerId === 'openai_codex') {
                invalidateCodexUsageAndRateLimits();
            }
            invalidateShellBootstrap();
        },
    });

    const pollAuthMutation = trpc.provider.pollAuth.useMutation({
        onSuccess: (result, variables) => {
            setAuthStateCache(variables.providerId, result.state);

            if (result.flow.status === 'pending') {
                input.setStatusMessage(getAuthFlowWaitingStatusMessage());
                return;
            }

            input.setStatusMessage(getAuthFlowCompletedStatusMessage(result.flow.status, result.state.authState));
            input.setActiveAuthFlow(undefined);
            if (variables.providerId === 'kilo') {
                void utils.provider.getAccountContext.invalidate({
                    profileId: input.profileId,
                    providerId: 'kilo',
                });
                void syncCatalogMutation
                    .mutateAsync({
                        profileId: input.profileId,
                        providerId: 'kilo',
                        force: true,
                    })
                    .catch(() => undefined);
            }
            void utils.provider.getCredentialSummary.invalidate({
                profileId: input.profileId,
                providerId: variables.providerId,
            });
            void utils.provider.getCredentialValue.invalidate({
                profileId: input.profileId,
                providerId: variables.providerId,
            });
            if (variables.providerId === 'openai_codex') {
                invalidateCodexUsageAndRateLimits();
            }
            invalidateShellBootstrap();
        },
    });

    const cancelAuthMutation = trpc.provider.cancelAuth.useMutation({
        onSuccess: (result, variables) => {
            input.setStatusMessage(getAuthFlowCancelledStatusMessage());
            input.setActiveAuthFlow(undefined);
            setAuthStateCache(variables.providerId, result.state);
            if (variables.providerId === 'openai_codex') {
                invalidateCodexUsageAndRateLimits();
            }
            invalidateShellBootstrap();
        },
    });

    return {
        setDefaultMutation,
        setApiKeyMutation,
        setConnectionProfileMutation,
        setExecutionPreferenceMutation,
        syncCatalogMutation,
        setModelRoutingPreferenceMutation,
        setOrganizationMutation,
        openExternalUrlMutation,
        startAuthMutation,
        pollAuthMutation,
        cancelAuthMutation,
    };
}

import { methodLabel } from '@/web/components/settings/providerSettings/helpers';
import { patchProviderCache } from '@/web/components/settings/providerSettings/providerSettingsCache';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';
import { trpc } from '@/web/trpc/client';

import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';

import { providerIds, type RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsMutationsInput {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    setStatusMessage: (value: string | undefined) => void;
    setActiveAuthFlow: (value: ActiveAuthFlow | undefined) => void;
}

function isRuntimeProviderId(value: string): value is RuntimeProviderId {
    return isOneOf(value, providerIds);
}

export function useProviderSettingsMutations(input: UseProviderSettingsMutationsInput) {
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

    const setDefaultMutation = trpc.provider.setDefault.useMutation({
        onSuccess: (result) => {
            if (!result.success) {
                input.setStatusMessage(
                    result.reason === 'model_not_found' ? 'Selected model is not available.' : 'Default update failed.'
                );
                return;
            }

            input.setStatusMessage('Default provider/model updated.');
            if (!isRuntimeProviderId(result.defaultProviderId)) {
                input.setStatusMessage('Default update returned an unsupported provider.');
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
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
        },
    });

    const setApiKeyMutation = trpc.provider.setApiKey.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                input.setStatusMessage('Provider not found.');
                return;
            }

            input.setStatusMessage('API key saved. Provider is ready.');
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
                void utils.provider.getOpenAISubscriptionUsage.invalidate({ profileId: input.profileId });
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
        },
    });

    const setConnectionProfileMutation = trpc.provider.setConnectionProfile.useMutation({
        onSuccess: ({ connectionProfile, defaults, models, provider }) => {
            input.setStatusMessage('Connection profile updated.');
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
                input.setStatusMessage(
                    result.reason ? `Catalog sync failed: ${result.reason}` : 'Catalog sync failed.'
                );
                return;
            }
            const catalogStateReason =
                result.reason === 'catalog_sync_failed' || result.reason === 'catalog_empty_after_normalization'
                    ? result.reason
                    : undefined;

            input.setStatusMessage(
                result.modelCount > 0
                    ? `Catalog synced (${String(result.modelCount)} models).`
                    : catalogStateReason === 'catalog_empty_after_normalization'
                      ? 'Catalog refreshed, but no usable models were found.'
                      : undefined
            );
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
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
        },
    });

    const setExecutionPreferenceMutation = trpc.provider.setExecutionPreference.useMutation({
        onSuccess: ({ executionPreference, provider }) => {
            input.setStatusMessage(
                executionPreference.mode === 'realtime_websocket'
                    ? 'Realtime WebSocket enabled for OpenAI agent and orchestrator runs.'
                    : 'Standard HTTP restored for OpenAI runs.'
            );
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: 'openai',
                executionPreference,
                ...(provider ? { provider } : {}),
            });
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
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
            input.setStatusMessage('Kilo organization updated.');
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
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
        },
    });

    const openExternalUrlMutation = trpc.system.openExternalUrl.useMutation({
        onError: () => {
            input.setStatusMessage(
                'Sign-in started. Open the verification page from the auth card if your browser did not open.'
            );
        },
    });

    const startAuthMutation = trpc.provider.startAuth.useMutation({
        onSuccess: (result, variables) => {
            input.setStatusMessage(`${methodLabel(variables.method)} flow started.`);
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
                void utils.provider.getOpenAISubscriptionUsage.invalidate({ profileId: input.profileId });
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
        },
    });

    const pollAuthMutation = trpc.provider.pollAuth.useMutation({
        onSuccess: (result, variables) => {
            setAuthStateCache(variables.providerId, result.state);

            if (result.flow.status === 'pending') {
                input.setStatusMessage('Waiting for authorization confirmation...');
                return;
            }

            input.setStatusMessage(`Auth flow ${result.flow.status}. State: ${result.state.authState}.`);
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
                void utils.provider.getOpenAISubscriptionUsage.invalidate({ profileId: input.profileId });
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
        },
    });

    const cancelAuthMutation = trpc.provider.cancelAuth.useMutation({
        onSuccess: (result, variables) => {
            input.setStatusMessage('Auth flow cancelled.');
            input.setActiveAuthFlow(undefined);
            setAuthStateCache(variables.providerId, result.state);
            if (variables.providerId === 'openai_codex') {
                void utils.provider.getOpenAISubscriptionUsage.invalidate({ profileId: input.profileId });
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
            void utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId });
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

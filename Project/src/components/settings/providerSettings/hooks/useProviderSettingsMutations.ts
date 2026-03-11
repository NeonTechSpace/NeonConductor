import { methodLabel } from '@/web/components/settings/providerSettings/helpers';
import { patchProviderCache } from '@/web/components/settings/providerSettings/providerSettingsCache';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';
import { trpc } from '@/web/trpc/client';

import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsMutationsInput {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    setStatusMessage: (value: string | undefined) => void;
    setApiKeyInput: (value: string) => void;
    setActiveAuthFlow: (value: ActiveAuthFlow | undefined) => void;
}

export function useProviderSettingsMutations(input: UseProviderSettingsMutationsInput) {
    const utils = trpc.useUtils();
    const selectedProviderId = input.selectedProviderId ?? 'openai';
    type ProviderListQueryData = Awaited<ReturnType<typeof utils.provider.listProviders.fetch>>;
    type ProviderAuthStateQueryData = Awaited<ReturnType<typeof utils.provider.getAuthState.fetch>>;

    const updateProviderListItem = (
        providerId: RuntimeProviderId,
        updater: (provider: ProviderListQueryData['providers'][number]) => ProviderListQueryData['providers'][number]
    ) => {
        utils.provider.listProviders.setData({ profileId: input.profileId }, (current) => {
            if (!current) {
                return current;
            }

            return {
                providers: current.providers.map((provider) =>
                    provider.id === providerId ? updater(provider) : provider
                ),
            };
        });
    };

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
        updateProviderListItem(providerId, (provider) => ({
            ...provider,
            authState: state.authState,
            authMethod: state.authMethod,
        }));
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
            utils.provider.getDefaults.setData(
                { profileId: input.profileId },
                {
                    defaults: {
                        providerId: result.defaultProviderId,
                        modelId: result.defaultModelId,
                    },
                }
            );
            utils.provider.listProviders.setData({ profileId: input.profileId }, (current) => {
                if (!current) {
                    return current;
                }

                return {
                    providers: current.providers.map((provider) => ({
                        ...provider,
                        isDefault: provider.id === result.defaultProviderId,
                    })),
                };
            });
        },
    });

    const setApiKeyMutation = trpc.provider.setApiKey.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                input.setStatusMessage('Provider not found.');
                return;
            }

            input.setApiKeyInput('');
            input.setStatusMessage('API key saved. Provider is ready.');
            utils.provider.getAuthState.setData(
                {
                    profileId: input.profileId,
                    providerId: variables.providerId,
                },
                {
                    found: true,
                    state: result.state,
                }
            );
            updateProviderListItem(variables.providerId, (provider) => ({
                ...provider,
                authState: result.state.authState,
                authMethod: result.state.authMethod,
            }));
            if (variables.providerId === 'openai') {
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
        },
    });

    const setEndpointProfileMutation = trpc.provider.setEndpointProfile.useMutation({
        onSuccess: ({ endpointProfile, defaults, models, provider }) => {
            input.setStatusMessage('Endpoint profile updated.');
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: selectedProviderId,
                endpointProfile,
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

            input.setStatusMessage(`Catalog synced (${String(result.modelCount)} models).`);
            patchProviderCache({
                utils,
                profileId: input.profileId,
                providerId: selectedProviderId,
                defaults: result.defaults,
                models: result.models,
                ...(result.provider ? { provider: result.provider } : {}),
            });
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
            if (variables.providerId === 'openai') {
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
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
            }
            if (variables.providerId === 'openai') {
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
        },
    });

    const cancelAuthMutation = trpc.provider.cancelAuth.useMutation({
        onSuccess: (result, variables) => {
            input.setStatusMessage('Auth flow cancelled.');
            input.setActiveAuthFlow(undefined);
            setAuthStateCache(variables.providerId, result.state);
            if (variables.providerId === 'openai') {
                void utils.provider.getOpenAISubscriptionRateLimits.invalidate({ profileId: input.profileId });
            }
        },
    });

    return {
        setDefaultMutation,
        setApiKeyMutation,
        setEndpointProfileMutation,
        syncCatalogMutation,
        setModelRoutingPreferenceMutation,
        setOrganizationMutation,
        openExternalUrlMutation,
        startAuthMutation,
        pollAuthMutation,
        cancelAuthMutation,
    };
}

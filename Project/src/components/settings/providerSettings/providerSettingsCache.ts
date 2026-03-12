import { trpc } from '@/web/trpc/client';

import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    KiloModelProviderOption,
    ProviderConnectionProfileResult,
    ProviderListItem,
} from '@/app/backend/providers/service/types';

import type {
    KiloModelRoutingPreference,
    RuntimeProviderId,
} from '@/shared/contracts';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type ProviderListData = Awaited<ReturnType<TrpcUtils['provider']['listProviders']['fetch']>>;
type ProviderDefaultsData = Awaited<ReturnType<TrpcUtils['provider']['getDefaults']['fetch']>>;
type ProviderModelsData = Awaited<ReturnType<TrpcUtils['provider']['listModels']['fetch']>>;
type ProviderAuthStateData = Awaited<ReturnType<TrpcUtils['provider']['getAuthState']['fetch']>>;
type ProviderAccountContextData = Awaited<ReturnType<TrpcUtils['provider']['getAccountContext']['fetch']>>;
type ProviderConnectionProfileData = Awaited<ReturnType<TrpcUtils['provider']['getConnectionProfile']['fetch']>>;
type ProviderModelProvidersData = Awaited<ReturnType<TrpcUtils['provider']['listModelProviders']['fetch']>>;
type ProviderRoutingPreferenceData = Awaited<ReturnType<TrpcUtils['provider']['getModelRoutingPreference']['fetch']>>;
type ShellBootstrapData = Awaited<ReturnType<TrpcUtils['runtime']['getShellBootstrap']['fetch']>>;

function replaceProvider(
    current: ProviderListData | undefined,
    provider: ProviderListItem
): ProviderListData | undefined {
    if (!current) {
        return current;
    }

    return {
        providers: current.providers.map((candidate) => (candidate.id === provider.id ? provider : candidate)),
    };
}

function patchProviderAuthState(
    current: ProviderListData | undefined,
    input: { providerId: RuntimeProviderId; authState: ProviderAuthStateRecord }
): ProviderListData | undefined {
    if (!current) {
        return current;
    }

    return {
        providers: current.providers.map((provider) =>
            provider.id === input.providerId
                ? {
                      ...provider,
                      authState: input.authState.authState,
                      authMethod: input.authState.authMethod,
                  }
                : provider
        ),
    };
}

function replaceProviderModels(
    currentModels: ProviderModelRecord[],
    nextModels: ProviderModelRecord[],
    providerId: RuntimeProviderId
): ProviderModelRecord[] {
    return [...currentModels.filter((model) => model.providerId !== providerId), ...nextModels];
}

export function patchProviderCache(input: {
    utils: TrpcUtils;
    profileId: string;
    providerId: RuntimeProviderId;
    provider?: ProviderListItem;
    defaults?: { providerId: string; modelId: string };
    models?: ProviderModelRecord[];
    authState?: ProviderAuthStateRecord;
    accountContext?: ProviderAccountContextData;
    connectionProfile?: ProviderConnectionProfileResult;
    routingPreference?: KiloModelRoutingPreference;
    routingProviders?: KiloModelProviderOption[];
    routingModelId?: string;
}) {
    const authState = input.authState;

    if (input.provider) {
        const provider = input.provider;
        input.utils.provider.listProviders.setData(
            { profileId: input.profileId },
            (current: ProviderListData | undefined) => replaceProvider(current, provider)
        );
    }

    if (authState) {
        input.utils.provider.listProviders.setData(
            { profileId: input.profileId },
            (current: ProviderListData | undefined) =>
                patchProviderAuthState(current, {
                    providerId: input.providerId,
                    authState,
                })
        );
    }

    if (input.defaults) {
        input.utils.provider.getDefaults.setData(
            { profileId: input.profileId },
            {
                defaults: input.defaults,
            } satisfies ProviderDefaultsData
        );
    }

    if (input.models) {
        input.utils.provider.listModels.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                models: input.models,
                reason: null,
            } satisfies ProviderModelsData
        );
    }

    if (authState) {
        input.utils.provider.getAuthState.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                found: true,
                state: authState,
            } satisfies ProviderAuthStateData
        );
    }

    if (input.accountContext && input.providerId === 'kilo') {
        input.utils.provider.getAccountContext.setData(
            {
                profileId: input.profileId,
                providerId: 'kilo',
            },
            input.accountContext
        );
    }

    if (input.connectionProfile) {
        input.utils.provider.getConnectionProfile.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                connectionProfile: input.connectionProfile,
            } satisfies ProviderConnectionProfileData
        );
    }

    if (input.routingPreference && input.routingModelId) {
        input.utils.provider.getModelRoutingPreference.setData(
            {
                profileId: input.profileId,
                providerId: 'kilo',
                modelId: input.routingModelId,
            },
            {
                preference: input.routingPreference,
            } satisfies ProviderRoutingPreferenceData
        );
    }

    if (input.routingProviders && input.routingModelId) {
        input.utils.provider.listModelProviders.setData(
            {
                profileId: input.profileId,
                providerId: 'kilo',
                modelId: input.routingModelId,
            },
            {
                providers: input.routingProviders,
            } satisfies ProviderModelProvidersData
        );
    }

    if (input.provider || input.defaults || input.models || authState) {
        input.utils.runtime.getShellBootstrap.setData(
            { profileId: input.profileId },
            (current: ShellBootstrapData | undefined) => {
                if (!current) {
                    return current;
                }

                const nextProviders = current.providers.map((provider) => {
                    const replacedProvider = input.provider && provider.id === input.provider.id ? input.provider : provider;
                    if (authState && replacedProvider.id === input.providerId) {
                        return {
                            ...replacedProvider,
                            authState: authState.authState,
                            authMethod: authState.authMethod,
                        };
                    }

                    return replacedProvider;
                });

                return {
                    ...current,
                    providers: nextProviders,
                    ...(input.defaults ? { defaults: input.defaults } : {}),
                    ...(input.models
                        ? {
                              providerModels: replaceProviderModels(
                                  current.providerModels,
                                  input.models,
                                  input.providerId
                              ),
                          }
                        : {}),
                };
            }
        );
    }
}


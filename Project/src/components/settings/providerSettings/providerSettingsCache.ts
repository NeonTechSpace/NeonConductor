import { trpc } from '@/web/trpc/client';

import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    KiloModelProviderOption,
    ProviderControlEntry,
    ProviderControlSnapshot,
    ProviderConnectionProfileResult,
    ProviderListItem,
} from '@/app/backend/providers/service/types';

import type { KiloModelRoutingPreference, RuntimeProviderId } from '@/shared/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/shared/contracts/types/provider';


type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type ProviderListData = Awaited<ReturnType<TrpcUtils['provider']['listProviders']['fetch']>>;
type ProviderDefaultsData = Awaited<ReturnType<TrpcUtils['provider']['getDefaults']['fetch']>>;
type ProviderControlData = Awaited<ReturnType<TrpcUtils['provider']['getControlPlane']['fetch']>>;
type ProviderModelsData = Awaited<ReturnType<TrpcUtils['provider']['listModels']['fetch']>>;
type ProviderAuthStateData = Awaited<ReturnType<TrpcUtils['provider']['getAuthState']['fetch']>>;
type ProviderAccountContextData = Awaited<ReturnType<TrpcUtils['provider']['getAccountContext']['fetch']>>;
type ProviderConnectionProfileData = Awaited<ReturnType<TrpcUtils['provider']['getConnectionProfile']['fetch']>>;
type ProviderExecutionPreferenceData = Awaited<ReturnType<TrpcUtils['provider']['getExecutionPreference']['fetch']>>;
type ProviderModelProvidersData = Awaited<ReturnType<TrpcUtils['provider']['listModelProviders']['fetch']>>;
type ProviderRoutingPreferenceData = Awaited<ReturnType<TrpcUtils['provider']['getModelRoutingPreference']['fetch']>>;
type ShellBootstrapData = Awaited<ReturnType<TrpcUtils['runtime']['getShellBootstrap']['fetch']>>;
type EmptyCatalogStateReason = 'catalog_sync_failed' | 'catalog_empty_after_normalization';

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

function patchProviderControlEntry(
    currentEntry: ProviderControlEntry,
    input: {
        providerId: RuntimeProviderId;
        provider?: ProviderListItem;
        models?: ProviderModelRecord[];
        catalogStateReason?: EmptyCatalogStateReason;
        catalogStateDetail?: string;
        authState?: ProviderAuthStateRecord;
        connectionProfile?: ProviderConnectionProfileResult;
        executionPreference?: ProviderListItem['executionPreference'];
    }
): ProviderControlEntry {
    if (currentEntry.provider.id !== input.providerId) {
        return currentEntry;
    }

    const provider = input.provider ?? {
        ...currentEntry.provider,
        ...(input.connectionProfile ? { connectionProfile: input.connectionProfile } : {}),
        ...(input.executionPreference ? { executionPreference: input.executionPreference } : {}),
        ...(input.authState
            ? {
                  authState: input.authState.authState,
                  authMethod: input.authState.authMethod,
              }
            : {}),
    };
    const models = input.models ?? currentEntry.models;
    const invalidModelCount = currentEntry.catalogState.invalidModelCount;
    const catalogState =
        input.models !== undefined
            ? models.length > 0
                ? {
                      reason: null,
                      invalidModelCount,
                  }
                : {
                      reason: input.catalogStateReason ?? 'catalog_empty_after_normalization',
                      ...(input.catalogStateDetail ? { detail: input.catalogStateDetail } : {}),
                      invalidModelCount,
                  }
            : currentEntry.catalogState;

    return {
        provider: {
            ...provider,
            isDefault: provider.id === currentEntry.provider.id ? provider.isDefault : currentEntry.provider.isDefault,
        },
        models,
        catalogState,
    };
}

function patchProviderControlSnapshot(
    current: ProviderControlSnapshot | undefined,
    input: {
        providerId: RuntimeProviderId;
        provider?: ProviderListItem;
        defaults?: { providerId: string; modelId: string };
        specialistDefaults?: ProviderSpecialistDefaultRecord[];
        models?: ProviderModelRecord[];
        catalogStateReason?: EmptyCatalogStateReason;
        catalogStateDetail?: string;
        authState?: ProviderAuthStateRecord;
        connectionProfile?: ProviderConnectionProfileResult;
        executionPreference?: ProviderListItem['executionPreference'];
    }
): ProviderControlSnapshot | undefined {
    if (!current) {
        return current;
    }

    const nextDefaults = input.defaults ?? current.defaults;
    const nextEntries = current.entries.map((entry) => {
        const nextEntry = patchProviderControlEntry(entry, input);
        return {
            ...nextEntry,
            provider: {
                ...nextEntry.provider,
                isDefault: nextEntry.provider.id === nextDefaults.providerId,
            },
        };
    });

    return {
        entries: nextEntries,
        defaults: nextDefaults,
        specialistDefaults: input.specialistDefaults ?? current.specialistDefaults,
    };
}

export function patchProviderCache(input: {
    utils: TrpcUtils;
    profileId: string;
    providerId: RuntimeProviderId;
    provider?: ProviderListItem;
    defaults?: { providerId: string; modelId: string };
    specialistDefaults?: ProviderSpecialistDefaultRecord[];
    models?: ProviderModelRecord[];
    catalogStateReason?: EmptyCatalogStateReason;
    catalogStateDetail?: string;
    authState?: ProviderAuthStateRecord;
    accountContext?: ProviderAccountContextData;
    connectionProfile?: ProviderConnectionProfileResult;
    executionPreference?: ProviderListItem['executionPreference'];
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
        const nextDefaults = input.defaults;
        input.utils.provider.getDefaults.setData(
            { profileId: input.profileId },
            (current: ProviderDefaultsData | undefined) => ({
                defaults: nextDefaults,
                specialistDefaults: input.specialistDefaults ?? current?.specialistDefaults ?? [],
            })
        );
    }

    if (
        input.provider ||
        input.defaults ||
        input.specialistDefaults ||
        input.models ||
        authState ||
        input.connectionProfile ||
        input.executionPreference
    ) {
        const getControlPlaneCache = (
            input.utils.provider as {
                getControlPlane?: { setData: TrpcUtils['provider']['getControlPlane']['setData'] };
            }
        ).getControlPlane;
        getControlPlaneCache?.setData({ profileId: input.profileId }, (current: ProviderControlData | undefined) => {
            if (!current) {
                return current;
            }

            const nextProviderControl = patchProviderControlSnapshot(current.providerControl, input);
            if (!nextProviderControl) {
                return current;
            }

            return {
                providerControl: nextProviderControl,
            } satisfies ProviderControlData;
        });
    }

    if (input.models) {
        const nextModels = input.models;
        input.utils.provider.listModels.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            (current: ProviderModelsData | undefined) => {
                if (nextModels.length > 0) {
                    return {
                        models: nextModels,
                        reason: null,
                    } satisfies ProviderModelsData;
                }

                if (input.catalogStateReason !== undefined) {
                    return {
                        models: nextModels,
                        reason: input.catalogStateReason,
                        ...(input.catalogStateDetail ? { detail: input.catalogStateDetail } : {}),
                    } satisfies ProviderModelsData;
                }

                const preservedReason: EmptyCatalogStateReason =
                    current?.reason === 'catalog_sync_failed' || current?.reason === 'catalog_empty_after_normalization'
                        ? current.reason
                        : 'catalog_empty_after_normalization';
                const preservedDetail = preservedReason === current?.reason ? current.detail : undefined;

                return {
                    models: nextModels,
                    reason: preservedReason,
                    ...(preservedDetail ? { detail: preservedDetail } : {}),
                } satisfies ProviderModelsData;
            }
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

    if (input.executionPreference && input.providerId === 'openai') {
        input.utils.provider.getExecutionPreference.setData(
            {
                profileId: input.profileId,
                providerId: 'openai',
            },
            {
                executionPreference: input.executionPreference,
            } satisfies ProviderExecutionPreferenceData
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

    if (
        input.provider ||
        input.defaults ||
        input.specialistDefaults ||
        input.models ||
        authState ||
        input.connectionProfile ||
        input.executionPreference
    ) {
        input.utils.runtime.getShellBootstrap.setData(
            { profileId: input.profileId },
            (current: ShellBootstrapData | undefined) => {
                if (!current) {
                    return current;
                }

                const providerControl = patchProviderControlSnapshot(current.providerControl, input);
                if (!providerControl) {
                    return current;
                }

                return {
                    ...current,
                    providerControl,
                };
            }
        );
    }
}

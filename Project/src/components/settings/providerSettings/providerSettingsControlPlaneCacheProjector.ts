import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    ProviderConnectionProfileResult,
    ProviderControlEntry,
    ProviderControlSnapshot,
    ProviderListItem,
} from '@/app/backend/providers/service/types';

import type {
    EmptyCatalogStateReason,
    ProviderControlData,
    ProviderDefaultsData,
    ProviderListData,
    ProviderModelsData,
    ProviderSettingsCacheProjectionInput,
    ShellBootstrapData,
} from '@/web/components/settings/providerSettings/providerSettingsCache.types';

type ProviderControlPlanePatchInput = Parameters<typeof patchProviderControlSnapshot>[1];

function replaceProvider(current: ProviderListData | undefined, provider: ProviderListItem): ProviderListData | undefined {
    if (!current) {
        return current;
    }

    return {
        providers: current.providers.map((candidate) => (candidate.id === provider.id ? provider : candidate)),
    };
}

function patchProviderAuthState(
    current: ProviderListData | undefined,
    input: { providerId: ProviderSettingsCacheProjectionInput['providerId']; authState: ProviderAuthStateRecord }
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
        providerId: ProviderSettingsCacheProjectionInput['providerId'];
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
        providerId: ProviderSettingsCacheProjectionInput['providerId'];
        provider?: ProviderListItem;
        defaults?: { providerId: string; modelId: string };
        specialistDefaults?: ProviderSettingsCacheProjectionInput['specialistDefaults'];
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

function shouldPatchControlPlane(input: ProviderSettingsCacheProjectionInput): boolean {
    return (
        input.provider !== undefined ||
        input.defaults !== undefined ||
        input.specialistDefaults !== undefined ||
        input.models !== undefined ||
        input.authState !== undefined ||
        input.connectionProfile !== undefined ||
        input.executionPreference !== undefined
    );
}

function buildProviderControlPlanePatchInput(
    input: ProviderSettingsCacheProjectionInput
): ProviderControlPlanePatchInput {
    return {
        providerId: input.providerId,
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.defaults ? { defaults: input.defaults } : {}),
        ...(input.specialistDefaults ? { specialistDefaults: input.specialistDefaults } : {}),
        ...(input.models !== undefined ? { models: input.models } : {}),
        ...(input.catalogStateReason !== undefined ? { catalogStateReason: input.catalogStateReason } : {}),
        ...(input.catalogStateDetail !== undefined ? { catalogStateDetail: input.catalogStateDetail } : {}),
        ...(input.authState ? { authState: input.authState } : {}),
        ...(input.connectionProfile ? { connectionProfile: input.connectionProfile } : {}),
        ...(input.executionPreference ? { executionPreference: input.executionPreference } : {}),
    };
}

export function projectProviderSettingsControlPlaneCache(input: ProviderSettingsCacheProjectionInput): void {
    if (input.provider) {
        const provider = input.provider;
        input.utils.provider.listProviders.setData(
            { profileId: input.profileId },
            (current: ProviderListData | undefined) => replaceProvider(current, provider)
        );
    }

    if (input.authState) {
        input.utils.provider.listProviders.setData(
            { profileId: input.profileId },
            (current: ProviderListData | undefined) =>
                patchProviderAuthState(current, {
                    providerId: input.providerId,
                    authState: input.authState as ProviderAuthStateRecord,
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

    const nextControlPlaneInput = shouldPatchControlPlane(input)
        ? buildProviderControlPlanePatchInput(input)
        : undefined;

    if (shouldPatchControlPlane(input)) {
        const getControlPlaneCache = (input.utils.provider as {
            getControlPlane?: { setData: (input: { profileId: string }, next: (value: ProviderControlData | undefined) => ProviderControlData | undefined) => void };
        }).getControlPlane;
        getControlPlaneCache?.setData({ profileId: input.profileId }, (current: ProviderControlData | undefined) => {
            if (!current || !nextControlPlaneInput) {
                return current;
            }

            const nextProviderControl = patchProviderControlSnapshot(current.providerControl, nextControlPlaneInput);
            if (!nextProviderControl) {
                return current;
            }

            return {
                providerControl: nextProviderControl,
            } satisfies ProviderControlData;
        });
    }

    if (input.models !== undefined) {
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

    if (shouldPatchControlPlane(input)) {
        input.utils.runtime.getShellBootstrap.setData(
            { profileId: input.profileId },
            (current: ShellBootstrapData | undefined) => {
                if (!current || !nextControlPlaneInput) {
                    return current;
                }

                const providerControl = patchProviderControlSnapshot(current.providerControl, nextControlPlaneInput);
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

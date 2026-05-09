import { useState } from 'react';

import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import {
    buildProviderSettingsFeedback,
    type ProviderSettingsFeedbackState,
} from '@/web/components/settings/providerSettings/hooks/providerSettingsFeedback';
import { projectProviderSettingsControlPlaneCache } from '@/web/components/settings/providerSettings/providerSettingsControlPlaneCacheProjector';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import {
    getProviderControlDefaults,
    getProviderControlModelFavorites,
    getProviderControlModelRoleDefaults,
    getProviderControlSpecialistDefaults,
    listProviderControlModels,
    listProviderControlProviders,
} from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import { findProviderSpecialistDefault, providerSpecialistDefaultTargets } from '@/shared/contracts';
import { internalModelRoles, providerIds } from '@/shared/contracts';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';
import { resolveSpecialistAliasRoutingIntent } from '@/shared/modeRouting';

function isRuntimeProviderId(value: string | undefined): value is ProviderListItem['id'] {
    return isOneOf(value, providerIds);
}

function createModeOptions(input: {
    providers: Array<Pick<ProviderListItem, 'id' | 'label' | 'authState' | 'authMethod' | 'connectionProfile'>>;
    providerModels: ProviderModelRecord[];
    target: (typeof providerSpecialistDefaultTargets)[number];
}) {
    return input.providers.flatMap((provider) =>
        input.providerModels
            .filter((model) => model.providerId === provider.id)
            .map((model) =>
                buildModelPickerOption({
                    model,
                    provider,
                    compatibilityContext: {
                        surface: 'conversation',
                        routingRequirements: resolveSpecialistAliasRoutingIntent(input.target),
                        modeKey: input.target.modeKey,
                    },
                })
            )
    );
}

export interface ProviderSpecialistDefaultsTargetViewModel {
    target: (typeof providerSpecialistDefaultTargets)[number];
    modeOptions: ModelPickerOption[];
    selectedProviderId: ProviderListItem['id'] | undefined;
    selectedModelId: string;
    selectedOption: ModelPickerOption | undefined;
    sourceLabel: string;
}

export interface ProviderSpecialistDefaultsSectionGroupViewModel {
    label: string;
    targets: ProviderSpecialistDefaultsTargetViewModel[];
}

export interface ProviderModelRoleDefaultViewModel {
    role: (typeof internalModelRoles)[number];
    label: string;
    modeOptions: ModelPickerOption[];
    selectedProviderId: ProviderListItem['id'] | undefined;
    selectedModelId: string;
    sourceLabel: string;
    status: 'configured' | 'fallback' | 'unconfigured';
    detail?: string;
}

export interface ProviderSpecialistDefaultsControllerState {
    feedback: ProviderSettingsFeedbackState;
    modelFavorites: ReturnType<typeof getProviderControlModelFavorites>;
    modelRoleDefaults: ReturnType<typeof getProviderControlModelRoleDefaults>;
    roleDefaults: ProviderModelRoleDefaultViewModel[];
    groups: ProviderSpecialistDefaultsSectionGroupViewModel[];
    isSaving: boolean;
    saveModelRoleDefault: (input: {
        role: (typeof internalModelRoles)[number];
        providerId: ProviderListItem['id'];
        modelId: string;
    }) => void;
    saveModelFavorite: (option: ModelPickerOption, favorite: boolean) => void;
    saveSpecialistDefault: (input: {
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: ProviderListItem['id'];
        modelId: string;
    }) => void;
}

export function useProviderSpecialistDefaultsController(input: { profileId: string }): ProviderSpecialistDefaultsControllerState {
    const utils = trpc.useUtils();
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery({ profileId: input.profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    const setSpecialistDefaultMutation = trpc.provider.setSpecialistDefault.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                const failureMessage =
                    result.reason === 'model_not_found'
                        ? 'Selected model is not available.'
                        : result.reason === 'model_tools_required'
                          ? 'Selected model cannot be used for specialist defaults because it does not support native tools.'
                          : result.reason === 'provider_not_found'
                            ? 'Selected provider is no longer available.'
                            : 'Specialist default could not be saved.';
                setStatusMessage(failureMessage);
                return;
            }

            setStatusMessage(`${variables.topLevelTab}.${variables.modeKey} default updated.`);
            void Promise.allSettled([
                utils.provider.getControlPlane.invalidate({ profileId: input.profileId }),
                utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId }),
            ]);
        },
    });
    const setModelRoleDefaultMutation = trpc.provider.setModelRoleDefault.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                setStatusMessage(
                    result.reason === 'model_not_found'
                        ? 'Selected role model is not available.'
                        : 'Selected role provider is no longer available.'
                );
                return;
            }

            setStatusMessage(`${variables.role.replaceAll('_', ' ')} role default updated.`);
            void Promise.allSettled([
                utils.provider.getControlPlane.invalidate({ profileId: input.profileId }),
                utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId }),
            ]);
        },
    });
    const setModelFavoriteMutation = trpc.provider.setModelFavorite.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                setStatusMessage(
                    result.reason === 'model_not_found'
                        ? 'Selected favorite model is not available.'
                        : 'Model favorite could not be saved.'
                );
                return;
            }

            setStatusMessage(variables.favorite ? 'Model favorite saved.' : 'Model favorite removed.');
            projectProviderSettingsControlPlaneCache({
                utils,
                profileId: input.profileId,
                providerId: variables.providerId,
                modelFavorites: result.modelFavorites,
            });
            void Promise.allSettled([
                utils.provider.getControlPlane.invalidate({ profileId: input.profileId }),
                utils.provider.getDefaults.invalidate({ profileId: input.profileId }),
                utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId }),
            ]);
        },
    });

    const providerControl = shellBootstrapQuery.data?.providerControl;
    const providers = listProviderControlProviders(providerControl).filter((provider) =>
        isRuntimeProviderId(provider.id)
    );
    const providerModels = listProviderControlModels(providerControl);
    const defaults = getProviderControlDefaults(providerControl);
    const specialistDefaults = getProviderControlSpecialistDefaults(providerControl);
    const modelRoleDefaults = getProviderControlModelRoleDefaults(providerControl);
    const modelFavorites = getProviderControlModelFavorites(providerControl);
    const allModeOptions = providers.flatMap((provider) =>
        providerModels
            .filter((model) => model.providerId === provider.id)
            .map((model) =>
                buildModelPickerOption({
                    model,
                    provider,
                    compatibilityContext: {
                        surface: 'settings',
                    },
                })
            )
    );
    const roleDefaults = internalModelRoles.map((role) => {
        const defaultRecord = modelRoleDefaults.find((record) => record.role === role);
        const providerId =
            defaultRecord?.providerId && isRuntimeProviderId(defaultRecord.providerId)
                ? defaultRecord.providerId
                : undefined;
        const selectedModelId =
            providerId && defaultRecord?.modelId
                ? canonicalizeProviderModelId(providerId, defaultRecord.modelId)
                : '';
        return {
            role,
            label: role
                .split('_')
                .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
                .join(' '),
            modeOptions: allModeOptions,
            selectedProviderId: providerId,
            selectedModelId,
            sourceLabel: defaultRecord?.sourceLabel ?? 'No role default available',
            status: defaultRecord?.status ?? 'unconfigured',
            ...(defaultRecord?.detail ? { detail: defaultRecord.detail } : {}),
        };
    });

    const groups = [
        {
            label: 'Agent',
            targets: providerSpecialistDefaultTargets
                .filter((target) => target.topLevelTab === 'agent')
                .map((target) => {
                    const modeOptions = createModeOptions({
                        providers,
                        providerModels,
                        target,
                    });
                    const savedSpecialistDefault = findProviderSpecialistDefault(specialistDefaults, target);
                    const fallbackProviderId =
                        defaults && isRuntimeProviderId(defaults.providerId) ? defaults.providerId : undefined;
                    const fallbackModelId =
                        fallbackProviderId && defaults?.modelId
                            ? canonicalizeProviderModelId(fallbackProviderId, defaults.modelId)
                            : '';
                    const savedModelId =
                        savedSpecialistDefault &&
                        modeOptions.some(
                            (option) =>
                                option.providerId === savedSpecialistDefault.providerId &&
                                option.id ===
                                    canonicalizeProviderModelId(
                                        savedSpecialistDefault.providerId,
                                        savedSpecialistDefault.modelId
                                    )
                        )
                            ? canonicalizeProviderModelId(
                                  savedSpecialistDefault.providerId,
                                  savedSpecialistDefault.modelId
                              )
                            : '';
                    const selectedModelId =
                        savedModelId || (fallbackModelId && modeOptions.some((option) => option.id === fallbackModelId) ? fallbackModelId : '');
                    const selectedProviderId =
                        savedSpecialistDefault?.providerId ??
                        (fallbackProviderId && modeOptions.some((option) => option.providerId === fallbackProviderId)
                            ? fallbackProviderId
                            : undefined);
                    const selectedOption = modeOptions.find((option) => option.id === selectedModelId);

                    return {
                        target,
                        modeOptions,
                        selectedProviderId,
                        selectedModelId,
                        selectedOption,
                        sourceLabel: savedSpecialistDefault ? 'Saved specialist default' : 'Using shared fallback',
                    };
                }),
        },
        {
            label: 'Orchestrator',
            targets: providerSpecialistDefaultTargets
                .filter((target) => target.topLevelTab === 'orchestrator')
                .map((target) => {
                    const modeOptions = createModeOptions({
                        providers,
                        providerModels,
                        target,
                    });
                    const savedSpecialistDefault = findProviderSpecialistDefault(specialistDefaults, target);
                    const fallbackProviderId =
                        defaults && isRuntimeProviderId(defaults.providerId) ? defaults.providerId : undefined;
                    const fallbackModelId =
                        fallbackProviderId && defaults?.modelId
                            ? canonicalizeProviderModelId(fallbackProviderId, defaults.modelId)
                            : '';
                    const savedModelId =
                        savedSpecialistDefault &&
                        modeOptions.some(
                            (option) =>
                                option.providerId === savedSpecialistDefault.providerId &&
                                option.id ===
                                    canonicalizeProviderModelId(
                                        savedSpecialistDefault.providerId,
                                        savedSpecialistDefault.modelId
                                    )
                        )
                            ? canonicalizeProviderModelId(
                                  savedSpecialistDefault.providerId,
                                  savedSpecialistDefault.modelId
                              )
                            : '';
                    const selectedModelId =
                        savedModelId || (fallbackModelId && modeOptions.some((option) => option.id === fallbackModelId) ? fallbackModelId : '');
                    const selectedProviderId =
                        savedSpecialistDefault?.providerId ??
                        (fallbackProviderId && modeOptions.some((option) => option.providerId === fallbackProviderId)
                            ? fallbackProviderId
                            : undefined);
                    const selectedOption = modeOptions.find((option) => option.id === selectedModelId);

                    return {
                        target,
                        modeOptions,
                        selectedProviderId,
                        selectedModelId,
                        selectedOption,
                        sourceLabel: savedSpecialistDefault ? 'Saved specialist default' : 'Using shared fallback',
                    };
                }),
        },
    ];

    async function saveSpecialistDefaultInternal(inputValue: {
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: ProviderListItem['id'];
        modelId: string;
    }) {
        try {
            await setSpecialistDefaultMutation.mutateAsync({
                profileId: input.profileId,
                topLevelTab: inputValue.topLevelTab,
                modeKey: inputValue.modeKey,
                providerId: inputValue.providerId,
                modelId: inputValue.modelId,
            });
        } catch {
            // The mutation error is surfaced through the hook state and feedback banner.
        }
    }

    async function saveModelRoleDefaultInternal(inputValue: {
        role: (typeof internalModelRoles)[number];
        providerId: ProviderListItem['id'];
        modelId: string;
    }) {
        try {
            await setModelRoleDefaultMutation.mutateAsync({
                profileId: input.profileId,
                role: inputValue.role,
                providerId: inputValue.providerId,
                modelId: inputValue.modelId,
            });
        } catch {
            // The mutation error is surfaced through the hook state and feedback banner.
        }
    }

    async function saveModelFavoriteInternal(option: ModelPickerOption, favorite: boolean) {
        if (!option.providerId || !isRuntimeProviderId(option.providerId)) {
            return;
        }

        try {
            await setModelFavoriteMutation.mutateAsync({
                profileId: input.profileId,
                providerId: option.providerId,
                modelId: option.id,
                favorite,
            });
        } catch {
            // The mutation error is surfaced through the hook state and feedback banner.
        }
    }

    return {
        feedback: buildProviderSettingsFeedback({
            statusMessage,
            mutationErrorSources: [
                setSpecialistDefaultMutation,
                setModelRoleDefaultMutation,
                setModelFavoriteMutation,
            ],
        }),
        modelFavorites,
        modelRoleDefaults,
        roleDefaults,
        groups,
        isSaving:
            setSpecialistDefaultMutation.isPending ||
            setModelRoleDefaultMutation.isPending ||
            setModelFavoriteMutation.isPending,
        saveModelRoleDefault: (inputValue) => {
            void createFailClosedAsyncAction(saveModelRoleDefaultInternal)(inputValue);
        },
        saveSpecialistDefault: (inputValue) => {
            void createFailClosedAsyncAction(saveSpecialistDefaultInternal)(inputValue);
        },
        saveModelFavorite: (option, favorite) => {
            void createFailClosedAsyncAction(saveModelFavoriteInternal)(option, favorite);
        },
    };
}

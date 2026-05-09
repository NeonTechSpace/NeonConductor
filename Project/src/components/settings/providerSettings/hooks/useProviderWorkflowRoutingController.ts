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
    getProviderControlInternalModelRoleDiagnostics,
    getProviderControlModelFavorites,
    getProviderControlModelRoleDefaults,
    getProviderControlWorkflowRoutingPreferences,
    listProviderControlModels,
    listProviderControlProviders,
} from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import { providerIds, resolveWorkflowRoutingPreference, type WorkflowRoutingTargetKey } from '@/shared/contracts';
import type { WorkflowRoutingPreferenceRecord } from '@/shared/contracts/types/provider';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';
import {
    getWorkflowRoutingCompatibilityReason,
    getWorkflowRoutingTargetLabel,
    resolveWorkflowRoutingCompatibilityRequirements,
} from '@/shared/workflowRouting';

const workflowRoutingTargetKeys: WorkflowRoutingTargetKey[] = ['planning', 'planning_advanced'];

function isRuntimeProviderId(value: string | undefined): value is ProviderListItem['id'] {
    return isOneOf(value, providerIds);
}

function buildWorkflowRoutingOptions(input: {
    providers: Array<Pick<ProviderListItem, 'id' | 'label' | 'authState' | 'authMethod' | 'connectionProfile'>>;
    providerModels: ProviderModelRecord[];
    targetKey: WorkflowRoutingTargetKey;
}): ModelPickerOption[] {
    const routingRequirements = resolveWorkflowRoutingCompatibilityRequirements(input.targetKey);

    return input.providers.flatMap((provider) =>
        input.providerModels
            .filter((model) => model.providerId === provider.id)
            .map((model) =>
                buildModelPickerOption({
                    model,
                    provider,
                    compatibilityContext: {
                        surface: 'settings',
                        routingRequirements,
                        modeKey: input.targetKey,
                    },
                })
            )
            .map((option) => {
                if (input.targetKey !== 'planning_advanced' || option.supportsReasoning) {
                    return option;
                }

                const compatibilityReason = getWorkflowRoutingCompatibilityReason(input.targetKey);
                return {
                    ...option,
                    compatibilityState: 'incompatible',
                    compatibilityScope: 'model',
                    ...(compatibilityReason ? { compatibilityReason } : {}),
                };
            })
    );
}

function resolveEffectiveWorkflowRoutingPreference(input: {
    workflowRoutingPreferences: WorkflowRoutingPreferenceRecord[];
    targetKey: WorkflowRoutingTargetKey;
}): {
    preference: WorkflowRoutingPreferenceRecord;
    resolvedTargetKey: WorkflowRoutingTargetKey;
    fellBackToPlanning: boolean;
} | undefined {
    return resolveWorkflowRoutingPreference(input.workflowRoutingPreferences, input.targetKey);
}

export interface ProviderWorkflowRoutingTargetViewModel {
    targetKey: WorkflowRoutingTargetKey;
    label: string;
    modeOptions: ModelPickerOption[];
    selectedProviderId: ProviderListItem['id'] | undefined;
    selectedModelId: string;
    selectedOption: ModelPickerOption | undefined;
    sourceLabel: string;
    canClear: boolean;
}

export interface ProviderWorkflowRoutingControllerState {
    feedback: ProviderSettingsFeedbackState;
    modelFavorites: ReturnType<typeof getProviderControlModelFavorites>;
    modelRoleDefaults: ReturnType<typeof getProviderControlModelRoleDefaults>;
    targets: ProviderWorkflowRoutingTargetViewModel[];
    isSaving: boolean;
    saveWorkflowRoutingPreference: (input: {
        targetKey: WorkflowRoutingTargetKey;
        providerId: ProviderListItem['id'];
        modelId: string;
    }) => void;
    clearWorkflowRoutingPreference: (input: { targetKey: WorkflowRoutingTargetKey }) => void;
    saveModelFavorite: (option: ModelPickerOption, favorite: boolean) => void;
}

export function useProviderWorkflowRoutingController(input: {
    profileId: string;
}): ProviderWorkflowRoutingControllerState {
    const utils = trpc.useUtils();
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const providerControl = shellBootstrapQuery.data?.providerControl;
    const providers = listProviderControlProviders(providerControl).filter((provider) => isRuntimeProviderId(provider.id));
    const providerModels = listProviderControlModels(providerControl);
    const defaults = getProviderControlDefaults(providerControl);
    const workflowRoutingPreferences = getProviderControlWorkflowRoutingPreferences(providerControl);
    const internalModelRoleDiagnostics = getProviderControlInternalModelRoleDiagnostics(providerControl);
    const modelFavorites = getProviderControlModelFavorites(providerControl);
    const modelRoleDefaults = getProviderControlModelRoleDefaults(providerControl);
    const projectionProviderId = providers[0]?.id ?? 'openai';

    const setWorkflowRoutingPreferenceMutation = trpc.provider.setWorkflowRoutingPreference.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                setStatusMessage(
                    result.reason === 'model_not_found'
                        ? 'Selected model is not available.'
                        : result.reason === 'model_not_compatible'
                          ? 'Selected model does not satisfy the workflow-routing requirements for this target.'
                          : result.reason === 'provider_not_found'
                            ? 'Selected provider is no longer available.'
                            : 'Workflow routing preference could not be saved.'
                );
                return;
            }

            setStatusMessage(`${getWorkflowRoutingTargetLabel(variables.targetKey)} workflow routing updated.`);
            projectProviderSettingsControlPlaneCache({
                utils,
                profileId: input.profileId,
                providerId: variables.providerId,
                workflowRoutingPreferences: result.workflowRoutingPreferences,
            });
            void Promise.allSettled([
                utils.provider.getControlPlane.invalidate({ profileId: input.profileId }),
                utils.provider.getDefaults.invalidate({ profileId: input.profileId }),
                utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId }),
            ]);
        },
    });

    const clearWorkflowRoutingPreferenceMutation = trpc.provider.clearWorkflowRoutingPreference.useMutation({
        onSuccess: (result, variables) => {
            setStatusMessage(`${getWorkflowRoutingTargetLabel(variables.targetKey)} workflow routing cleared.`);
            projectProviderSettingsControlPlaneCache({
                utils,
                profileId: input.profileId,
                providerId: projectionProviderId,
                workflowRoutingPreferences: result.workflowRoutingPreferences,
            });
            void Promise.allSettled([
                utils.provider.getControlPlane.invalidate({ profileId: input.profileId }),
                utils.provider.getDefaults.invalidate({ profileId: input.profileId }),
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

    const targets = workflowRoutingTargetKeys.map((targetKey) => {
        const modeOptions = buildWorkflowRoutingOptions({
            providers,
            providerModels,
            targetKey,
        });
        const effectivePreference = resolveEffectiveWorkflowRoutingPreference({
            workflowRoutingPreferences,
            targetKey,
        });
        const fallbackProviderId =
            defaults && isRuntimeProviderId(defaults.providerId) ? defaults.providerId : undefined;
        const fallbackModelId =
            fallbackProviderId && defaults?.modelId
                ? canonicalizeProviderModelId(fallbackProviderId, defaults.modelId)
                : '';
        const selectedProviderId =
            effectivePreference?.preference.providerId ??
            (fallbackProviderId && modeOptions.some((option) => option.providerId === fallbackProviderId)
                ? fallbackProviderId
                : undefined);
        const selectedModelId =
            effectivePreference?.preference.providerId &&
            modeOptions.some(
                (option) =>
                    option.providerId === effectivePreference.preference.providerId &&
                    option.id ===
                        canonicalizeProviderModelId(
                            effectivePreference.preference.providerId,
                            effectivePreference.preference.modelId
                        )
            )
                ? canonicalizeProviderModelId(
                      effectivePreference.preference.providerId,
                      effectivePreference.preference.modelId
                  )
                : fallbackModelId && modeOptions.some((option) => option.id === fallbackModelId)
                  ? fallbackModelId
                  : '';
        const selectedOption = modeOptions.find(
            (option) => option.providerId === selectedProviderId && option.id === selectedModelId
        );
        const sourceLabel = (() => {
            const plannerTargetDiagnostic = internalModelRoleDiagnostics?.plannerTargets.find(
                (diagnostic) => diagnostic.targetKey === targetKey
            );
            if (plannerTargetDiagnostic) {
                return plannerTargetDiagnostic.sourceLabel;
            }

            if (!effectivePreference) {
                return 'Using shared fallback';
            }

            const effectiveModelId = canonicalizeProviderModelId(
                effectivePreference.preference.providerId,
                effectivePreference.preference.modelId
            );
            if (
                selectedProviderId === effectivePreference.preference.providerId &&
                selectedModelId === effectiveModelId
            ) {
                return effectivePreference.fellBackToPlanning
                    ? 'Using planning fallback'
                    : 'Saved workflow routing';
            }

            return 'Using shared fallback';
        })();

        return {
            targetKey,
            label: getWorkflowRoutingTargetLabel(targetKey),
            modeOptions,
            selectedProviderId,
            selectedModelId,
            selectedOption,
            sourceLabel,
            canClear: effectivePreference !== undefined && !effectivePreference.fellBackToPlanning,
        } satisfies ProviderWorkflowRoutingTargetViewModel;
    });

    async function saveWorkflowRoutingPreferenceInternal(inputValue: {
        targetKey: WorkflowRoutingTargetKey;
        providerId: ProviderListItem['id'];
        modelId: string;
    }) {
        try {
            await setWorkflowRoutingPreferenceMutation.mutateAsync({
                profileId: input.profileId,
                targetKey: inputValue.targetKey,
                providerId: inputValue.providerId,
                modelId: inputValue.modelId,
            });
        } catch {
            // Mutation errors are surfaced through the controller state.
        }
    }

    async function clearWorkflowRoutingPreferenceInternal(inputValue: { targetKey: WorkflowRoutingTargetKey }) {
        try {
            await clearWorkflowRoutingPreferenceMutation.mutateAsync({
                profileId: input.profileId,
                targetKey: inputValue.targetKey,
            });
        } catch {
            // Mutation errors are surfaced through the controller state.
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
            // Mutation errors are surfaced through the controller state.
        }
    }

    return {
        feedback: buildProviderSettingsFeedback({
            statusMessage,
            mutationErrorSources: [
                setWorkflowRoutingPreferenceMutation,
                clearWorkflowRoutingPreferenceMutation,
                setModelFavoriteMutation,
            ],
        }),
        modelFavorites,
        modelRoleDefaults,
        targets,
        isSaving:
            setWorkflowRoutingPreferenceMutation.isPending ||
            clearWorkflowRoutingPreferenceMutation.isPending ||
            setModelFavoriteMutation.isPending,
        saveWorkflowRoutingPreference: (workflowRoutingInput) => {
            void createFailClosedAsyncAction(saveWorkflowRoutingPreferenceInternal)(workflowRoutingInput);
        },
        clearWorkflowRoutingPreference: (workflowRoutingInput) => {
            void createFailClosedAsyncAction(clearWorkflowRoutingPreferenceInternal)(workflowRoutingInput);
        },
        saveModelFavorite: (option, favorite) => {
            void createFailClosedAsyncAction(saveModelFavoriteInternal)(option, favorite);
        },
    };
}

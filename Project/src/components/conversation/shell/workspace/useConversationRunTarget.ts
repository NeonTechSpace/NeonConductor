import { isProviderId, type RunTargetSelection } from '@/web/components/conversation/shell/workspace/helpers';
import {
    buildModelPickerOption,
    getModelCompatibilityPriority,
    isCompatibleModelOption,
    type ModelPickerOption,
} from '@/web/components/modelSelection/modelCapabilities';

import type { ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import {
    findProviderSpecialistDefault,
    isSupportedProviderSpecialistDefaultTarget,
} from '@/shared/contracts';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/shared/contracts/types/provider';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';


interface UseConversationRunTargetInput {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    specialistDefaults?: ProviderSpecialistDefaultRecord[];
    workspacePreference?: WorkspacePreferenceRecord;
    sessionOverride?: { providerId?: RuntimeProviderId; modelId?: string };
    mainViewDraft?: { providerId?: RuntimeProviderId; modelId?: string };
    runs: RunRecord[];
    topLevelTab?: TopLevelTab;
    requiresTools?: boolean;
    modeKey?: string;
    hasPendingImageAttachments?: boolean;
    imageAttachmentsAllowed?: boolean;
}

export function useConversationRunTarget(input: UseConversationRunTargetInput) {
    const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));

    const modelsByProvider = new Map<RuntimeProviderId, ProviderModelRecord[]>();
    for (const model of input.providerModels) {
        const existing = modelsByProvider.get(model.providerId) ?? [];
        existing.push(model);
        modelsByProvider.set(model.providerId, existing);
    }

    const modelOptions = input.providers.flatMap((provider) =>
        (modelsByProvider.get(provider.id) ?? []).map((model) =>
            buildModelPickerOption({
                model,
                provider,
                compatibilityContext: {
                    surface: 'conversation',
                    requiresTools: input.requiresTools,
                    ...(input.modeKey ? { modeKey: input.modeKey } : {}),
                    hasPendingImageAttachments: input.hasPendingImageAttachments,
                    imageAttachmentsAllowed: input.imageAttachmentsAllowed,
                },
            })
        )
    );
    const optionsByKey = new Map(
        modelOptions.map((option) => [`${option.providerId ?? 'unknown'}:${option.id}`, option] as const)
    );
    const hasCompatibleOptions = modelOptions.some((option) => isCompatibleModelOption(option));
    const specialistTarget =
        input.topLevelTab && input.modeKey
            ? {
                  topLevelTab: input.topLevelTab,
                  modeKey: input.modeKey,
              }
            : undefined;
    const matchingSpecialistDefault =
        specialistTarget && isSupportedProviderSpecialistDefaultTarget(specialistTarget)
            ? findProviderSpecialistDefault(input.specialistDefaults ?? [], specialistTarget)
            : undefined;

    function getOption(providerId: RuntimeProviderId, modelId: string): ModelPickerOption | undefined {
        const canonicalModelId = canonicalizeProviderModelId(providerId, modelId);
        return optionsByKey.get(`${providerId}:${canonicalModelId}`);
    }

    function modelExists(providerId: RuntimeProviderId, modelId: string): boolean {
        return getOption(providerId, modelId) !== undefined;
    }

    function canAutoResolve(option: ModelPickerOption | undefined): option is ModelPickerOption {
        if (!option) {
            return false;
        }

        if (!hasCompatibleOptions) {
            return true;
        }

        return isCompatibleModelOption(option);
    }

    let resolvedRunTarget: RunTargetSelection | undefined;
    if (input.sessionOverride?.providerId && input.sessionOverride.modelId) {
        const modelId = canonicalizeProviderModelId(input.sessionOverride.providerId, input.sessionOverride.modelId);
        if (modelExists(input.sessionOverride.providerId, modelId)) {
            resolvedRunTarget = {
                providerId: input.sessionOverride.providerId,
                modelId,
            };
        }
    }

    if (!resolvedRunTarget) {
        if (input.mainViewDraft?.providerId && input.mainViewDraft.modelId) {
            const modelId = canonicalizeProviderModelId(input.mainViewDraft.providerId, input.mainViewDraft.modelId);
            if (canAutoResolve(getOption(input.mainViewDraft.providerId, modelId))) {
                resolvedRunTarget = {
                    providerId: input.mainViewDraft.providerId,
                    modelId,
                };
            }
        }
    }

    if (!resolvedRunTarget) {
        for (const run of input.runs) {
            if (!isProviderId(run.providerId) || typeof run.modelId !== 'string') {
                continue;
            }

            const candidate = getOption(run.providerId, run.modelId);
            if (!canAutoResolve(candidate)) {
                continue;
            }

            resolvedRunTarget = {
                providerId: run.providerId,
                modelId: canonicalizeProviderModelId(run.providerId, run.modelId),
            };
            break;
        }
    }

    if (
        !resolvedRunTarget &&
        matchingSpecialistDefault &&
        canAutoResolve(getOption(matchingSpecialistDefault.providerId, matchingSpecialistDefault.modelId))
    ) {
        resolvedRunTarget = {
            providerId: matchingSpecialistDefault.providerId,
            modelId: canonicalizeProviderModelId(
                matchingSpecialistDefault.providerId,
                matchingSpecialistDefault.modelId
            ),
        };
    }

    if (
        !resolvedRunTarget &&
        input.workspacePreference?.defaultProviderId &&
        input.workspacePreference.defaultModelId &&
        canAutoResolve(getOption(input.workspacePreference.defaultProviderId, input.workspacePreference.defaultModelId))
    ) {
        resolvedRunTarget = {
            providerId: input.workspacePreference.defaultProviderId,
            modelId: canonicalizeProviderModelId(
                input.workspacePreference.defaultProviderId,
                input.workspacePreference.defaultModelId
            ),
        };
    }

    if (
        !resolvedRunTarget &&
        input.defaults &&
        isProviderId(input.defaults.providerId) &&
        canAutoResolve(getOption(input.defaults.providerId, input.defaults.modelId))
    ) {
        resolvedRunTarget = {
            providerId: input.defaults.providerId,
            modelId: canonicalizeProviderModelId(input.defaults.providerId, input.defaults.modelId),
        };
    }

    if (!resolvedRunTarget) {
        const rankedModelOptions = [...modelOptions].sort((left, right) => {
            const priorityDifference = getModelCompatibilityPriority(left) - getModelCompatibilityPriority(right);
            if (priorityDifference !== 0) {
                return priorityDifference;
            }

            return 0;
        });
        const firstModel = rankedModelOptions[0];
        if (firstModel?.providerId && isProviderId(firstModel.providerId)) {
            resolvedRunTarget = {
                providerId: firstModel.providerId,
                modelId: firstModel.id,
            };
        }
    }

    const selectedProviderIdForComposer =
        input.sessionOverride?.providerId ?? input.mainViewDraft?.providerId ?? resolvedRunTarget?.providerId;
    const selectedModelIdForComposer =
        selectedProviderIdForComposer &&
        (input.sessionOverride?.modelId ?? input.mainViewDraft?.modelId ?? resolvedRunTarget?.modelId)
            ? canonicalizeProviderModelId(
                  selectedProviderIdForComposer,
                  input.sessionOverride?.modelId ?? input.mainViewDraft?.modelId ?? resolvedRunTarget?.modelId ?? ''
              )
            : undefined;
    const selectedModelForComposer =
        selectedProviderIdForComposer && selectedModelIdForComposer
            ? (modelsByProvider.get(selectedProviderIdForComposer) ?? []).find(
                  (model) => model.id === selectedModelIdForComposer
              )
            : undefined;
    const selectedModelOptionForComposer =
        selectedProviderIdForComposer && selectedModelIdForComposer
            ? getOption(selectedProviderIdForComposer, selectedModelIdForComposer)
            : undefined;

    return {
        providerById,
        modelsByProvider,
        resolvedRunTarget,
        selectedProviderIdForComposer,
        selectedModelIdForComposer,
        selectedModelForComposer,
        selectedModelOptionForComposer,
        modelOptions,
    };
}


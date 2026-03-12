import { isProviderId, type RunTargetSelection } from '@/web/components/conversation/shell/workspace/helpers';
import {
    buildModelPickerOption,
    getModelCompatibilityPriority,
    isCompatibleModelOption,
    type ModelPickerOption,
} from '@/web/components/modelSelection/modelCapabilities';

import type { ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseConversationRunTargetInput {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    sessionOverride?: { providerId?: RuntimeProviderId; modelId?: string };
    runs: RunRecord[];
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

    function getOption(providerId: RuntimeProviderId, modelId: string): ModelPickerOption | undefined {
        return optionsByKey.get(`${providerId}:${modelId}`);
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
        if (modelExists(input.sessionOverride.providerId, input.sessionOverride.modelId)) {
            resolvedRunTarget = {
                providerId: input.sessionOverride.providerId,
                modelId: input.sessionOverride.modelId,
            };
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
                modelId: run.modelId,
            };
            break;
        }
    }

    if (
        !resolvedRunTarget &&
        input.defaults &&
        isProviderId(input.defaults.providerId) &&
        canAutoResolve(getOption(input.defaults.providerId, input.defaults.modelId))
    ) {
        resolvedRunTarget = {
            providerId: input.defaults.providerId,
            modelId: input.defaults.modelId,
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

    const selectedProviderIdForComposer = input.sessionOverride?.providerId ?? resolvedRunTarget?.providerId;
    const selectedModelIdForComposer = input.sessionOverride?.modelId ?? resolvedRunTarget?.modelId;
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

import {
    isProviderId,
    isProviderRunnable,
    modelExists,
    resolveLatestRunTarget,
    type RunTargetSelection,
} from '@/web/components/conversation/shell/workspace/helpers';

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
}

export function useConversationRunTarget(input: UseConversationRunTargetInput) {
    const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));

    const modelsByProvider = new Map<RuntimeProviderId, ProviderModelRecord[]>();
    for (const model of input.providerModels) {
        const existing = modelsByProvider.get(model.providerId) ?? [];
        existing.push(model);
        modelsByProvider.set(model.providerId, existing);
    }

    let resolvedRunTarget: RunTargetSelection | undefined;
    if (input.sessionOverride?.providerId && input.sessionOverride.modelId) {
        if (modelExists(modelsByProvider, input.sessionOverride.providerId, input.sessionOverride.modelId)) {
            resolvedRunTarget = {
                providerId: input.sessionOverride.providerId,
                modelId: input.sessionOverride.modelId,
            };
        }
    }

    if (!resolvedRunTarget) {
        const fromLatestRun = resolveLatestRunTarget(input.runs, modelsByProvider);
        if (fromLatestRun) {
            resolvedRunTarget = fromLatestRun;
        }
    }

    if (
        !resolvedRunTarget &&
        input.defaults &&
        isProviderId(input.defaults.providerId) &&
        modelExists(modelsByProvider, input.defaults.providerId, input.defaults.modelId)
    ) {
        resolvedRunTarget = {
            providerId: input.defaults.providerId,
            modelId: input.defaults.modelId,
        };
    }

    if (!resolvedRunTarget) {
        for (const provider of input.providers) {
            const models = modelsByProvider.get(provider.id) ?? [];
            if (models.length === 0) {
                continue;
            }

            if (isProviderRunnable(provider.authState, provider.authMethod)) {
                const firstModel = models[0];
                if (!firstModel) {
                    continue;
                }
                resolvedRunTarget = {
                    providerId: provider.id,
                    modelId: firstModel.id,
                };
                break;
            }
        }
    }

    if (!resolvedRunTarget) {
        for (const provider of input.providers) {
            const models = modelsByProvider.get(provider.id) ?? [];
            if (models.length === 0) {
                continue;
            }

            const firstModel = models[0];
            if (!firstModel) {
                continue;
            }
            resolvedRunTarget = {
                providerId: provider.id,
                modelId: firstModel.id,
            };
            break;
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

    const modelOptions = input.providers.flatMap((provider) => {
        const providerModels = modelsByProvider.get(provider.id) ?? [];
        if (providerModels.length === 0) {
            return [];
        }

        if (provider.id !== 'kilo' && !isProviderRunnable(provider.authState, provider.authMethod)) {
            return [];
        }

        return providerModels.map((model) => ({
            id: model.id,
            label: model.label,
            providerId: provider.id,
            providerLabel: provider.label,
            ...(model.sourceProvider ? { sourceProvider: model.sourceProvider } : {}),
            ...(model.source ? { source: model.source } : {}),
            ...(model.promptFamily ? { promptFamily: model.promptFamily } : {}),
            ...(model.price !== undefined ? { price: model.price } : {}),
            ...(model.latency !== undefined ? { latency: model.latency } : {}),
            ...(model.tps !== undefined ? { tps: model.tps } : {}),
        }));
    });

    return {
        providerById,
        modelsByProvider,
        resolvedRunTarget,
        selectedProviderIdForComposer,
        selectedModelIdForComposer,
        selectedModelForComposer,
        modelOptions,
    };
}


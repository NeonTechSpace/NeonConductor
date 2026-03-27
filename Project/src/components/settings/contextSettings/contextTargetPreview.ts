import type { ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';
import type { ProviderControlSnapshot } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId } from '@/shared/contracts';

export interface ContextPreviewTarget {
    providerId: RuntimeProviderId;
    modelId: string;
    defaultProvider: ProviderRecord;
    defaultModel: ProviderModelRecord;
    previewQueryInput: {
        profileId: string;
        providerId: RuntimeProviderId;
        modelId: string;
    };
}

export function resolveContextPreviewTarget(
    input: {
        profileId: string;
        providerControl: ProviderControlSnapshot | undefined;
    }
): ContextPreviewTarget | undefined {
    const defaultProviderId = input.providerControl?.defaults.providerId;
    const defaultModelId = input.providerControl?.defaults.modelId;

    if (!defaultProviderId || !defaultModelId) {
        return undefined;
    }

    const defaultProviderEntry = input.providerControl?.entries.find(
        (entry) => entry.provider.id === defaultProviderId
    );
    if (!defaultProviderEntry) {
        return undefined;
    }

    const defaultModel = defaultProviderEntry.models.find((model) => model.id === defaultModelId);
    if (!defaultModel) {
        return undefined;
    }

    return {
        providerId: defaultProviderEntry.provider.id,
        modelId: defaultModel.id,
        defaultProvider: defaultProviderEntry.provider,
        defaultModel,
        previewQueryInput: {
            profileId: input.profileId,
            providerId: defaultProviderEntry.provider.id,
            modelId: defaultModel.id,
        },
    };
}

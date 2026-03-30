import { providerCatalogStore } from '@/app/backend/persistence/stores';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';

import type { ProviderNativeCompatibilityContext } from '@/app/backend/providers/adapters/providerNative.types';

export async function resolveProviderNativeCompatibilityContext(
    providerId: FirstPartyProviderId,
    modelId: string,
    profileId: string
): Promise<ProviderNativeCompatibilityContext | null> {
    const [runtimePathContextResult, modelRecord] = await Promise.all([
        resolveProviderRuntimePathContext(profileId, providerId),
        providerCatalogStore.getModel(profileId, providerId, modelId),
    ]);
    if (runtimePathContextResult.isErr() || !modelRecord) {
        return null;
    }
    if (modelRecord.runtime.toolProtocol !== 'provider_native') {
        return null;
    }

    return {
        providerId,
        modelId,
        optionProfileId: runtimePathContextResult.value.optionProfileId,
        resolvedBaseUrl: runtimePathContextResult.value.resolvedBaseUrl,
        ...(modelRecord.sourceProvider ? { sourceProvider: modelRecord.sourceProvider } : {}),
        ...(modelRecord.runtime.apiFamily ? { apiFamily: modelRecord.runtime.apiFamily } : {}),
        providerNativeId: modelRecord.runtime.providerNativeId,
    };
}

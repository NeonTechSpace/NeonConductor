import { providerAuthStore, providerCatalogStore, providerStore } from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

import { defaultAuthState, ensureSupportedProvider } from './helpers';

import type { ProviderListItem } from './types';

export async function listProviders(profileId: string): Promise<ProviderListItem[]> {
    const [providers, defaults, authStates] = await Promise.all([
        providerStore.listProviders(),
        providerStore.getDefaults(profileId),
        providerAuthStore.listByProfile(profileId),
    ]);

    const authStateByProvider = new Map(authStates.map((state) => [state.providerId, state]));
    return providers.map((provider) => {
        const authState = authStateByProvider.get(provider.id) ?? defaultAuthState(profileId, provider.id);
        return {
            ...provider,
            isDefault: defaults.providerId === provider.id,
            authMethod: authState.authMethod,
            authState: authState.authState,
        };
    });
}

export async function listModels(profileId: string, providerId: RuntimeProviderId): Promise<ProviderModelRecord[]> {
    await ensureSupportedProvider(providerId);
    return providerStore.listModels(profileId, providerId);
}

export async function listModelsByProfile(profileId: string): Promise<ProviderModelRecord[]> {
    return providerStore.listModelsByProfile(profileId);
}

export async function getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
    return providerStore.getDefaults(profileId);
}

export async function setDefault(
    profileId: string,
    providerId: RuntimeProviderId,
    modelId: string
): Promise<{
    success: boolean;
    reason: 'provider_not_found' | 'model_not_found' | null;
    defaultProviderId: string;
    defaultModelId: string;
}> {
    try {
        await ensureSupportedProvider(providerId);
    } catch {
        const defaults = await providerStore.getDefaults(profileId);
        return {
            success: false,
            reason: 'provider_not_found',
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }

    const hasModel = await providerStore.modelExists(profileId, providerId, modelId);
    if (!hasModel) {
        const defaults = await providerStore.getDefaults(profileId);
        return {
            success: false,
            reason: 'model_not_found',
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }

    await providerStore.setDefaults(profileId, providerId, modelId);
    const defaults = await providerStore.getDefaults(profileId);
    return {
        success: true,
        reason: null,
        defaultProviderId: defaults.providerId,
        defaultModelId: defaults.modelId,
    };
}

export async function listAuthStates(profileId: string): Promise<ProviderAuthStateRecord[]> {
    return providerAuthStore.listByProfile(profileId);
}

export async function listDiscoverySnapshots(profileId: string) {
    return providerCatalogStore.listDiscoverySnapshotsByProfile(profileId);
}

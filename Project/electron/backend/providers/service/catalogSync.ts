import { providerCatalogStore } from '@/app/backend/persistence/stores';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

import { ensureSupportedProvider, resolveSecret } from './helpers';

import type { ProviderSyncResult } from './types';

export async function syncCatalog(
    profileId: string,
    providerId: RuntimeProviderId,
    force = false
): Promise<ProviderSyncResult> {
    await ensureSupportedProvider(providerId);

    const adapter = getProviderAdapter(providerId);
    const authState = await providerAuthExecutionService.getAuthState(profileId, providerId);
    const [apiKey, accessToken] = await Promise.all([
        resolveSecret(profileId, providerId, 'api_key'),
        resolveSecret(profileId, providerId, 'access_token'),
    ]);

    const syncResult = await adapter.syncCatalog({
        profileId,
        authMethod: authState.authMethod,
        ...(apiKey ? { apiKey } : {}),
        ...(accessToken ? { accessToken } : {}),
        ...(authState.organizationId ? { organizationId: authState.organizationId } : {}),
        ...(force ? { force } : {}),
    });

    if (!syncResult.ok) {
        await providerCatalogStore.upsertDiscoverySnapshot({
            profileId,
            providerId,
            kind: 'models',
            payload: { reason: syncResult.reason, detail: syncResult.detail ?? null },
            status: 'error',
        });

        return {
            ok: false,
            status: 'error',
            providerId,
            reason: syncResult.reason,
            ...(syncResult.detail ? { detail: syncResult.detail } : {}),
            modelCount: 0,
        };
    }

    const replaceResult = await providerCatalogStore.replaceModels(
        profileId,
        providerId,
        syncResult.models.map((model) => ({
            modelId: model.modelId,
            label: model.label,
            ...(model.upstreamProvider ? { upstreamProvider: model.upstreamProvider } : {}),
            isFree: model.isFree,
            supportsTools: model.supportsTools,
            supportsReasoning: model.supportsReasoning,
            ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
            pricing: model.pricing,
            raw: model.raw,
            source: 'discovery',
        }))
    );

    await Promise.all([
        providerCatalogStore.upsertDiscoverySnapshot({
            profileId,
            providerId,
            kind: 'models',
            payload: syncResult.modelPayload,
            status: 'ok',
        }),
        providerCatalogStore.upsertDiscoverySnapshot({
            profileId,
            providerId,
            kind: 'providers',
            payload: syncResult.providerPayload,
            status: 'ok',
        }),
    ]);

    return {
        ok: true,
        status: replaceResult.changed ? 'synced' : 'unchanged',
        providerId,
        modelCount: replaceResult.modelCount,
    };
}

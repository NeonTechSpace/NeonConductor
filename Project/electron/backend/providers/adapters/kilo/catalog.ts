import {
    buildProviderIdSet,
    buildModelsByProviderIndex,
    normalizeKiloModel,
} from '@/app/backend/providers/adapters/kilo/modelNormalization';
import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';
import type { ProviderCatalogSyncResult } from '@/app/backend/providers/types';

interface SyncKiloCatalogInput {
    profileId: string;
    authMethod: 'none' | 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';
    apiKey?: string;
    accessToken?: string;
    organizationId?: string;
    force?: boolean;
}

export async function syncKiloCatalog(input: SyncKiloCatalogInput): Promise<ProviderCatalogSyncResult> {
    const accessToken = input.apiKey ?? input.accessToken;
    if (!accessToken) {
        return {
            ok: false,
            status: 'error',
            providerId: 'kilo',
            reason: 'auth_required',
            detail: 'Kilo sync requires an access token.',
        };
    }

    try {
        const requestHeaders = {
            accessToken,
            ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        };

        const [modelsResult, providersResult, modelsByProviderResult] = await Promise.all([
            kiloGatewayClient.getModels(requestHeaders),
            kiloGatewayClient.getProviders(requestHeaders),
            kiloGatewayClient.getModelsByProvider(requestHeaders),
        ]);
        if (modelsResult.isErr()) {
            return {
                ok: false,
                status: 'error',
                providerId: 'kilo',
                reason: 'sync_failed',
                detail: modelsResult.error.message,
            };
        }
        if (providersResult.isErr()) {
            return {
                ok: false,
                status: 'error',
                providerId: 'kilo',
                reason: 'sync_failed',
                detail: providersResult.error.message,
            };
        }
        const models = modelsResult.value;
        const providers = providersResult.value;
        const modelsByProvider = modelsByProviderResult.isOk() ? modelsByProviderResult.value : [];

        const providerIds = buildProviderIdSet(providers);
        const modelsByProviderIndex = buildModelsByProviderIndex(modelsByProvider);
        const normalizedModels = models.map((model) => {
            const entry = normalizeKiloModel(model, {
                providerIds,
                modelsByProviderIndex,
            });
            if (entry.upstreamProvider && modelsByProviderIndex.has(entry.upstreamProvider)) {
                const hasMembership = modelsByProviderIndex.get(entry.upstreamProvider)?.has(entry.modelId) ?? false;
                return {
                    ...entry,
                    raw: {
                        ...entry.raw,
                        modelsByProviderMembership: hasMembership,
                    },
                };
            }

            return entry;
        });

        return {
            ok: true,
            status: 'synced',
            providerId: 'kilo',
            models: normalizedModels,
            providerPayload: {
                providers,
                modelsByProvider,
            },
            modelPayload: {
                models,
            },
        };
    } catch (error) {
        return {
            ok: false,
            status: 'error',
            providerId: 'kilo',
            reason: 'sync_failed',
            detail: error instanceof Error ? error.message : String(error),
        };
    }
}

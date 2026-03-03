import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';
import type { ProviderAdapter, ProviderCatalogModel, ProviderCatalogSyncResult } from '@/app/backend/providers/types';

function buildModelsByProviderIndex(
    payload: Array<{ providerId: string; modelIds: string[] }>
): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();
    for (const entry of payload) {
        index.set(entry.providerId, new Set(entry.modelIds));
    }

    return index;
}

function normalizeKiloModel(input: {
    id: string;
    name: string;
    upstreamProvider?: string;
    contextLength?: number;
    supportedParameters: string[];
    pricing: Record<string, unknown>;
    raw: Record<string, unknown>;
}): ProviderCatalogModel {
    const supportsTools = input.supportedParameters.includes('tools');
    const supportsReasoning = input.supportedParameters.includes('reasoning');

    return {
        modelId: input.id,
        label: input.name,
        ...(input.upstreamProvider ? { upstreamProvider: input.upstreamProvider } : {}),
        isFree: input.id.endsWith(':free'),
        supportsTools,
        supportsReasoning,
        ...(input.contextLength !== undefined ? { contextLength: input.contextLength } : {}),
        pricing: input.pricing,
        raw: input.raw,
    };
}

export class KiloProviderAdapter implements ProviderAdapter {
    readonly id = 'kilo' as const;

    async syncCatalog(input: {
        profileId: string;
        authMethod: 'none' | 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';
        apiKey?: string;
        accessToken?: string;
        organizationId?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult> {
        const accessToken = input.apiKey ?? input.accessToken;

        if (!accessToken) {
            return {
                ok: false,
                status: 'error',
                providerId: this.id,
                reason: 'auth_required',
                detail: 'Kilo sync requires an access token.',
            };
        }

        try {
            const requestHeaders = {
                accessToken,
                ...(input.organizationId ? { organizationId: input.organizationId } : {}),
            };

            const [models, providers, modelsByProvider] = await Promise.all([
                kiloGatewayClient.getModels(requestHeaders),
                kiloGatewayClient.getProviders(requestHeaders),
                kiloGatewayClient.getModelsByProvider(requestHeaders).catch(() => []),
            ]);

            const modelsByProviderIndex = buildModelsByProviderIndex(modelsByProvider);
            const normalizedModels = models.map((model) => {
                const entry = normalizeKiloModel(model);
                if (entry.upstreamProvider && modelsByProviderIndex.has(entry.upstreamProvider)) {
                    const hasMembership =
                        modelsByProviderIndex.get(entry.upstreamProvider)?.has(entry.modelId) ?? false;
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
                providerId: this.id,
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
                providerId: this.id,
                reason: 'sync_failed',
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

export const kiloProviderAdapter = new KiloProviderAdapter();

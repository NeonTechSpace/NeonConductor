import { fetchKiloModels } from '@/app/backend/providers/kilo-vendor/models';
import { fetchKiloProviders } from '@/app/backend/providers/kilo-vendor/providers';
import type { ProviderAdapter, ProviderCatalogSyncResult } from '@/app/backend/providers/types';

export class KiloProviderAdapter implements ProviderAdapter {
    readonly id = 'kilo' as const;

    async syncCatalog(input: {
        profileId: string;
        apiKey?: string;
        organizationId?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult> {
        try {
            const authOptions = {
                ...(input.apiKey ? { apiKey: input.apiKey } : {}),
                ...(input.organizationId ? { organizationId: input.organizationId } : {}),
            };
            const [{ models, rawPayload: modelPayload }, { providers, rawPayload: providerPayload }] =
                await Promise.all([fetchKiloModels(authOptions), fetchKiloProviders(authOptions)]);

            return {
                ok: true,
                providerId: this.id,
                models: models.map((model) => ({
                    modelId: model.id,
                    label: model.name,
                    ...(model.upstreamProvider ? { upstreamProvider: model.upstreamProvider } : {}),
                    isFree: model.isFree,
                    supportsTools: model.supportsTools,
                    supportsReasoning: model.supportsReasoning,
                    ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
                    pricing: model.pricing,
                    raw: model.raw,
                })),
                providerPayload: {
                    providers,
                    raw: providerPayload,
                },
                modelPayload,
            };
        } catch (error) {
            return {
                ok: false,
                providerId: this.id,
                reason: 'sync_failed',
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

export const kiloProviderAdapter = new KiloProviderAdapter();

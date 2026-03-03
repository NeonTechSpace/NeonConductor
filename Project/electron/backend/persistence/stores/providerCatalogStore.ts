import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';
import type { ProviderDiscoverySnapshotRecord, ProviderModelRecord } from '@/app/backend/persistence/types';

export interface ProviderCatalogModelUpsert {
    modelId: string;
    label: string;
    upstreamProvider?: string;
    isFree?: boolean;
    supportsTools?: boolean;
    supportsReasoning?: boolean;
    contextLength?: number;
    pricing?: Record<string, unknown>;
    raw?: Record<string, unknown>;
    source: string;
}

function mapModel(row: { model_id: string; provider_id: string; label: string }): ProviderModelRecord {
    return {
        id: row.model_id,
        providerId: row.provider_id,
        label: row.label,
    };
}

function mapDiscovery(row: {
    profile_id: string;
    provider_id: string;
    kind: string;
    status: string;
    etag: string | null;
    payload_json: string;
    fetched_at: string;
}): ProviderDiscoverySnapshotRecord {
    return {
        profileId: row.profile_id,
        providerId: row.provider_id,
        kind: row.kind === 'providers' ? 'providers' : 'models',
        status: row.status === 'error' ? 'error' : 'ok',
        ...(row.etag ? { etag: row.etag } : {}),
        payload: parseJsonValue(row.payload_json, {}),
        fetchedAt: row.fetched_at,
    };
}

export class ProviderCatalogStore {
    async listModels(profileId: string, providerId: string): Promise<ProviderModelRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('provider_model_catalog')
            .select(['model_id', 'provider_id', 'label'])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapModel);
    }

    async listByProfile(profileId: string): Promise<ProviderModelRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('provider_model_catalog')
            .select(['model_id', 'provider_id', 'label'])
            .where('profile_id', '=', profileId)
            .orderBy('provider_id', 'asc')
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapModel);
    }

    async modelExists(profileId: string, providerId: string, modelId: string): Promise<boolean> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('provider_model_catalog')
            .select('model_id')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('model_id', '=', modelId)
            .executeTakeFirst();

        return Boolean(row);
    }

    async replaceModels(profileId: string, providerId: string, models: ProviderCatalogModelUpsert[]): Promise<number> {
        const { db } = getPersistence();
        const updatedAt = nowIso();

        await db
            .deleteFrom('provider_model_catalog')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .execute();

        if (models.length === 0) {
            return 0;
        }

        await db
            .insertInto('provider_model_catalog')
            .values(
                models.map((model) => ({
                    profile_id: profileId,
                    provider_id: providerId,
                    model_id: model.modelId,
                    label: model.label,
                    upstream_provider: model.upstreamProvider ?? null,
                    is_free: model.isFree ? 1 : 0,
                    supports_tools: model.supportsTools ? 1 : 0,
                    supports_reasoning: model.supportsReasoning ? 1 : 0,
                    context_length: model.contextLength ?? null,
                    pricing_json: JSON.stringify(model.pricing ?? {}),
                    raw_json: JSON.stringify(model.raw ?? {}),
                    source: model.source,
                    updated_at: updatedAt,
                }))
            )
            .execute();

        return models.length;
    }

    async upsertDiscoverySnapshot(input: {
        profileId: string;
        providerId: string;
        kind: 'models' | 'providers';
        payload: Record<string, unknown>;
        status: 'ok' | 'error';
        etag?: string;
    }): Promise<void> {
        const { db } = getPersistence();
        const fetchedAt = nowIso();

        await db
            .insertInto('provider_discovery_snapshots')
            .values({
                profile_id: input.profileId,
                provider_id: input.providerId,
                kind: input.kind,
                etag: input.etag ?? null,
                payload_json: JSON.stringify(input.payload),
                fetched_at: fetchedAt,
                status: input.status,
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'provider_id', 'kind']).doUpdateSet({
                    etag: input.etag ?? null,
                    payload_json: JSON.stringify(input.payload),
                    fetched_at: fetchedAt,
                    status: input.status,
                })
            )
            .execute();
    }

    async listDiscoverySnapshotsByProfile(profileId: string): Promise<ProviderDiscoverySnapshotRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('provider_discovery_snapshots')
            .select(['profile_id', 'provider_id', 'kind', 'status', 'etag', 'payload_json', 'fetched_at'])
            .where('profile_id', '=', profileId)
            .orderBy('provider_id', 'asc')
            .orderBy('kind', 'asc')
            .execute();

        return rows.map(mapDiscovery);
    }
}

export const providerCatalogStore = new ProviderCatalogStore();

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';
import type { ProviderDiscoverySnapshotRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

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

interface ComparableCatalogModel {
    modelId: string;
    label: string;
    upstreamProvider: string | null;
    isFree: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
    contextLength: number | null;
    pricing: Record<string, unknown>;
    raw: Record<string, unknown>;
    source: string;
}

export interface ReplaceCatalogModelsResult {
    modelCount: number;
    changed: boolean;
}

function mapModel(row: { model_id: string; provider_id: string; label: string }): ProviderModelRecord {
    return {
        id: row.model_id,
        providerId: row.provider_id as RuntimeProviderId,
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
        providerId: row.provider_id as RuntimeProviderId,
        kind: row.kind === 'providers' ? 'providers' : 'models',
        status: row.status === 'error' ? 'error' : 'ok',
        ...(row.etag ? { etag: row.etag } : {}),
        payload: parseJsonValue(row.payload_json, {}),
        fetchedAt: row.fetched_at,
    };
}

function normalizeComparableModel(model: ProviderCatalogModelUpsert): ComparableCatalogModel {
    return {
        modelId: model.modelId,
        label: model.label,
        upstreamProvider: model.upstreamProvider ?? null,
        isFree: model.isFree ?? false,
        supportsTools: model.supportsTools ?? false,
        supportsReasoning: model.supportsReasoning ?? false,
        contextLength: model.contextLength ?? null,
        pricing: model.pricing ?? {},
        raw: model.raw ?? {},
        source: model.source,
    };
}

function normalizeRecordKeys(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function serializeComparableModels(models: ComparableCatalogModel[]): string {
    return JSON.stringify(
        models
            .slice()
            .sort((left, right) => left.modelId.localeCompare(right.modelId))
            .map((model) => ({
                ...model,
                pricing: normalizeRecordKeys(model.pricing),
                raw: normalizeRecordKeys(model.raw),
            }))
    );
}

export class ProviderCatalogStore {
    async listModels(profileId: string, providerId: RuntimeProviderId): Promise<ProviderModelRecord[]> {
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

    async modelExists(profileId: string, providerId: RuntimeProviderId, modelId: string): Promise<boolean> {
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

    async replaceModels(
        profileId: string,
        providerId: RuntimeProviderId,
        models: ProviderCatalogModelUpsert[]
    ): Promise<ReplaceCatalogModelsResult> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        const normalizedModels = models.map(normalizeComparableModel);

        const existingRows = await db
            .selectFrom('provider_model_catalog')
            .select([
                'model_id',
                'label',
                'upstream_provider',
                'is_free',
                'supports_tools',
                'supports_reasoning',
                'context_length',
                'pricing_json',
                'raw_json',
                'source',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .execute();

        const existingSerialized = serializeComparableModels(
            existingRows.map((row) => ({
                modelId: row.model_id,
                label: row.label,
                upstreamProvider: row.upstream_provider,
                isFree: row.is_free === 1,
                supportsTools: row.supports_tools === 1,
                supportsReasoning: row.supports_reasoning === 1,
                contextLength: row.context_length,
                pricing: parseJsonValue(row.pricing_json, {}),
                raw: parseJsonValue(row.raw_json, {}),
                source: row.source,
            }))
        );
        const nextSerialized = serializeComparableModels(normalizedModels);

        if (existingSerialized === nextSerialized) {
            return {
                modelCount: normalizedModels.length,
                changed: false,
            };
        }

        await db
            .deleteFrom('provider_model_catalog')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .execute();

        if (normalizedModels.length === 0) {
            return {
                modelCount: 0,
                changed: true,
            };
        }

        await db
            .insertInto('provider_model_catalog')
            .values(
                normalizedModels.map((model) => ({
                    profile_id: profileId,
                    provider_id: providerId,
                    model_id: model.modelId,
                    label: model.label,
                    upstream_provider: model.upstreamProvider,
                    is_free: model.isFree ? 1 : 0,
                    supports_tools: model.supportsTools ? 1 : 0,
                    supports_reasoning: model.supportsReasoning ? 1 : 0,
                    context_length: model.contextLength,
                    pricing_json: JSON.stringify(model.pricing),
                    raw_json: JSON.stringify(model.raw),
                    source: model.source,
                    updated_at: updatedAt,
                }))
            )
            .execute();

        return {
            modelCount: normalizedModels.length,
            changed: true,
        };
    }

    async upsertDiscoverySnapshot(input: {
        profileId: string;
        providerId: RuntimeProviderId;
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

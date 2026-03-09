import { getPersistence } from '@/app/backend/persistence/db';
import {
    mapComparableModelFromExistingRow,
    mapProviderCatalogModel,
    mapProviderDiscoverySnapshot,
    normalizeComparableModel,
    type ProviderCatalogModelUpsert,
    serializeComparableModels,
} from '@/app/backend/persistence/stores/provider/providerCatalogMapper';
import { parseModalities } from '@/app/backend/persistence/stores/provider/providerCatalogParsers';
import { sortProviderModels } from '@/app/backend/persistence/stores/provider/providerCatalogRanking';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ProviderDiscoverySnapshotRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderModelCapabilities } from '@/app/backend/providers/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export type { ProviderCatalogModelUpsert };

export interface ReplaceCatalogModelsResult {
    modelCount: number;
    changed: boolean;
}

export class ProviderCatalogStore {
    async listModels(profileId: string, providerId: RuntimeProviderId): Promise<ProviderModelRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('provider_model_catalog')
            .select([
                'model_id',
                'provider_id',
                'label',
                'upstream_provider',
                'supports_tools',
                'supports_reasoning',
                'supports_vision',
                'supports_audio_input',
                'supports_audio_output',
                'pricing_json',
                'raw_json',
                'input_modalities_json',
                'output_modalities_json',
                'prompt_family',
                'context_length',
                'source',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .execute();

        return sortProviderModels(providerId, rows.map(mapProviderCatalogModel));
    }

    async listByProfile(profileId: string): Promise<ProviderModelRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('provider_model_catalog')
            .select([
                'model_id',
                'provider_id',
                'label',
                'upstream_provider',
                'supports_tools',
                'supports_reasoning',
                'supports_vision',
                'supports_audio_input',
                'supports_audio_output',
                'pricing_json',
                'raw_json',
                'input_modalities_json',
                'output_modalities_json',
                'prompt_family',
                'context_length',
                'source',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .execute();

        const byProvider = new Map<RuntimeProviderId, ProviderModelRecord[]>();
        for (const row of rows) {
            const mapped = mapProviderCatalogModel(row);
            const existing = byProvider.get(mapped.providerId) ?? [];
            existing.push(mapped);
            byProvider.set(mapped.providerId, existing);
        }

        const sortedProviderIds = Array.from(byProvider.keys()).sort((left, right) => left.localeCompare(right));
        const ordered: ProviderModelRecord[] = [];
        for (const providerId of sortedProviderIds) {
            const providerModels = byProvider.get(providerId) ?? [];
            ordered.push(...sortProviderModels(providerId, providerModels));
        }

        return ordered;
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

    async getModel(
        profileId: string,
        providerId: RuntimeProviderId,
        modelId: string
    ): Promise<ProviderModelRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('provider_model_catalog')
            .select([
                'model_id',
                'provider_id',
                'label',
                'upstream_provider',
                'supports_tools',
                'supports_reasoning',
                'supports_vision',
                'supports_audio_input',
                'supports_audio_output',
                'pricing_json',
                'raw_json',
                'input_modalities_json',
                'output_modalities_json',
                'prompt_family',
                'context_length',
                'source',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('model_id', '=', modelId)
            .executeTakeFirst();

        return row ? mapProviderCatalogModel(row) : null;
    }

    async getModelCapabilities(
        profileId: string,
        providerId: RuntimeProviderId,
        modelId: string
    ): Promise<ProviderModelCapabilities | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('provider_model_catalog')
            .select([
                'supports_tools',
                'supports_reasoning',
                'supports_vision',
                'supports_audio_input',
                'supports_audio_output',
                'input_modalities_json',
                'output_modalities_json',
                'prompt_family',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('model_id', '=', modelId)
            .executeTakeFirst();

        if (!row) {
            return null;
        }

        const inputModalities = parseModalities(row.input_modalities_json);
        const outputModalities = parseModalities(row.output_modalities_json);

        return {
            supportsTools: row.supports_tools === 1,
            supportsReasoning: row.supports_reasoning === 1,
            supportsVision:
                row.supports_vision === null ? inputModalities.includes('image') : row.supports_vision === 1,
            supportsAudioInput:
                row.supports_audio_input === null ? inputModalities.includes('audio') : row.supports_audio_input === 1,
            supportsAudioOutput:
                row.supports_audio_output === null
                    ? outputModalities.includes('audio')
                    : row.supports_audio_output === 1,
            inputModalities,
            outputModalities,
            ...(row.prompt_family ? { promptFamily: row.prompt_family } : {}),
        };
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
                'supports_vision',
                'supports_audio_input',
                'supports_audio_output',
                'input_modalities_json',
                'output_modalities_json',
                'prompt_family',
                'context_length',
                'pricing_json',
                'raw_json',
                'source',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .execute();

        const existingSerialized = serializeComparableModels(existingRows.map(mapComparableModelFromExistingRow));
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
                    supports_vision: model.supportsVision ? 1 : 0,
                    supports_audio_input: model.supportsAudioInput ? 1 : 0,
                    supports_audio_output: model.supportsAudioOutput ? 1 : 0,
                    input_modalities_json: JSON.stringify(model.inputModalities),
                    output_modalities_json: JSON.stringify(model.outputModalities),
                    prompt_family: model.promptFamily,
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

        return rows.map(mapProviderDiscoverySnapshot);
    }
}

export const providerCatalogStore = new ProviderCatalogStore();

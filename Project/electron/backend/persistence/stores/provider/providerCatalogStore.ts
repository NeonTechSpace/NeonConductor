import { getPersistence } from '@/app/backend/persistence/db';
import {
    mapComparableModelFromExistingRow,
    mapProviderCatalogModel,
    mapProviderDiscoverySnapshot,
    normalizeComparableModel,
    type ProviderCatalogModelUpsert,
    serializeComparableModels,
} from '@/app/backend/persistence/stores/provider/providerCatalogMapper';
import { sortProviderModels } from '@/app/backend/persistence/stores/provider/providerCatalogRanking';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ProviderDiscoverySnapshotRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderModelCapabilities } from '@/app/backend/providers/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export type { ProviderCatalogModelUpsert };

export interface InvalidProviderModelDiagnostic {
    providerId: RuntimeProviderId;
    modelId: string;
    label: string;
    source: string;
    updatedAt: string;
    reason: 'invalid_runtime_descriptor';
    detail: string;
    toolProtocol?: string;
    apiFamily?: string;
}

export type PersistedProviderModelReadState =
    | {
          kind: 'valid';
          model: ProviderModelRecord;
      }
    | {
          kind: 'invalid';
          diagnostic: InvalidProviderModelDiagnostic;
      };

export interface ReplaceCatalogModelsResult {
    modelCount: number;
    changed: boolean;
}

export class ProviderCatalogStore {
    private mapPersistedModelRow(row: {
        model_id: string;
        provider_id: string;
        label: string;
        upstream_provider: string | null;
        supports_tools: 0 | 1;
        supports_reasoning: 0 | 1;
        supports_vision: 0 | 1 | null;
        supports_audio_input: 0 | 1 | null;
        supports_audio_output: 0 | 1 | null;
        supports_prompt_cache: 0 | 1 | null;
        tool_protocol: string | null;
        api_family: string | null;
        routed_api_family: string | null;
        pricing_json: string;
        raw_json: string;
        provider_settings_json: string | null;
        input_modalities_json: string | null;
        output_modalities_json: string | null;
        prompt_family: string | null;
        context_length: number | null;
        source: string;
        updated_at: string;
    }): PersistedProviderModelReadState {
        try {
            return {
                kind: 'valid',
                model: mapProviderCatalogModel(row),
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('is missing a valid runtime descriptor')) {
                return {
                    kind: 'invalid',
                    diagnostic: {
                        providerId: row.provider_id as RuntimeProviderId,
                        modelId: row.model_id,
                        label: row.label,
                        source: row.source,
                        updatedAt: row.updated_at,
                        reason: 'invalid_runtime_descriptor',
                        detail: error.message,
                        ...(row.tool_protocol ? { toolProtocol: row.tool_protocol } : {}),
                        ...(row.api_family ? { apiFamily: row.api_family } : {}),
                    },
                };
            }

            throw error;
        }
    }

    private async readProviderModels(
        profileId: string,
        providerId?: RuntimeProviderId
    ): Promise<PersistedProviderModelReadState[]> {
        const { db } = getPersistence();

        let query = db
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
                'supports_prompt_cache',
                'tool_protocol',
                'api_family',
                'routed_api_family',
                'pricing_json',
                'raw_json',
                'provider_settings_json',
                'input_modalities_json',
                'output_modalities_json',
                'prompt_family',
                'context_length',
                'source',
                'updated_at',
            ])
            .where('profile_id', '=', profileId);

        if (providerId) {
            query = query.where('provider_id', '=', providerId);
        }

        const rows = await query.execute();
        return rows.map((row) => this.mapPersistedModelRow(row));
    }

    async listModels(profileId: string, providerId: RuntimeProviderId): Promise<ProviderModelRecord[]> {
        const states = await this.readProviderModels(profileId, providerId);
        return sortProviderModels(
            providerId,
            states.flatMap((state) => (state.kind === 'valid' ? [state.model] : []))
        );
    }

    async listInvalidModelDiagnostics(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<InvalidProviderModelDiagnostic[]> {
        const states = await this.readProviderModels(profileId, providerId);
        return states.flatMap((state) => (state.kind === 'invalid' ? [state.diagnostic] : []));
    }

    async listByProfile(profileId: string): Promise<ProviderModelRecord[]> {
        const byProvider = new Map<RuntimeProviderId, ProviderModelRecord[]>();
        const states = await this.readProviderModels(profileId);
        for (const state of states) {
            if (state.kind !== 'valid') {
                continue;
            }

            const existing = byProvider.get(state.model.providerId) ?? [];
            existing.push(state.model);
            byProvider.set(state.model.providerId, existing);
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
        const readState = await this.getModelReadState(profileId, providerId, modelId);
        return readState?.kind === 'valid' ? readState.model : null;
    }

    async getModelReadState(
        profileId: string,
        providerId: RuntimeProviderId,
        modelId: string
    ): Promise<PersistedProviderModelReadState | null> {
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
                'supports_prompt_cache',
                'tool_protocol',
                'api_family',
                'routed_api_family',
                'pricing_json',
                'raw_json',
                'provider_settings_json',
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

        return row ? this.mapPersistedModelRow(row) : null;
    }

    async getModelCapabilities(
        profileId: string,
        providerId: RuntimeProviderId,
        modelId: string
    ): Promise<ProviderModelCapabilities | null> {
        const readState = await this.getModelReadState(profileId, providerId, modelId);
        if (!readState || readState.kind !== 'valid') {
            return null;
        }

        return {
            features: readState.model.features,
            runtime: readState.model.runtime,
            ...(readState.model.promptFamily ? { promptFamily: readState.model.promptFamily } : {}),
        };
    }

    async replaceModels(
        profileId: string,
        providerId: RuntimeProviderId,
        models: ProviderCatalogModelUpsert[]
    ): Promise<ReplaceCatalogModelsResult> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        const dedupedModels = Array.from(
            models
                .reduce(
                    (accumulator, model) => accumulator.set(model.modelId, model),
                    new Map<string, ProviderCatalogModelUpsert>()
                )
                .values()
        );
        const normalizedModels = dedupedModels.map(normalizeComparableModel);

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
                'supports_prompt_cache',
                'tool_protocol',
                'api_family',
                'routed_api_family',
                'input_modalities_json',
                'output_modalities_json',
                'prompt_family',
                'context_length',
                'pricing_json',
                'raw_json',
                'provider_settings_json',
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
            .orReplace()
            .values(
                normalizedModels.map((model) => ({
                    profile_id: profileId,
                    provider_id: providerId,
                    model_id: model.modelId,
                    label: model.label,
                    upstream_provider: model.upstreamProvider,
                    is_free: model.isFree ? 1 : 0,
                    supports_tools: model.features.supportsTools ? 1 : 0,
                    supports_reasoning: model.features.supportsReasoning ? 1 : 0,
                    supports_vision: model.features.supportsVision ? 1 : 0,
                    supports_audio_input: model.features.supportsAudioInput ? 1 : 0,
                    supports_audio_output: model.features.supportsAudioOutput ? 1 : 0,
                    supports_prompt_cache:
                        model.features.supportsPromptCache === undefined
                            ? null
                            : model.features.supportsPromptCache
                              ? 1
                              : 0,
                    tool_protocol: model.runtime.toolProtocol,
                    api_family: model.runtime.apiFamily ?? null,
                    routed_api_family:
                        model.runtime.toolProtocol === 'kilo_gateway' ? model.runtime.routedApiFamily : null,
                    input_modalities_json: JSON.stringify(model.features.inputModalities),
                    output_modalities_json: JSON.stringify(model.features.outputModalities),
                    prompt_family: model.promptFamily,
                    context_length: model.contextLength,
                    pricing_json: JSON.stringify(model.pricing),
                    raw_json: JSON.stringify(model.raw),
                    provider_settings_json: JSON.stringify(
                        model.runtime.toolProtocol === 'provider_native'
                            ? {
                                  providerNativeId: model.runtime.providerNativeId,
                              }
                            : {}
                    ),
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

    async clearModels(profileId: string, providerId: RuntimeProviderId): Promise<void> {
        const { db } = getPersistence();

        await db
            .deleteFrom('provider_model_catalog')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .execute();
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

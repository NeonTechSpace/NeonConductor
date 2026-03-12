import {
    normalizeModalities,
    parseJsonObject,
    parseModalities,
    parseProviderId,
    readNestedRecord,
    readNumberFromRecord,
} from '@/app/backend/persistence/stores/provider/providerCatalogParsers';
import type { ProviderDiscoverySnapshotRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderModelModality } from '@/app/backend/providers/types';
import { runtimeReasoningEfforts } from '@/app/backend/runtime/contracts';
import type { RuntimeReasoningEffort } from '@/app/backend/runtime/contracts';

export interface ProviderCatalogModelUpsert {
    modelId: string;
    label: string;
    upstreamProvider?: string;
    isFree?: boolean;
    supportsTools?: boolean;
    supportsReasoning?: boolean;
    supportsVision?: boolean;
    supportsAudioInput?: boolean;
    supportsAudioOutput?: boolean;
    inputModalities?: ProviderModelModality[];
    outputModalities?: ProviderModelModality[];
    promptFamily?: string;
    contextLength?: number;
    pricing?: Record<string, unknown>;
    raw?: Record<string, unknown>;
    source: string;
}

export interface ComparableCatalogModel {
    modelId: string;
    label: string;
    upstreamProvider: string | null;
    isFree: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
    supportsVision: boolean;
    supportsAudioInput: boolean;
    supportsAudioOutput: boolean;
    inputModalities: ProviderModelModality[];
    outputModalities: ProviderModelModality[];
    promptFamily: string | null;
    contextLength: number | null;
    pricing: Record<string, unknown>;
    raw: Record<string, unknown>;
    source: string;
}

interface ProviderCatalogModelRow {
    model_id: string;
    provider_id: string;
    label: string;
    upstream_provider: string | null;
    supports_tools: 0 | 1;
    supports_reasoning: 0 | 1;
    supports_vision: 0 | 1 | null;
    supports_audio_input: 0 | 1 | null;
    supports_audio_output: 0 | 1 | null;
    pricing_json: string;
    raw_json: string;
    input_modalities_json: string | null;
    output_modalities_json: string | null;
    prompt_family: string | null;
    context_length: number | null;
    source: string;
    updated_at: string;
}

interface ProviderDiscoverySnapshotRow {
    profile_id: string;
    provider_id: string;
    kind: string;
    status: string;
    etag: string | null;
    payload_json: string;
    fetched_at: string;
}

interface ExistingCatalogModelRow {
    model_id: string;
    label: string;
    upstream_provider: string | null;
    is_free: 0 | 1;
    supports_tools: 0 | 1;
    supports_reasoning: 0 | 1;
    supports_vision: 0 | 1 | null;
    supports_audio_input: 0 | 1 | null;
    supports_audio_output: 0 | 1 | null;
    input_modalities_json: string | null;
    output_modalities_json: string | null;
    prompt_family: string | null;
    context_length: number | null;
    pricing_json: string;
    raw_json: string;
    source: string;
}

function extractPrice(pricing: Record<string, unknown>, raw: Record<string, unknown>): number | undefined {
    const directKeys = ['price', 'cost', 'price_usd', 'usd'];
    for (const key of directKeys) {
        const value = readNumberFromRecord(pricing, key);
        if (value !== undefined) {
            return value;
        }
    }

    const nestedPricing = readNestedRecord(raw, 'pricing');
    if (nestedPricing) {
        for (const key of directKeys) {
            const value = readNumberFromRecord(nestedPricing, key);
            if (value !== undefined) {
                return value;
            }
        }
    }

    return undefined;
}

function extractInputPrice(pricing: Record<string, unknown>): number | undefined {
    const keys = ['input', 'prompt', 'input_price', 'inputPrice'];
    for (const key of keys) {
        const value = readNumberFromRecord(pricing, key);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function extractOutputPrice(pricing: Record<string, unknown>): number | undefined {
    const keys = ['output', 'completion', 'output_price', 'outputPrice'];
    for (const key of keys) {
        const value = readNumberFromRecord(pricing, key);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function extractCacheReadPrice(pricing: Record<string, unknown>): number | undefined {
    const keys = ['cache_read', 'cacheRead', 'cache_read_input'];
    for (const key of keys) {
        const value = readNumberFromRecord(pricing, key);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function extractCacheWritePrice(pricing: Record<string, unknown>): number | undefined {
    const keys = ['cache_write', 'cacheWrite', 'cache_creation_input'];
    for (const key of keys) {
        const value = readNumberFromRecord(pricing, key);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function extractMaxOutputTokens(raw: Record<string, unknown>): number | undefined {
    const keys = ['max_output_tokens', 'maxOutputTokens', 'max_completion_tokens', 'max_tokens'];
    for (const key of keys) {
        const value = readNumberFromRecord(raw, key);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function extractLatency(raw: Record<string, unknown>): number | undefined {
    const performance = readNestedRecord(raw, 'performance');
    const keys = ['latency', 'latency_ms', 'avg_latency', 'avg_latency_ms'];
    for (const key of keys) {
        const direct = readNumberFromRecord(raw, key);
        if (direct !== undefined) {
            return direct;
        }
        if (performance) {
            const nested = readNumberFromRecord(performance, key);
            if (nested !== undefined) {
                return nested;
            }
        }
    }

    return undefined;
}

function extractTps(raw: Record<string, unknown>): number | undefined {
    const performance = readNestedRecord(raw, 'performance');
    const keys = ['tps', 'tokens_per_second', 'throughput_tps', 'avg_tps'];
    for (const key of keys) {
        const direct = readNumberFromRecord(raw, key);
        if (direct !== undefined) {
            return direct;
        }
        if (performance) {
            const nested = readNumberFromRecord(performance, key);
            if (nested !== undefined) {
                return nested;
            }
        }
    }

    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeReasoningEfforts(values: Iterable<string>): RuntimeReasoningEffort[] {
    const allowedValues = new Set<RuntimeReasoningEffort>(runtimeReasoningEfforts);
    const normalized = new Set<RuntimeReasoningEffort>();

    for (const value of values) {
        if (!allowedValues.has(value as RuntimeReasoningEffort)) {
            continue;
        }

        normalized.add(value as RuntimeReasoningEffort);
    }

    return runtimeReasoningEfforts.filter((effort) => normalized.has(effort));
}

function extractVariantReasoningEfforts(raw: Record<string, unknown>): RuntimeReasoningEffort[] {
    const opencode = isRecord(raw['opencode']) ? raw['opencode'] : undefined;
    const variants = opencode && isRecord(opencode['variants']) ? opencode['variants'] : undefined;
    if (!variants) {
        return [];
    }

    return normalizeReasoningEfforts(Object.keys(variants));
}

function deriveLegacyKiloReasoningEfforts(modelId: string): RuntimeReasoningEffort[] {
    const normalizedModelId = modelId.toLowerCase();
    if (
        normalizedModelId.includes('deepseek') ||
        normalizedModelId.includes('minimax') ||
        normalizedModelId.includes('glm') ||
        normalizedModelId.includes('mistral') ||
        normalizedModelId.includes('kimi') ||
        normalizedModelId.includes('k2p5')
    ) {
        return [];
    }

    if (normalizedModelId.includes('grok') && normalizedModelId.includes('grok-3-mini')) {
        return ['low', 'high'];
    }

    if (normalizedModelId.includes('grok')) {
        return [];
    }

    if (
        normalizedModelId.includes('gpt') ||
        normalizedModelId.includes('gemini-3') ||
        normalizedModelId.includes('claude')
    ) {
        return ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
    }

    return [];
}

function extractKiloReasoningEfforts(input: {
    providerId: string;
    modelId: string;
    supportsReasoning: boolean;
    raw: Record<string, unknown>;
}): RuntimeReasoningEffort[] | undefined {
    if (input.providerId !== 'kilo' || !input.supportsReasoning) {
        return undefined;
    }

    const variantEfforts = extractVariantReasoningEfforts(input.raw);
    if (variantEfforts.length > 0) {
        return variantEfforts;
    }

    const legacyFallbackEfforts = deriveLegacyKiloReasoningEfforts(input.modelId);
    return legacyFallbackEfforts.length > 0 ? legacyFallbackEfforts : [];
}

export function mapProviderCatalogModel(row: ProviderCatalogModelRow): ProviderModelRecord {
    const inputModalities = parseModalities(row.input_modalities_json);
    const outputModalities = parseModalities(row.output_modalities_json);
    const pricing = parseJsonObject(row.pricing_json);
    const raw = parseJsonObject(row.raw_json);
    const inputPrice = extractInputPrice(pricing);
    const outputPrice = extractOutputPrice(pricing);
    const cacheReadPrice = extractCacheReadPrice(pricing);
    const cacheWritePrice = extractCacheWritePrice(pricing);
    const maxOutputTokens = extractMaxOutputTokens(raw);
    const price = extractPrice(pricing, raw);
    const latency = extractLatency(raw);
    const tps = extractTps(raw);
    const supportsReasoning = row.supports_reasoning === 1;
    const kiloReasoningEfforts = extractKiloReasoningEfforts({
        providerId: row.provider_id,
        modelId: row.model_id,
        supportsReasoning,
        raw,
    });

    return {
        id: row.model_id,
        providerId: parseProviderId(row.provider_id, 'provider_model_catalog.provider_id'),
        label: row.label,
        ...(row.upstream_provider ? { sourceProvider: row.upstream_provider } : {}),
        source: row.source,
        updatedAt: row.updated_at,
        supportsTools: row.supports_tools === 1,
        supportsReasoning,
        supportsVision: row.supports_vision === null ? inputModalities.includes('image') : row.supports_vision === 1,
        supportsAudioInput:
            row.supports_audio_input === null ? inputModalities.includes('audio') : row.supports_audio_input === 1,
        supportsAudioOutput:
            row.supports_audio_output === null ? outputModalities.includes('audio') : row.supports_audio_output === 1,
        inputModalities,
        outputModalities,
        ...(kiloReasoningEfforts !== undefined ? { reasoningEfforts: kiloReasoningEfforts } : {}),
        ...(row.prompt_family ? { promptFamily: row.prompt_family } : {}),
        ...(row.context_length !== null ? { contextLength: row.context_length } : {}),
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
        ...(inputPrice !== undefined ? { inputPrice } : {}),
        ...(outputPrice !== undefined ? { outputPrice } : {}),
        ...(cacheReadPrice !== undefined ? { cacheReadPrice } : {}),
        ...(cacheWritePrice !== undefined ? { cacheWritePrice } : {}),
        ...(price !== undefined ? { price } : {}),
        ...(latency !== undefined ? { latency } : {}),
        ...(tps !== undefined ? { tps } : {}),
    };
}

export function mapProviderDiscoverySnapshot(row: ProviderDiscoverySnapshotRow): ProviderDiscoverySnapshotRecord {
    return {
        profileId: row.profile_id,
        providerId: parseProviderId(row.provider_id, 'provider_discovery_snapshots.provider_id'),
        kind: row.kind === 'providers' ? 'providers' : 'models',
        status: row.status === 'error' ? 'error' : 'ok',
        ...(row.etag ? { etag: row.etag } : {}),
        payload: parseJsonObject(row.payload_json),
        fetchedAt: row.fetched_at,
    };
}

export function normalizeComparableModel(model: ProviderCatalogModelUpsert): ComparableCatalogModel {
    return {
        modelId: model.modelId,
        label: model.label,
        upstreamProvider: model.upstreamProvider ?? null,
        isFree: model.isFree ?? false,
        supportsTools: model.supportsTools ?? false,
        supportsReasoning: model.supportsReasoning ?? false,
        supportsVision: model.supportsVision ?? false,
        supportsAudioInput: model.supportsAudioInput ?? false,
        supportsAudioOutput: model.supportsAudioOutput ?? false,
        inputModalities: normalizeModalities(model.inputModalities),
        outputModalities: normalizeModalities(model.outputModalities),
        promptFamily: model.promptFamily ?? null,
        contextLength: model.contextLength ?? null,
        pricing: model.pricing ?? {},
        raw: model.raw ?? {},
        source: model.source,
    };
}

function normalizeRecordKeys(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

export function serializeComparableModels(models: ComparableCatalogModel[]): string {
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

export function mapComparableModelFromExistingRow(row: ExistingCatalogModelRow): ComparableCatalogModel {
    return {
        modelId: row.model_id,
        label: row.label,
        upstreamProvider: row.upstream_provider,
        isFree: row.is_free === 1,
        supportsTools: row.supports_tools === 1,
        supportsReasoning: row.supports_reasoning === 1,
        supportsVision: row.supports_vision === null ? false : row.supports_vision === 1,
        supportsAudioInput: row.supports_audio_input === null ? false : row.supports_audio_input === 1,
        supportsAudioOutput: row.supports_audio_output === null ? false : row.supports_audio_output === 1,
        inputModalities: parseModalities(row.input_modalities_json),
        outputModalities: parseModalities(row.output_modalities_json),
        promptFamily: row.prompt_family,
        contextLength: row.context_length,
        pricing: parseJsonObject(row.pricing_json),
        raw: parseJsonObject(row.raw_json),
        source: row.source,
    };
}

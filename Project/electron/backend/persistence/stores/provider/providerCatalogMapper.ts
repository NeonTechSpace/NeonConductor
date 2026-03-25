import {
    normalizeModalities,
    parseJsonObject,
    parseModalities,
    parseProviderId,
    readNestedRecord,
    readNumberFromRecord,
} from '@/app/backend/persistence/stores/provider/providerCatalogParsers';
import type { ProviderDiscoverySnapshotRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    ProviderApiFamily,
    ProviderModelFeatureSet,
    ProviderRoutedApiFamily,
    ProviderRuntimeDescriptor,
    ProviderToolProtocol,
} from '@/app/backend/providers/types';
import { runtimeReasoningEfforts } from '@/app/backend/runtime/contracts';
import type { RuntimeReasoningEffort } from '@/app/backend/runtime/contracts';

export interface ProviderCatalogModelUpsert {
    modelId: string;
    label: string;
    upstreamProvider?: string;
    isFree?: boolean;
    features: ProviderModelFeatureSet;
    runtime: ProviderRuntimeDescriptor;
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
    features: ProviderModelFeatureSet;
    runtime: ProviderRuntimeDescriptor;
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
    supports_prompt_cache: 0 | 1 | null;
    tool_protocol: string | null;
    api_family: string | null;
    routed_api_family: string | null;
    input_modalities_json: string | null;
    output_modalities_json: string | null;
    prompt_family: string | null;
    context_length: number | null;
    pricing_json: string;
    raw_json: string;
    provider_settings_json: string | null;
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

function parseToolProtocol(value: string | null): ProviderToolProtocol | undefined {
    switch (value) {
        case 'openai_responses':
        case 'openai_chat_completions':
        case 'kilo_gateway':
        case 'provider_native':
        case 'anthropic_messages':
        case 'google_generativeai':
            return value;
        default:
            return undefined;
    }
}

function parseApiFamily(value: string | null): ProviderApiFamily | undefined {
    switch (value) {
        case 'openai_compatible':
        case 'kilo_gateway':
        case 'provider_native':
        case 'anthropic_messages':
        case 'google_generativeai':
            return value;
        default:
            return undefined;
    }
}

function parseRoutedApiFamily(value: string | null): ProviderRoutedApiFamily | undefined {
    switch (value) {
        case 'openai_compatible':
        case 'provider_native':
        case 'anthropic_messages':
        case 'google_generativeai':
            return value;
        default:
            return undefined;
    }
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

function extractKiloReasoningEfforts(input: {
    providerId: string;
    supportsReasoning: boolean;
    raw: Record<string, unknown>;
}): RuntimeReasoningEffort[] | undefined {
    if (input.providerId !== 'kilo' || !input.supportsReasoning) {
        return undefined;
    }

    const variantEfforts = extractVariantReasoningEfforts(input.raw);
    return variantEfforts.length > 0 ? variantEfforts : undefined;
}

function extractSupportsRealtimeWebSocket(raw: Record<string, unknown>): boolean | undefined {
    const direct = raw['supports_realtime_websocket'];
    if (typeof direct === 'boolean') {
        return direct;
    }

    return undefined;
}

function readProviderNativeId(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function buildRuntimeDescriptor(input: {
    toolProtocol: ProviderToolProtocol | undefined;
    apiFamily: ProviderApiFamily | undefined;
    routedApiFamily: ProviderRoutedApiFamily | undefined;
    supportsRealtimeWebSocket: boolean | undefined;
    providerNativeId: string | undefined;
}): ProviderRuntimeDescriptor | undefined {
    switch (input.toolProtocol) {
        case 'openai_responses':
            if (input.apiFamily !== 'openai_compatible') {
                return undefined;
            }
            return {
                toolProtocol: 'openai_responses',
                apiFamily: 'openai_compatible',
                ...(input.supportsRealtimeWebSocket !== undefined
                    ? { supportsRealtimeWebSocket: input.supportsRealtimeWebSocket }
                    : {}),
            };
        case 'openai_chat_completions':
            if (input.apiFamily !== 'openai_compatible') {
                return undefined;
            }
            return {
                toolProtocol: 'openai_chat_completions',
                apiFamily: 'openai_compatible',
            };
        case 'anthropic_messages':
            if (input.apiFamily !== 'anthropic_messages') {
                return undefined;
            }
            return {
                toolProtocol: 'anthropic_messages',
                apiFamily: 'anthropic_messages',
            };
        case 'google_generativeai':
            if (input.apiFamily !== 'google_generativeai') {
                return undefined;
            }
            return {
                toolProtocol: 'google_generativeai',
                apiFamily: 'google_generativeai',
            };
        case 'kilo_gateway':
            if (
                input.apiFamily !== 'kilo_gateway' ||
                input.routedApiFamily === undefined ||
                input.routedApiFamily === 'provider_native'
            ) {
                return undefined;
            }
            return {
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: input.routedApiFamily,
            };
        case 'provider_native':
            if (!input.providerNativeId) {
                return undefined;
            }
            return {
                toolProtocol: 'provider_native',
                ...(input.apiFamily ? { apiFamily: input.apiFamily } : {}),
                providerNativeId: input.providerNativeId,
            };
        default:
            return undefined;
    }
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
    const toolProtocol = parseToolProtocol(row.tool_protocol);
    const apiFamily = parseApiFamily(row.api_family);
    const routedApiFamily = parseRoutedApiFamily(row.routed_api_family);
    const persistedRuntimeHints = row.provider_settings_json ? parseJsonObject(row.provider_settings_json) : {};
    const kiloReasoningEfforts = extractKiloReasoningEfforts({
        providerId: row.provider_id,
        supportsReasoning,
        raw,
    });
    const supportsRealtimeWebSocket = extractSupportsRealtimeWebSocket(raw);
    const runtime = buildRuntimeDescriptor({
        toolProtocol,
        apiFamily,
        routedApiFamily,
        supportsRealtimeWebSocket,
        providerNativeId: readProviderNativeId(persistedRuntimeHints['providerNativeId']),
    });
    if (!runtime) {
        throw new Error(
            `Persisted provider model "${row.provider_id}:${row.model_id}" is missing a valid runtime descriptor.`
        );
    }

    return {
        id: row.model_id,
        providerId: parseProviderId(row.provider_id, 'provider_model_catalog.provider_id'),
        label: row.label,
        ...(row.upstream_provider ? { sourceProvider: row.upstream_provider } : {}),
        source: row.source,
        updatedAt: row.updated_at,
        features: {
            supportsTools: row.supports_tools === 1,
            supportsReasoning,
            supportsVision: row.supports_vision === null ? inputModalities.includes('image') : row.supports_vision === 1,
            supportsAudioInput:
                row.supports_audio_input === null ? inputModalities.includes('audio') : row.supports_audio_input === 1,
            supportsAudioOutput:
                row.supports_audio_output === null ? outputModalities.includes('audio') : row.supports_audio_output === 1,
            ...(row.supports_prompt_cache !== null ? { supportsPromptCache: row.supports_prompt_cache === 1 } : {}),
            inputModalities,
            outputModalities,
        },
        runtime,
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
        features: {
            ...model.features,
            inputModalities: normalizeModalities(model.features.inputModalities),
            outputModalities: normalizeModalities(model.features.outputModalities),
        },
        runtime: model.runtime,
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
    const raw = parseJsonObject(row.raw_json);
    const toolProtocol = parseToolProtocol(row.tool_protocol);
    const apiFamily = parseApiFamily(row.api_family);
    const routedApiFamily = parseRoutedApiFamily(row.routed_api_family);
    const providerSettings = row.provider_settings_json ? parseJsonObject(row.provider_settings_json) : {};
    const runtime = buildRuntimeDescriptor({
        toolProtocol,
        apiFamily,
        routedApiFamily,
        supportsRealtimeWebSocket: extractSupportsRealtimeWebSocket(raw),
        providerNativeId: readProviderNativeId(providerSettings['providerNativeId']),
    });
    if (!runtime) {
        throw new Error(
            `Persisted provider model "${row.model_id}" is missing a valid comparable runtime descriptor.`
        );
    }

    return {
        modelId: row.model_id,
        label: row.label,
        upstreamProvider: row.upstream_provider,
        isFree: row.is_free === 1,
        features: {
            supportsTools: row.supports_tools === 1,
            supportsReasoning: row.supports_reasoning === 1,
            supportsVision: row.supports_vision === null ? false : row.supports_vision === 1,
            supportsAudioInput: row.supports_audio_input === null ? false : row.supports_audio_input === 1,
            supportsAudioOutput: row.supports_audio_output === null ? false : row.supports_audio_output === 1,
            ...(row.supports_prompt_cache === null ? {} : { supportsPromptCache: row.supports_prompt_cache === 1 }),
            inputModalities: parseModalities(row.input_modalities_json),
            outputModalities: parseModalities(row.output_modalities_json),
        },
        runtime,
        promptFamily: row.prompt_family,
        contextLength: row.context_length,
        pricing: parseJsonObject(row.pricing_json),
        raw,
        source: row.source,
    };
}

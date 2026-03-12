import type { ProviderCatalogModelUpsert } from '@/app/backend/persistence/stores/provider/providerCatalogStore';
import { applyProviderMetadataOverride } from '@/app/backend/providers/metadata/overrides';
import { supportsCatalogRuntimeFamily } from '@/app/backend/providers/runtimeFamilies';
import type {
    MetadataKnownSource,
    NormalizedModelMetadata,
    ProviderCatalogModel,
    ProviderModelModality,
} from '@/app/backend/providers/types';

const MODEL_MODALITIES: readonly ProviderModelModality[] = ['text', 'audio', 'image', 'video', 'pdf'];

function nowIso(): string {
    return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
        return undefined;
    }

    return value;
}

function readNumberFromRecord(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
    for (const key of keys) {
        const value = readOptionalNumber(record[key]);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function readNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = record[key];
    if (!isRecord(value)) {
        return undefined;
    }

    return value;
}

function normalizeModalities(modalities: ProviderModelModality[] | undefined): ProviderModelModality[] {
    if (!modalities || modalities.length === 0) {
        return ['text'];
    }

    const deduped = new Set<ProviderModelModality>();
    for (const modality of modalities) {
        if ((MODEL_MODALITIES as readonly string[]).includes(modality)) {
            deduped.add(modality);
        }
    }

    if (!deduped.has('text')) {
        deduped.add('text');
    }

    return Array.from(deduped.values());
}

function withDerivedSource(source: MetadataKnownSource): MetadataKnownSource {
    if (source === 'override_registry') {
        return source;
    }

    return source === 'unknown' ? 'derived_hint' : source;
}

function deriveMetadataHints(model: NormalizedModelMetadata): { model: NormalizedModelMetadata; derived: boolean } {
    const pricing = model.pricing ?? {};
    const raw = model.raw ?? {};
    const performance = readNestedRecord(raw, 'performance') ?? {};
    let derived = false;

    let inputPrice = model.inputPrice;
    if (inputPrice === undefined) {
        inputPrice = readNumberFromRecord(pricing, ['inputPrice', 'input', 'prompt', 'input_price']);
        derived ||= inputPrice !== undefined;
    }

    let outputPrice = model.outputPrice;
    if (outputPrice === undefined) {
        outputPrice = readNumberFromRecord(pricing, ['outputPrice', 'output', 'completion', 'output_price']);
        derived ||= outputPrice !== undefined;
    }

    let cacheReadPrice = model.cacheReadPrice;
    if (cacheReadPrice === undefined) {
        cacheReadPrice = readNumberFromRecord(pricing, ['cacheReadPrice', 'cache_read', 'cache_read_input']);
        derived ||= cacheReadPrice !== undefined;
    }

    let cacheWritePrice = model.cacheWritePrice;
    if (cacheWritePrice === undefined) {
        cacheWritePrice = readNumberFromRecord(pricing, ['cacheWritePrice', 'cache_write', 'cache_creation_input']);
        derived ||= cacheWritePrice !== undefined;
    }

    let contextLength = model.contextLength;
    if (contextLength === undefined) {
        contextLength = readNumberFromRecord(raw, ['contextLength', 'context_length']);
        derived ||= contextLength !== undefined;
    }

    let maxOutputTokens = model.maxOutputTokens;
    if (maxOutputTokens === undefined) {
        maxOutputTokens = readNumberFromRecord(raw, ['maxOutputTokens', 'max_output_tokens', 'max_completion_tokens']);
        derived ||= maxOutputTokens !== undefined;
    }

    let latency = model.latency;
    if (latency === undefined) {
        latency =
            readNumberFromRecord(raw, ['latency', 'latency_ms', 'avg_latency', 'avg_latency_ms']) ??
            readNumberFromRecord(performance, ['latency', 'latency_ms', 'avg_latency', 'avg_latency_ms']);
        derived ||= latency !== undefined;
    }

    let tps = model.tps;
    if (tps === undefined) {
        tps =
            readNumberFromRecord(raw, ['tps', 'tokens_per_second', 'throughput_tps', 'avg_tps']) ??
            readNumberFromRecord(performance, ['tps', 'tokens_per_second', 'throughput_tps', 'avg_tps']);
        derived ||= tps !== undefined;
    }

    let price = model.price;
    if (price === undefined) {
        price = readNumberFromRecord(pricing, ['price', 'cost', 'price_usd', 'usd']);
        derived ||= price !== undefined;
    }

    return {
        derived,
        model: {
            ...model,
            ...(inputPrice !== undefined ? { inputPrice } : {}),
            ...(outputPrice !== undefined ? { outputPrice } : {}),
            ...(cacheReadPrice !== undefined ? { cacheReadPrice } : {}),
            ...(cacheWritePrice !== undefined ? { cacheWritePrice } : {}),
            ...(contextLength !== undefined ? { contextLength } : {}),
            ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
            ...(latency !== undefined ? { latency } : {}),
            ...(tps !== undefined ? { tps } : {}),
            ...(price !== undefined ? { price } : {}),
            ...(derived ? { source: withDerivedSource(model.source) } : {}),
        },
    };
}

function isValidNonNegative(value: number | undefined): boolean {
    return value === undefined || (Number.isFinite(value) && value >= 0);
}

function isValidPositiveInteger(value: number | undefined): boolean {
    return value === undefined || (Number.isInteger(value) && value > 0);
}

function validateMetadata(model: NormalizedModelMetadata): boolean {
    if (!model.modelId || model.modelId.trim().length === 0) {
        return false;
    }
    if (!model.label || model.label.trim().length === 0) {
        return false;
    }

    if (!isValidPositiveInteger(model.contextLength) || !isValidPositiveInteger(model.maxOutputTokens)) {
        return false;
    }

    if (
        !isValidNonNegative(model.inputPrice) ||
        !isValidNonNegative(model.outputPrice) ||
        !isValidNonNegative(model.cacheReadPrice) ||
        !isValidNonNegative(model.cacheWritePrice) ||
        !isValidNonNegative(model.price) ||
        !isValidNonNegative(model.latency) ||
        !isValidNonNegative(model.tps)
    ) {
        return false;
    }

    return true;
}

function hasRunnableProtocol(model: NormalizedModelMetadata): boolean {
    return typeof model.toolProtocol === 'string' && model.toolProtocol.length > 0;
}

function normalizeProviderCatalogModel(providerId: NormalizedModelMetadata['providerId'], model: ProviderCatalogModel) {
    return {
        providerId,
        modelId: model.modelId,
        label: model.label,
        source: 'provider_api',
        updatedAt: nowIso(),
        ...(model.upstreamProvider ? { sourceProvider: model.upstreamProvider } : {}),
        isFree: model.isFree,
        supportsTools: model.capabilities.supportsTools,
        supportsReasoning: model.capabilities.supportsReasoning,
        supportsVision: model.capabilities.supportsVision,
        supportsAudioInput: model.capabilities.supportsAudioInput,
        supportsAudioOutput: model.capabilities.supportsAudioOutput,
        ...(model.capabilities.supportsPromptCache !== undefined
            ? { supportsPromptCache: model.capabilities.supportsPromptCache }
            : {}),
        ...(model.capabilities.toolProtocol ? { toolProtocol: model.capabilities.toolProtocol } : {}),
        ...(model.capabilities.apiFamily ? { apiFamily: model.capabilities.apiFamily } : {}),
        ...(model.capabilities.routedApiFamily ? { routedApiFamily: model.capabilities.routedApiFamily } : {}),
        inputModalities: normalizeModalities(model.capabilities.inputModalities),
        outputModalities: normalizeModalities(model.capabilities.outputModalities),
        ...(model.capabilities.promptFamily ? { promptFamily: model.capabilities.promptFamily } : {}),
        ...(isRecord(model.providerSettings) ? { providerSettings: model.providerSettings } : {}),
        ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
        pricing: isRecord(model.pricing) ? model.pricing : {},
        raw: isRecord(model.raw) ? model.raw : {},
    } satisfies NormalizedModelMetadata;
}

export interface CatalogNormalizationContext {
    optionProfileId: string;
    resolvedBaseUrl: string | null;
}

export interface NormalizeCatalogMetadataResult {
    models: NormalizedModelMetadata[];
    overrideCount: number;
    derivedCount: number;
    droppedCount: number;
}

export function normalizeCatalogMetadata(
    providerId: NormalizedModelMetadata['providerId'],
    models: ProviderCatalogModel[],
    context?: CatalogNormalizationContext
): NormalizeCatalogMetadataResult {
    const normalized: NormalizedModelMetadata[] = [];
    let overrideCount = 0;
    let derivedCount = 0;
    let droppedCount = 0;

    for (const model of models) {
        const base = normalizeProviderCatalogModel(providerId, model);
        const withOverrides = applyProviderMetadataOverride(base);
        if (withOverrides.applied) {
            overrideCount += 1;
        }

        const withHints = deriveMetadataHints(withOverrides.model);
        if (withHints.derived) {
            derivedCount += 1;
        }

        if (!hasRunnableProtocol(withHints.model)) {
            droppedCount += 1;
            continue;
        }

        if (
            !supportsCatalogRuntimeFamily({
                    providerId,
                    model: withHints.model,
                    ...(context
                        ? {
                              context: {
                                  providerId,
                                  optionProfileId: context.optionProfileId,
                                  resolvedBaseUrl: context.resolvedBaseUrl,
                              },
                          }
                    : {}),
            })
        ) {
            droppedCount += 1;
            continue;
        }

        if (!validateMetadata(withHints.model)) {
            droppedCount += 1;
            continue;
        }

        normalized.push(withHints.model);
    }

    normalized.sort((left, right) => left.modelId.localeCompare(right.modelId));
    return {
        models: normalized,
        overrideCount,
        derivedCount,
        droppedCount,
    };
}

function buildPricing(model: NormalizedModelMetadata): Record<string, unknown> {
    const pricing = isRecord(model.pricing) ? { ...model.pricing } : {};

    if (model.inputPrice !== undefined) pricing['input'] = model.inputPrice;
    if (model.outputPrice !== undefined) pricing['output'] = model.outputPrice;
    if (model.cacheReadPrice !== undefined) pricing['cache_read'] = model.cacheReadPrice;
    if (model.cacheWritePrice !== undefined) pricing['cache_write'] = model.cacheWritePrice;
    if (model.price !== undefined) pricing['price'] = model.price;

    return pricing;
}

function buildRaw(model: NormalizedModelMetadata): Record<string, unknown> {
    const raw = isRecord(model.raw) ? { ...model.raw } : {};

    if (model.contextLength !== undefined) raw['context_length'] = model.contextLength;
    if (model.maxOutputTokens !== undefined) raw['max_output_tokens'] = model.maxOutputTokens;
    if (model.latency !== undefined) raw['latency_ms'] = model.latency;
    if (model.tps !== undefined) raw['tps'] = model.tps;
    if (model.inputPrice !== undefined) raw['input_price'] = model.inputPrice;
    if (model.outputPrice !== undefined) raw['output_price'] = model.outputPrice;
    if (model.cacheReadPrice !== undefined) raw['cache_read_price'] = model.cacheReadPrice;
    if (model.cacheWritePrice !== undefined) raw['cache_write_price'] = model.cacheWritePrice;

    return raw;
}

export function toProviderCatalogUpsert(model: NormalizedModelMetadata): ProviderCatalogModelUpsert {
    return {
        modelId: model.modelId,
        label: model.label,
        ...(model.sourceProvider ? { upstreamProvider: model.sourceProvider } : {}),
        isFree: model.isFree ?? false,
        supportsTools: model.supportsTools ?? false,
        supportsReasoning: model.supportsReasoning ?? false,
        supportsVision: model.supportsVision ?? false,
        supportsAudioInput: model.supportsAudioInput ?? false,
        supportsAudioOutput: model.supportsAudioOutput ?? false,
        ...(model.supportsPromptCache !== undefined ? { supportsPromptCache: model.supportsPromptCache } : {}),
        ...(model.toolProtocol ? { toolProtocol: model.toolProtocol } : {}),
        ...(model.apiFamily ? { apiFamily: model.apiFamily } : {}),
        ...(model.routedApiFamily ? { routedApiFamily: model.routedApiFamily } : {}),
        inputModalities: normalizeModalities(model.inputModalities),
        outputModalities: normalizeModalities(model.outputModalities),
        ...(model.promptFamily ? { promptFamily: model.promptFamily } : {}),
        ...(isRecord(model.providerSettings) ? { providerSettings: model.providerSettings } : {}),
        ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
        pricing: buildPricing(model),
        raw: buildRaw(model),
        source: model.source,
    };
}

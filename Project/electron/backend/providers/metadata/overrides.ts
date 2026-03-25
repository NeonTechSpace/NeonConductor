import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { MetadataKnownSource, NormalizedModelMetadata } from '@/app/backend/providers/types';

type MetadataOverridePatch = Partial<
    Pick<
        NormalizedModelMetadata,
        | 'label'
        | 'sourceProvider'
        | 'isFree'
        | 'promptFamily'
        | 'contextLength'
        | 'maxOutputTokens'
        | 'inputPrice'
        | 'outputPrice'
        | 'cacheReadPrice'
        | 'cacheWritePrice'
        | 'price'
        | 'latency'
        | 'tps'
        | 'pricing'
        | 'raw'
    >
> & {
    features?: Partial<NormalizedModelMetadata['features']>;
};

export interface ProviderMetadataOverrideEntry {
    providerId: FirstPartyProviderId;
    modelId: string;
    reason: string;
    updatedAt: string;
    patch: MetadataOverridePatch;
}

const providerMetadataOverrides: readonly ProviderMetadataOverrideEntry[] = [];

function buildOverrideKey(providerId: FirstPartyProviderId, modelId: string): string {
    return `${providerId}:${modelId}`;
}

function buildOverrideIndex(
    entries: readonly ProviderMetadataOverrideEntry[]
): Map<string, ProviderMetadataOverrideEntry> {
    return new Map(entries.map((entry) => [buildOverrideKey(entry.providerId, entry.modelId), entry]));
}

const overrideIndex = buildOverrideIndex(providerMetadataOverrides);

function sourceAfterOverride(originalSource: MetadataKnownSource): MetadataKnownSource {
    if (originalSource === 'unknown') {
        return 'override_registry';
    }

    return 'override_registry';
}

export interface ProviderMetadataOverrideMatch {
    model: NormalizedModelMetadata;
    applied: boolean;
    reason?: string;
}

export function applyProviderMetadataOverrideFromEntries(
    model: NormalizedModelMetadata,
    entries: readonly ProviderMetadataOverrideEntry[]
): ProviderMetadataOverrideMatch {
    const override = buildOverrideIndex(entries).get(buildOverrideKey(model.providerId, model.modelId));
    if (!override) {
        return {
            model,
            applied: false,
        };
    }

    const { features: featurePatch, ...metadataPatch } = override.patch;

    return {
        applied: true,
        reason: override.reason,
        model: {
            ...model,
            ...metadataPatch,
            ...(featurePatch ? { features: { ...model.features, ...featurePatch } } : {}),
            source: sourceAfterOverride(model.source),
            updatedAt: override.updatedAt || model.updatedAt,
        },
    };
}

export function applyProviderMetadataOverride(model: NormalizedModelMetadata): ProviderMetadataOverrideMatch {
    const override = overrideIndex.get(buildOverrideKey(model.providerId, model.modelId));
    if (!override) {
        return {
            model,
            applied: false,
        };
    }

    const { features: featurePatch, ...metadataPatch } = override.patch;

    return {
        applied: true,
        reason: override.reason,
        model: {
            ...model,
            ...metadataPatch,
            ...(featurePatch ? { features: { ...model.features, ...featurePatch } } : {}),
            source: sourceAfterOverride(model.source),
            updatedAt: override.updatedAt || model.updatedAt,
        },
    };
}

import { providerCatalogStore, providerStore } from '@/app/backend/persistence/stores';
import type { ProviderDiscoverySnapshotRecord } from '@/app/backend/persistence/types';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import type { KiloModelProviderOption } from '@/app/backend/providers/service/types';
import type { ProviderListModelProvidersInput } from '@/app/backend/runtime/contracts';

function readRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        result[key] = entry;
    }
    return result;
}

function readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
}

function readModelId(value: unknown): string | undefined {
    const record = readRecord(value);
    if (!record) {
        return undefined;
    }

    const direct =
        readString(record['id']) ??
        readString(record['modelId']) ??
        readString(record['slug']) ??
        readString(record['permaslug']) ??
        readString(record['name']);
    if (direct) {
        return direct;
    }

    const endpoint = readRecord(record['endpoint']);
    const endpointModel = endpoint ? readRecord(endpoint['model']) : undefined;
    if (!endpointModel) {
        return undefined;
    }

    return (
        readString(endpointModel['id']) ??
        readString(endpointModel['modelId']) ??
        readString(endpointModel['slug']) ??
        readString(endpointModel['permaslug']) ??
        readString(endpointModel['name'])
    );
}

function readProviderId(value: unknown): string | undefined {
    const record = readRecord(value);
    if (!record) {
        return undefined;
    }

    return (
        readString(record['providerId']) ??
        readString(record['provider']) ??
        readString(record['id']) ??
        readString(record['slug']) ??
        readString(record['name'])
    );
}

function readMetric(record: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = readNumber(record[key]);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

function findModelEntryInProviderRaw(raw: Record<string, unknown>, modelId: string): Record<string, unknown> | undefined {
    const models = Array.isArray(raw['models']) ? raw['models'] : [];
    for (const item of models) {
        if (typeof item === 'string') {
            if (item === modelId) {
                return { id: modelId };
            }
            continue;
        }

        const record = readRecord(item);
        if (!record) {
            continue;
        }
        if (readModelId(record) === modelId) {
            return record;
        }
    }

    return undefined;
}

function mapModelProviderOption(input: {
    providerId: string;
    label: string;
    modelEntry?: Record<string, unknown>;
}): KiloModelProviderOption {
    const modelEntry = input.modelEntry ?? {};
    const pricing = readRecord(modelEntry['pricing']) ?? {};
    const endpoint = readRecord(modelEntry['endpoint']) ?? {};
    const endpointModel = readRecord(endpoint['model']) ?? {};

    const inputPrice = readMetric(pricing, ['prompt', 'input', 'input_price', 'inputPrice']);
    const outputPrice = readMetric(pricing, ['completion', 'output', 'output_price', 'outputPrice']);
    const cacheReadPrice = readMetric(pricing, ['cache_read', 'cacheRead', 'cache_read_input']);
    const cacheWritePrice = readMetric(pricing, ['cache_write', 'cacheWrite', 'cache_creation_input']);
    const contextLength =
        readMetric(modelEntry, ['context_length', 'contextLength']) ??
        readMetric(endpointModel, ['context_length', 'contextLength']);
    const maxCompletionTokens =
        readMetric(modelEntry, ['max_completion_tokens', 'maxCompletionTokens']) ??
        readMetric(endpointModel, ['max_completion_tokens', 'maxCompletionTokens']);

    return {
        providerId: input.providerId,
        label: input.label,
        ...(inputPrice !== undefined ? { inputPrice } : {}),
        ...(outputPrice !== undefined ? { outputPrice } : {}),
        ...(cacheReadPrice !== undefined ? { cacheReadPrice } : {}),
        ...(cacheWritePrice !== undefined ? { cacheWritePrice } : {}),
        ...(contextLength !== undefined ? { contextLength } : {}),
        ...(maxCompletionTokens !== undefined ? { maxCompletionTokens } : {}),
    };
}

async function assertKiloModelExists(profileId: string, modelId: string): Promise<ProviderServiceResult<void>> {
    const exists = await providerStore.modelExists(profileId, 'kilo', modelId);
    if (!exists) {
        return errProviderService('provider_model_missing', `Model "${modelId}" is not available for provider "kilo".`);
    }

    return okProviderService(undefined);
}

async function findLatestKiloProvidersSnapshot(
    profileId: string
): Promise<ProviderDiscoverySnapshotRecord | undefined> {
    const snapshots = await providerCatalogStore.listDiscoverySnapshotsByProfile(profileId);
    return snapshots.find((snapshot) => snapshot.providerId === 'kilo' && snapshot.kind === 'providers');
}

export async function listKiloProviderOptions(
    input: ProviderListModelProvidersInput
): Promise<ProviderServiceResult<KiloModelProviderOption[]>> {
    const modelResult = await assertKiloModelExists(input.profileId, input.modelId);
    if (modelResult.isErr()) {
        return errProviderService(modelResult.error.code, modelResult.error.message);
    }

    const snapshot = await findLatestKiloProvidersSnapshot(input.profileId);
    if (!snapshot || snapshot.status !== 'ok') {
        return okProviderService([]);
    }

    const providersRaw = Array.isArray(snapshot.payload['providers']) ? snapshot.payload['providers'] : [];
    const modelsByProviderRaw = Array.isArray(snapshot.payload['modelsByProvider'])
        ? snapshot.payload['modelsByProvider']
        : [];

    const labelsByProviderId = new Map<string, string>();
    for (const providerEntry of providersRaw) {
        const record = readRecord(providerEntry);
        if (!record) {
            continue;
        }
        const providerId = readProviderId(record);
        if (!providerId) {
            continue;
        }
        const label =
            readString(record['label']) ??
            readString(record['displayName']) ??
            readString(record['name']) ??
            providerId;
        labelsByProviderId.set(providerId, label);
    }

    const rows: KiloModelProviderOption[] = [];
    for (const entry of modelsByProviderRaw) {
        const record = readRecord(entry);
        if (!record) {
            continue;
        }
        const providerId = readProviderId(record);
        if (!providerId) {
            continue;
        }

        const modelIds = Array.isArray(record['modelIds']) ? record['modelIds'] : [];
        const hasMembership = modelIds.some((value) => value === input.modelId);
        const raw = readRecord(record['raw']);
        const modelEntry = raw ? findModelEntryInProviderRaw(raw, input.modelId) : undefined;
        if (!hasMembership && !modelEntry) {
            continue;
        }

        const label = labelsByProviderId.get(providerId) ?? providerId;
        rows.push(
            mapModelProviderOption({
                providerId,
                label,
                ...(modelEntry ? { modelEntry } : {}),
            })
        );
    }

    rows.sort((left, right) => left.label.localeCompare(right.label));
    return okProviderService(rows);
}

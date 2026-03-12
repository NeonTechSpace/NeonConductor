import {
    isRecord,
    readArray,
    readOptionalNumber,
    readOptionalString,
    unwrapData,
} from '@/app/backend/providers/kiloGatewayClient/parse/shared';
import type {
    KiloGatewayModel,
    KiloGatewayModelsByProvider,
    KiloGatewayProvider,
} from '@/app/backend/providers/kiloGatewayClient/types';
import { appLog } from '@/app/main/logging';

export function parseModelsPayload(payload: Record<string, unknown>): KiloGatewayModel[] {
    const list = readArray(unwrapData(payload));

    const models = list
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }

            const id = readOptionalString(entry['id']);
            if (!id) {
                return null;
            }

            const supportedParameters = readArray(entry['supported_parameters']).filter(
                (value): value is string => typeof value === 'string'
            );
            const upstreamProvider = readOptionalString(entry['owned_by']);
            const contextLength = readOptionalNumber(entry['context_length']);
            const architecture = isRecord(entry['architecture']) ? entry['architecture'] : null;
            const inputModalities = readArray(architecture?.['input_modalities']).filter(
                (value): value is string => typeof value === 'string'
            );
            const outputModalities = readArray(architecture?.['output_modalities']).filter(
                (value): value is string => typeof value === 'string'
            );
            const opencode = isRecord(entry['opencode']) ? entry['opencode'] : null;
            const promptFamily =
                readOptionalString(opencode?.['prompt']) ??
                readOptionalString(entry['prompt']) ??
                readOptionalString(entry['prompt_family']);

            return {
                id,
                name: readOptionalString(entry['name']) ?? id,
                ...(upstreamProvider ? { upstreamProvider } : {}),
                ...(contextLength !== undefined ? { contextLength } : {}),
                supportedParameters,
                inputModalities,
                outputModalities,
                ...(promptFamily ? { promptFamily } : {}),
                pricing: isRecord(entry['pricing']) ? entry['pricing'] : {},
                raw: entry,
            };
        })
        .filter((model): model is KiloGatewayModel => model !== null);

    const dedupedModels = new Map<string, KiloGatewayModel>();
    for (const model of models) {
        dedupedModels.set(model.id, model);
    }

    return [...dedupedModels.values()];
}

export function parseProvidersPayload(payload: Record<string, unknown>): KiloGatewayProvider[] {
    const list = readArray(unwrapData(payload));

    return list
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }

            const id =
                readOptionalString(entry['id']) ??
                readOptionalString(entry['slug']) ??
                readOptionalString(entry['name']);
            if (!id) {
                return null;
            }

            return {
                id,
                label:
                    readOptionalString(entry['label']) ??
                    readOptionalString(entry['displayName']) ??
                    readOptionalString(entry['name']) ??
                    id,
                raw: entry,
            };
        })
        .filter((provider): provider is KiloGatewayProvider => provider !== null);
}

function readModelIdFromRecord(value: Record<string, unknown>): string | undefined {
    const direct =
        readOptionalString(value['id']) ??
        readOptionalString(value['modelId']) ??
        readOptionalString(value['slug']) ??
        readOptionalString(value['permaslug']) ??
        readOptionalString(value['name']);
    if (direct) {
        return direct;
    }

    const endpoint = isRecord(value['endpoint']) ? value['endpoint'] : null;
    const endpointModel = endpoint && isRecord(endpoint['model']) ? endpoint['model'] : null;
    if (endpointModel) {
        const nested =
            readOptionalString(endpointModel['id']) ??
            readOptionalString(endpointModel['slug']) ??
            readOptionalString(endpointModel['permaslug']) ??
            readOptionalString(endpointModel['name']);
        if (nested) {
            return nested;
        }
    }

    return undefined;
}

function listModelsByProviderEntries(payload: Record<string, unknown>): unknown[] {
    const directProviders = readArray(payload['providers']);
    if (directProviders.length > 0) {
        return directProviders;
    }

    const unwrapped = unwrapData(payload);
    if (Array.isArray(unwrapped)) {
        return unwrapped;
    }

    if (isRecord(unwrapped)) {
        const nestedProviders = readArray(unwrapped['providers']);
        if (nestedProviders.length > 0) {
            return nestedProviders;
        }
    }

    const payloadKeys = Object.keys(payload);
    appLog.warn({
        tag: 'provider.kilo-gateway',
        message: 'Kilo models-by-provider payload did not match known shapes.',
        payloadKeys,
    });

    return [];
}

export function parseModelsByProviderPayload(payload: Record<string, unknown>): KiloGatewayModelsByProvider[] {
    const list = listModelsByProviderEntries(payload);

    return list
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }

            const providerId =
                readOptionalString(entry['provider']) ??
                readOptionalString(entry['providerId']) ??
                readOptionalString(entry['id']) ??
                readOptionalString(entry['slug']) ??
                readOptionalString(entry['name']);
            if (!providerId) {
                return null;
            }

            const modelIds = readArray(entry['models']).flatMap((value) => {
                if (typeof value === 'string') {
                    return [value];
                }

                if (isRecord(value)) {
                    const modelId = readModelIdFromRecord(value);
                    return modelId ? [modelId] : [];
                }

                return [];
            });

            return {
                providerId,
                modelIds,
                raw: entry,
            };
        })
        .filter((entry): entry is KiloGatewayModelsByProvider => entry !== null);
}

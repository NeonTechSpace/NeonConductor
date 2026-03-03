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

export function parseModelsPayload(payload: Record<string, unknown>): KiloGatewayModel[] {
    const list = readArray(unwrapData(payload));

    return list
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

            return {
                id,
                name: readOptionalString(entry['name']) ?? id,
                ...(upstreamProvider ? { upstreamProvider } : {}),
                ...(contextLength !== undefined ? { contextLength } : {}),
                supportedParameters,
                pricing: isRecord(entry['pricing']) ? entry['pricing'] : {},
                raw: entry,
            };
        })
        .filter((model): model is KiloGatewayModel => model !== null);
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
                label: readOptionalString(entry['label']) ?? readOptionalString(entry['name']) ?? id,
                raw: entry,
            };
        })
        .filter((provider): provider is KiloGatewayProvider => provider !== null);
}

export function parseModelsByProviderPayload(payload: Record<string, unknown>): KiloGatewayModelsByProvider[] {
    const list = readArray(unwrapData(payload));

    return list
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }

            const providerId =
                readOptionalString(entry['provider']) ??
                readOptionalString(entry['providerId']) ??
                readOptionalString(entry['id']);
            if (!providerId) {
                return null;
            }

            const modelIds = readArray(entry['models']).flatMap((value) => {
                if (typeof value === 'string') {
                    return [value];
                }

                if (isRecord(value)) {
                    const modelId = readOptionalString(value['id']) ?? readOptionalString(value['modelId']);
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

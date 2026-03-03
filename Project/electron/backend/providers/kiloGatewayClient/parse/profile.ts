import {
    isRecord,
    readArray,
    readDataRecord,
    readOptionalNumber,
    readOptionalString,
} from '@/app/backend/providers/kiloGatewayClient/parse/shared';
import type {
    KiloDefaultsResponse,
    KiloProfileBalanceResponse,
    KiloProfileResponse,
} from '@/app/backend/providers/kiloGatewayClient/types';

export function parseProfilePayload(payload: Record<string, unknown>): KiloProfileResponse {
    const data = readDataRecord(payload);
    const organizations = readArray(data['organizations'])
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }

            const organizationId =
                readOptionalString(entry['id']) ??
                readOptionalString(entry['organizationId']) ??
                readOptionalString(entry['organization_id']);
            if (!organizationId) {
                return null;
            }

            const activeRaw = entry['isActive'] ?? entry['active'] ?? entry['is_active'];
            const isActive = activeRaw === true || activeRaw === 1 || activeRaw === 'true';

            return {
                organizationId,
                name: readOptionalString(entry['name']) ?? organizationId,
                isActive,
                entitlement: isRecord(entry['entitlement']) ? entry['entitlement'] : {},
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const accountId = readOptionalString(data['id']);

    return {
        ...(accountId ? { accountId } : {}),
        displayName: readOptionalString(data['name']) ?? readOptionalString(data['displayName']) ?? '',
        emailMasked: readOptionalString(data['emailMasked']) ?? readOptionalString(data['email']) ?? '',
        organizations,
        raw: payload,
    };
}

export function parseBalancePayload(payload: Record<string, unknown>): KiloProfileBalanceResponse {
    const data = readDataRecord(payload);
    const balance = readOptionalNumber(data['balance']) ?? readOptionalNumber(data['credits']) ?? 0;
    const currency = readOptionalString(data['currency']) ?? 'USD';

    return {
        balance,
        currency,
        raw: payload,
    };
}

export function parseDefaultsPayload(payload: Record<string, unknown>): KiloDefaultsResponse {
    const data = readDataRecord(payload);
    const defaultModelId =
        readOptionalString(data['default_model_id']) ??
        readOptionalString(data['defaultModelId']) ??
        readOptionalString(data['modelId']);
    const defaultProviderId =
        readOptionalString(data['default_provider_id']) ??
        readOptionalString(data['defaultProviderId']) ??
        readOptionalString(data['providerId']);

    return {
        ...(defaultProviderId ? { defaultProviderId } : {}),
        ...(defaultModelId ? { defaultModelId } : {}),
        raw: payload,
    };
}

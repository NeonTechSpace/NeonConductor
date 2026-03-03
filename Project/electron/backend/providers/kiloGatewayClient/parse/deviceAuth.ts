import {
    readDataRecord,
    readIsoFromSeconds,
    readOptionalNumber,
    readOptionalString,
} from '@/app/backend/providers/kiloGatewayClient/parse/shared';
import { KiloGatewayError } from '@/app/backend/providers/kiloGatewayClient/requestExecutor';
import type {
    KiloDeviceCodeResponse,
    KiloDeviceCodeStatusResponse,
} from '@/app/backend/providers/kiloGatewayClient/types';

function mapDeviceStatus(value: string | undefined): KiloDeviceCodeStatusResponse['status'] {
    if (value === 'approved' || value === 'authorized' || value === 'access_granted') {
        return 'approved';
    }

    if (value === 'expired' || value === 'expired_token') {
        return 'expired';
    }

    if (value === 'denied' || value === 'access_denied') {
        return 'denied';
    }

    return 'pending';
}

export function parseDeviceCodePayload(payload: Record<string, unknown>): KiloDeviceCodeResponse {
    const data = readDataRecord(payload);
    const code = readOptionalString(data['code']) ?? readOptionalString(data['device_code']);
    const userCode = readOptionalString(data['user_code']) ?? readOptionalString(data['userCode']);
    const verificationUri =
        readOptionalString(data['verification_uri']) ??
        readOptionalString(data['verificationUrl']) ??
        readOptionalString(data['verification_uri_complete']);

    if (!code || !userCode || !verificationUri) {
        throw new KiloGatewayError({
            message: 'Device auth code response missing required fields.',
            category: 'schema',
            endpoint: '/api/device-auth/codes',
        });
    }

    return {
        code,
        userCode,
        verificationUri,
        pollIntervalSeconds: readOptionalNumber(data['interval']) ?? readOptionalNumber(data['interval_seconds']) ?? 5,
        expiresAt:
            readOptionalString(data['expires_at']) ??
            readIsoFromSeconds(data['expires_in']) ??
            new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        raw: payload,
    };
}

export function parseDeviceCodeStatusPayload(payload: Record<string, unknown>): KiloDeviceCodeStatusResponse {
    const data = readDataRecord(payload);
    const rawStatus =
        readOptionalString(data['status']) ?? readOptionalString(data['state']) ?? readOptionalString(data['error']);
    const status = mapDeviceStatus(rawStatus);

    const accessToken = readOptionalString(data['access_token']);
    const refreshToken = readOptionalString(data['refresh_token']);
    const expiresAt = readOptionalString(data['expires_at']) ?? readIsoFromSeconds(data['expires_in']);
    const accountId = readOptionalString(data['account_id']);
    const organizationId = readOptionalString(data['organization_id']);

    return {
        status,
        ...(accessToken ? { accessToken } : {}),
        ...(refreshToken ? { refreshToken } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(accountId ? { accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
        raw: payload,
    };
}

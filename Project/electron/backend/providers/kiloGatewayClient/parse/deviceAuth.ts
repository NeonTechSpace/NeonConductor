import {
    isRecord,
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
import { appLog } from '@/app/main/logging';

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

function collectCandidateRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
    const candidates: Record<string, unknown>[] = [];
    const seen = new Set<Record<string, unknown>>();

    function pushCandidate(candidate: unknown) {
        if (!isRecord(candidate) || seen.has(candidate)) {
            return;
        }

        seen.add(candidate);
        candidates.push(candidate);
    }

    const data = readDataRecord(payload);
    pushCandidate(payload);
    pushCandidate(data);

    for (const record of [...candidates]) {
        pushCandidate(record['device']);
        pushCandidate(record['auth']);
        pushCandidate(record['device_auth']);
        pushCandidate(record['deviceAuth']);
        pushCandidate(record['codes']);
        pushCandidate(record['result']);
        pushCandidate(record['data']);
    }

    return candidates;
}

function findStringValue(records: Record<string, unknown>[], fields: string[]): string | undefined {
    for (const record of records) {
        for (const field of fields) {
            const value = readOptionalString(record[field]);
            if (value) {
                return value;
            }
        }
    }

    return undefined;
}

function findNumberValue(records: Record<string, unknown>[], fields: string[]): number | undefined {
    for (const record of records) {
        for (const field of fields) {
            const value = readOptionalNumber(record[field]);
            if (value !== undefined) {
                return value;
            }
        }
    }

    return undefined;
}

function logDeviceCodeSchemaMismatch(payload: Record<string, unknown>, records: Record<string, unknown>[]) {
    appLog.warn({
        tag: 'provider.kilo-gateway',
        message: 'Device auth code payload shape did not match expected aliases.',
        topLevelKeys: Object.keys(payload).sort(),
        candidateKeySets: records.map((record) => Object.keys(record).sort().join(',')),
        hasCodeField: records.some((record) =>
            ['code', 'device_code', 'deviceCode'].some((field) => readOptionalString(record[field]) !== undefined)
        ),
        hasUserCodeField: records.some((record) =>
            ['user_code', 'userCode', 'code'].some((field) => readOptionalString(record[field]) !== undefined)
        ),
        hasVerificationField: records.some((record) =>
            [
                'verification_uri',
                'verificationUri',
                'verificationUrl',
                'verification_uri_complete',
                'verification_url',
                'verificationUrlComplete',
                'browser_url',
                'authorize_url',
            ].some((field) => readOptionalString(record[field]) !== undefined)
        ),
        endpoint: '/api/device-auth/codes',
    });
}

export function parseDeviceCodePayload(payload: Record<string, unknown>): KiloDeviceCodeResponse {
    const records = collectCandidateRecords(payload);
    const code = findStringValue(records, ['device_code', 'deviceCode', 'code']);
    const userCode = findStringValue(records, ['user_code', 'userCode', 'code']);
    const verificationUri = findStringValue(records, [
        'verification_uri',
        'verificationUri',
        'verificationUrl',
        'verification_uri_complete',
        'verification_url',
        'verificationUrlComplete',
        'browser_url',
        'authorize_url',
    ]);

    if (!code || !userCode || !verificationUri) {
        logDeviceCodeSchemaMismatch(payload, records);
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
        pollIntervalSeconds: findNumberValue(records, ['interval', 'interval_seconds', 'poll_interval_seconds']) ?? 5,
        expiresAt:
            findStringValue(records, ['expires_at', 'expiresAt']) ??
            readIsoFromSeconds(findNumberValue(records, ['expires_in', 'expiresIn'])) ??
            new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        raw: payload,
    };
}

export function parseDeviceCodeStatusPayload(payload: Record<string, unknown>): KiloDeviceCodeStatusResponse {
    const records = collectCandidateRecords(payload);
    const rawStatus = findStringValue(records, ['status', 'state', 'error']);
    const status = mapDeviceStatus(rawStatus);

    const accessToken = findStringValue(records, ['access_token', 'accessToken', 'token']);
    const refreshToken = findStringValue(records, ['refresh_token', 'refreshToken']);
    const expiresAt =
        findStringValue(records, ['expires_at', 'expiresAt']) ??
        readIsoFromSeconds(findNumberValue(records, ['expires_in', 'expiresIn']));
    const accountId = findStringValue(records, ['account_id', 'accountId']);
    const organizationId = findStringValue(records, ['organization_id', 'organizationId']);

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

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

export function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export function unwrapData(payload: Record<string, unknown>): unknown {
    return payload['data'] ?? payload['result'] ?? payload;
}

export function readDataRecord(payload: Record<string, unknown>): Record<string, unknown> {
    const unwrapped = unwrapData(payload);
    return isRecord(unwrapped) ? unwrapped : payload;
}

export function readIsoFromSeconds(expiresInSeconds: unknown): string | undefined {
    if (typeof expiresInSeconds !== 'number' || !Number.isFinite(expiresInSeconds)) {
        return undefined;
    }

    return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

import { createHash, randomBytes } from 'node:crypto';

export function nowIso(): string {
    return new Date().toISOString();
}

export function plusSeconds(seconds: number): string {
    return new Date(Date.now() + seconds * 1000).toISOString();
}

export function createOpaque(size = 32): string {
    return randomBytes(size).toString('base64url');
}

export function createPkceChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

export function readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
    const parts = token.split('.');
    const payload = parts[1];
    if (!payload) {
        return {};
    }

    try {
        const json = Buffer.from(payload, 'base64url').toString('utf8');
        const parsed = JSON.parse(json) as unknown;
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function readOpenAIAccountId(accessToken: string): string | undefined {
    const payload = decodeJwtPayload(accessToken);
    return readString(payload['sub']) ?? readString(payload['account_id']) ?? readString(payload['user_id']);
}

// Adapted from Kilo-Org/kilocode packages/kilo-gateway/src/headers.ts
import {
    DEFAULT_EDITOR_NAME,
    HEADER_EDITOR_NAME,
    HEADER_ORGANIZATION_ID,
} from '@/app/backend/providers/kilo-vendor/constants';

export const DEFAULT_HEADERS: Record<string, string> = {
    'User-Agent': 'neonconductor-kilo-adapter',
    'Content-Type': 'application/json',
};

export function buildKiloHeaders(options?: { organizationId?: string }): Record<string, string> {
    const headers: Record<string, string> = {
        [HEADER_EDITOR_NAME]: DEFAULT_EDITOR_NAME,
    };

    if (options?.organizationId) {
        headers[HEADER_ORGANIZATION_ID] = options.organizationId;
    }

    return headers;
}

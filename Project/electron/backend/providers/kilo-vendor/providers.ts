import { KILO_GATEWAY_BASE, MODELS_FETCH_TIMEOUT_MS } from '@/app/backend/providers/kilo-vendor/constants';
import { buildKiloHeaders, DEFAULT_HEADERS } from '@/app/backend/providers/kilo-vendor/headers';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface KiloProviderEntry {
    id: string;
    label: string;
    raw: Record<string, unknown>;
}

export async function fetchKiloProviders(options?: {
    apiKey?: string;
    organizationId?: string;
    baseUrl?: string;
}): Promise<{ providers: KiloProviderEntry[]; rawPayload: Record<string, unknown> }> {
    const baseUrl = options?.baseUrl ?? KILO_GATEWAY_BASE;
    const response = await fetch(`${baseUrl}/providers`, {
        headers: {
            ...DEFAULT_HEADERS,
            ...buildKiloHeaders(options?.organizationId ? { organizationId: options.organizationId } : undefined),
            ...(options?.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`Kilo providers fetch failed: ${String(response.status)} ${response.statusText}`);
    }

    const payload = (await response.json()) as unknown;
    const payloadRecord = isRecord(payload) ? payload : {};

    const list = Array.isArray(payloadRecord['data'])
        ? payloadRecord['data']
        : Array.isArray(payloadRecord['providers'])
          ? payloadRecord['providers']
          : Array.isArray(payload)
            ? payload
            : [];

    const providers: KiloProviderEntry[] = [];
    for (const entry of list) {
        if (!isRecord(entry)) {
            continue;
        }

        const id = readString(entry['id']) ?? readString(entry['slug']) ?? readString(entry['name']);
        if (!id) {
            continue;
        }

        const label = readString(entry['label']) ?? readString(entry['name']) ?? id;
        providers.push({
            id,
            label,
            raw: entry,
        });
    }

    return {
        providers,
        rawPayload: payloadRecord,
    };
}

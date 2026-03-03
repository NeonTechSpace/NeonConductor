// Adapted from Kilo-Org/kilocode packages/kilo-gateway/src/api/models.ts
import { KILO_GATEWAY_BASE, MODELS_FETCH_TIMEOUT_MS } from '@/app/backend/providers/kilo-vendor/constants';
import { buildKiloHeaders, DEFAULT_HEADERS } from '@/app/backend/providers/kilo-vendor/headers';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toBooleanFromArray(items: unknown, match: string): boolean {
    if (!Array.isArray(items)) {
        return false;
    }

    return items.some((item) => item === match);
}

export interface KiloModelResult {
    id: string;
    name: string;
    upstreamProvider?: string;
    isFree: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
    contextLength?: number;
    pricing: Record<string, unknown>;
    raw: Record<string, unknown>;
}

export async function fetchKiloModels(options?: {
    apiKey?: string;
    organizationId?: string;
    baseUrl?: string;
}): Promise<{ models: KiloModelResult[]; rawPayload: Record<string, unknown> }> {
    const baseUrl = options?.baseUrl ?? KILO_GATEWAY_BASE;
    const response = await fetch(`${baseUrl}/models`, {
        headers: {
            ...DEFAULT_HEADERS,
            ...buildKiloHeaders(options?.organizationId ? { organizationId: options.organizationId } : undefined),
            ...(options?.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`Kilo models fetch failed: ${String(response.status)} ${response.statusText}`);
    }

    const payload = (await response.json()) as unknown;
    const payloadRecord = isRecord(payload) ? payload : {};
    const data = Array.isArray(payloadRecord['data']) ? payloadRecord['data'] : [];

    const models: KiloModelResult[] = [];
    for (const entry of data) {
        if (!isRecord(entry)) {
            continue;
        }

        const id = readString(entry['id']);
        if (!id) {
            continue;
        }

        const name = readString(entry['name']) ?? id;
        const ownedBy = readString(entry['owned_by']);
        const supportsTools = toBooleanFromArray(entry['supported_parameters'], 'tools');
        const supportsReasoning = toBooleanFromArray(entry['supported_parameters'], 'reasoning');
        const contextLength = readNumber(entry['context_length']);
        const pricing = isRecord(entry['pricing']) ? entry['pricing'] : {};

        models.push({
            id,
            name,
            ...(ownedBy ? { upstreamProvider: ownedBy } : {}),
            isFree: id.endsWith(':free'),
            supportsTools,
            supportsReasoning,
            ...(contextLength !== undefined ? { contextLength } : {}),
            pricing,
            raw: entry,
        });
    }

    return {
        models,
        rawPayload: payloadRecord,
    };
}

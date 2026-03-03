import {
    DEFAULT_CLIENT_VERSION,
    DEFAULT_EDITOR_NAME,
    HEADER_EDITOR_NAME,
    HEADER_MODE,
    HEADER_ORGANIZATION_ID,
} from '@/app/backend/providers/kiloGatewayClient/constants';

export type GatewayErrorCategory = 'auth' | 'rate_limit' | 'upstream' | 'schema' | 'network';

export class KiloGatewayError extends Error {
    readonly category: GatewayErrorCategory;
    readonly statusCode: number | undefined;
    readonly endpoint: string;

    constructor(input: { message: string; category: GatewayErrorCategory; endpoint: string; statusCode?: number }) {
        super(input.message);
        this.name = 'KiloGatewayError';
        this.category = input.category;
        this.endpoint = input.endpoint;
        this.statusCode = input.statusCode;
    }
}

export interface RequestHeadersInput {
    accessToken?: string;
    organizationId?: string;
    mode?: string;
}

export interface ExecuteRequestInput {
    endpoint: string;
    method?: 'GET' | 'POST';
    timeoutMs: number;
    headers?: RequestHeadersInput;
    body?: unknown;
}

export interface ExecuteRequestOutput<TPayload> {
    payload: TPayload;
    statusCode: number;
}

function buildHeaders(input?: RequestHeadersInput): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'neonconductor-gateway-client',
        [HEADER_EDITOR_NAME]: DEFAULT_EDITOR_NAME,
        'X-NeonConductor-Client-Version': DEFAULT_CLIENT_VERSION,
    };

    if (input?.accessToken) {
        headers['Authorization'] = `Bearer ${input.accessToken}`;
    }

    if (input?.organizationId) {
        headers[HEADER_ORGANIZATION_ID] = input.organizationId;
    }

    if (input?.mode) {
        headers[HEADER_MODE] = input.mode;
    }

    return headers;
}

function mapStatusToCategory(statusCode: number): GatewayErrorCategory {
    if (statusCode === 401 || statusCode === 403) {
        return 'auth';
    }

    if (statusCode === 429) {
        return 'rate_limit';
    }

    if (statusCode >= 500) {
        return 'upstream';
    }

    return 'upstream';
}

export async function executeJsonRequest<TPayload>(
    input: ExecuteRequestInput
): Promise<ExecuteRequestOutput<TPayload>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, input.timeoutMs);

    try {
        const requestInit: RequestInit = {
            method: input.method ?? 'GET',
            headers: buildHeaders(input.headers),
            signal: controller.signal,
            ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
        };
        const response = await fetch(input.endpoint, requestInit);

        if (!response.ok) {
            throw new KiloGatewayError({
                message: `Gateway request failed: ${response.status.toString()} ${response.statusText}`,
                category: mapStatusToCategory(response.status),
                endpoint: input.endpoint,
                statusCode: response.status,
            });
        }

        try {
            const payload = (await response.json()) as TPayload;
            return {
                payload,
                statusCode: response.status,
            };
        } catch (error) {
            throw new KiloGatewayError({
                message: error instanceof Error ? error.message : 'Failed to parse JSON payload.',
                category: 'schema',
                endpoint: input.endpoint,
                statusCode: response.status,
            });
        }
    } catch (error) {
        if (error instanceof KiloGatewayError) {
            throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
            throw new KiloGatewayError({
                message: `Gateway request timed out after ${input.timeoutMs.toString()}ms.`,
                category: 'network',
                endpoint: input.endpoint,
            });
        }

        throw new KiloGatewayError({
            message: error instanceof Error ? error.message : 'Network request failed.',
            category: 'network',
            endpoint: input.endpoint,
        });
    } finally {
        clearTimeout(timeout);
    }
}

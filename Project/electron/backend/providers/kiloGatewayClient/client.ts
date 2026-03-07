import { err, ok, type Result } from 'neverthrow';

import {
    KILO_API_BASE_URL,
    KILO_GATEWAY_BASE_URL,
    KILO_GATEWAY_TIMEOUT_MS,
} from '@/app/backend/providers/kiloGatewayClient/constants';
import {
    parseDeviceCodePayload,
    parseDeviceCodeStatusPayload,
} from '@/app/backend/providers/kiloGatewayClient/parse/deviceAuth';
import {
    parseModelsByProviderPayload,
    parseModelsPayload,
    parseProvidersPayload,
} from '@/app/backend/providers/kiloGatewayClient/parse/discovery';
import {
    parseBalancePayload,
    parseDefaultsPayload,
    parseProfilePayload,
} from '@/app/backend/providers/kiloGatewayClient/parse/profile';
import {
    executeJsonRequest,
    KiloGatewayError,
    type GatewayErrorCategory,
    type GatewayErrorShape,
    type RequestHeadersInput,
} from '@/app/backend/providers/kiloGatewayClient/requestExecutor';
import type {
    KiloDefaultsResponse,
    KiloDeviceCodeResponse,
    KiloDeviceCodeStatusResponse,
    KiloGatewayModel,
    KiloGatewayModelsByProvider,
    KiloGatewayProvider,
    KiloProfileBalanceResponse,
    KiloProfileResponse,
} from '@/app/backend/providers/kiloGatewayClient/types';

export type KiloGatewayResult<T> = Result<T, GatewayErrorShape>;

export class KiloGatewayClient {
    private readonly gatewayBaseUrl: string;
    private readonly apiBaseUrl: string;
    private readonly timeoutMs: number;

    constructor(input?: { gatewayBaseUrl?: string; apiBaseUrl?: string; timeoutMs?: number }) {
        this.gatewayBaseUrl = input?.gatewayBaseUrl ?? KILO_GATEWAY_BASE_URL;
        this.apiBaseUrl = input?.apiBaseUrl ?? KILO_API_BASE_URL;
        this.timeoutMs = input?.timeoutMs ?? KILO_GATEWAY_TIMEOUT_MS;
    }

    private toGatewayError(error: unknown, endpoint: string): GatewayErrorShape {
        if (error instanceof KiloGatewayError) {
            return {
                code: error.category === 'network' ? 'network_error' : 'schema_error',
                category: error.category,
                message: error.message,
                endpoint: error.endpoint || endpoint,
                ...(error.statusCode !== undefined ? { statusCode: error.statusCode } : {}),
            };
        }

        if (error instanceof Error) {
            return {
                code: 'schema_error',
                category: 'schema',
                message: error.message,
                endpoint,
            };
        }

        return {
            code: 'schema_error',
            category: 'schema',
            message: 'Unknown gateway parse failure.',
            endpoint,
        };
    }

    private async fetchGateway(path: string, headers?: RequestHeadersInput): Promise<KiloGatewayResult<Record<string, unknown>>> {
        const endpoint = `${this.gatewayBaseUrl}${path}`;
        const requestInput = {
            endpoint,
            timeoutMs: this.timeoutMs,
            ...(headers ? { headers } : {}),
        };
        const result = await executeJsonRequest(requestInput);
        if (result.isErr()) {
            return err(result.error);
        }
        return ok(result.value.payload);
    }

    private async fetchApi(
        path: string,
        input?: { method?: 'GET' | 'POST'; headers?: RequestHeadersInput; body?: unknown }
    ): Promise<KiloGatewayResult<Record<string, unknown>>> {
        const endpoint = `${this.apiBaseUrl}${path}`;
        const requestInput = {
            endpoint,
            method: input?.method ?? 'GET',
            timeoutMs: this.timeoutMs,
            ...(input?.headers ? { headers: input.headers } : {}),
            ...(input?.body !== undefined ? { body: input.body } : {}),
        };
        const result = await executeJsonRequest(requestInput);
        if (result.isErr()) {
            return err(result.error);
        }
        return ok(result.value.payload);
    }

    private parsePayload<T>(input: {
        endpoint: string;
        payloadResult: KiloGatewayResult<Record<string, unknown>>;
        parse: (payload: Record<string, unknown>) => T;
    }): KiloGatewayResult<T> {
        if (input.payloadResult.isErr()) {
            return err(input.payloadResult.error);
        }

        try {
            return ok(input.parse(input.payloadResult.value));
        } catch (error) {
            return err(this.toGatewayError(error, input.endpoint));
        }
    }

    async getModels(headers?: RequestHeadersInput): Promise<KiloGatewayResult<KiloGatewayModel[]>> {
        return this.parsePayload({
            endpoint: `${this.gatewayBaseUrl}/models`,
            payloadResult: await this.fetchGateway('/models', headers),
            parse: parseModelsPayload,
        });
    }

    async getProviders(headers?: RequestHeadersInput): Promise<KiloGatewayResult<KiloGatewayProvider[]>> {
        return this.parsePayload({
            endpoint: `${this.gatewayBaseUrl}/providers`,
            payloadResult: await this.fetchGateway('/providers', headers),
            parse: parseProvidersPayload,
        });
    }

    async getModelsByProvider(headers?: RequestHeadersInput): Promise<KiloGatewayResult<KiloGatewayModelsByProvider[]>> {
        return this.parsePayload({
            endpoint: `${this.gatewayBaseUrl}/models-by-provider`,
            payloadResult: await this.fetchGateway('/models-by-provider', headers),
            parse: parseModelsByProviderPayload,
        });
    }

    async getProfile(headers: RequestHeadersInput): Promise<KiloGatewayResult<KiloProfileResponse>> {
        return this.parsePayload({
            endpoint: `${this.apiBaseUrl}/api/profile`,
            payloadResult: await this.fetchApi('/api/profile', { headers }),
            parse: parseProfilePayload,
        });
    }

    async getProfileBalance(headers: RequestHeadersInput): Promise<KiloGatewayResult<KiloProfileBalanceResponse>> {
        return this.parsePayload({
            endpoint: `${this.apiBaseUrl}/api/profile/balance`,
            payloadResult: await this.fetchApi('/api/profile/balance', { headers }),
            parse: parseBalancePayload,
        });
    }

    async getDefaults(headers: RequestHeadersInput): Promise<KiloGatewayResult<KiloDefaultsResponse>> {
        return this.parsePayload({
            endpoint: `${this.apiBaseUrl}/api/defaults`,
            payloadResult: await this.fetchApi('/api/defaults', { headers }),
            parse: parseDefaultsPayload,
        });
    }

    async getOrganizationDefaults(
        orgId: string,
        headers: RequestHeadersInput
    ): Promise<KiloGatewayResult<KiloDefaultsResponse>> {
        const path = `/api/organizations/${orgId}/defaults`;
        return this.parsePayload({
            endpoint: `${this.apiBaseUrl}${path}`,
            payloadResult: await this.fetchApi(path, { headers }),
            parse: parseDefaultsPayload,
        });
    }

    async createDeviceCode(): Promise<KiloGatewayResult<KiloDeviceCodeResponse>> {
        return this.parsePayload({
            endpoint: `${this.apiBaseUrl}/api/device-auth/codes`,
            payloadResult: await this.fetchApi('/api/device-auth/codes', {
                method: 'POST',
                body: {},
            }),
            parse: parseDeviceCodePayload,
        });
    }

    async getDeviceCodeStatus(code: string): Promise<KiloGatewayResult<KiloDeviceCodeStatusResponse>> {
        const safeCode = encodeURIComponent(code);
        const path = `/api/device-auth/codes/${safeCode}`;
        return this.parsePayload({
            endpoint: `${this.apiBaseUrl}${path}`,
            payloadResult: await this.fetchApi(path),
            parse: parseDeviceCodeStatusPayload,
        });
    }
}

export const kiloGatewayClient = new KiloGatewayClient();
export { KiloGatewayError };
export type { GatewayErrorCategory };

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
import { executeJsonRequest } from '@/app/backend/providers/kiloGatewayClient/requestExecutor';
import type { RequestHeadersInput } from '@/app/backend/providers/kiloGatewayClient/requestExecutor';
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

export class KiloGatewayClient {
    private readonly gatewayBaseUrl: string;
    private readonly apiBaseUrl: string;
    private readonly timeoutMs: number;

    constructor(input?: { gatewayBaseUrl?: string; apiBaseUrl?: string; timeoutMs?: number }) {
        this.gatewayBaseUrl = input?.gatewayBaseUrl ?? KILO_GATEWAY_BASE_URL;
        this.apiBaseUrl = input?.apiBaseUrl ?? KILO_API_BASE_URL;
        this.timeoutMs = input?.timeoutMs ?? KILO_GATEWAY_TIMEOUT_MS;
    }

    private async fetchGateway(path: string, headers?: RequestHeadersInput): Promise<Record<string, unknown>> {
        const endpoint = `${this.gatewayBaseUrl}${path}`;
        const requestInput = {
            endpoint,
            timeoutMs: this.timeoutMs,
            ...(headers ? { headers } : {}),
        };
        const result = await executeJsonRequest<Record<string, unknown>>(requestInput);
        return result.payload;
    }

    private async fetchApi(
        path: string,
        input?: { method?: 'GET' | 'POST'; headers?: RequestHeadersInput; body?: unknown }
    ): Promise<Record<string, unknown>> {
        const endpoint = `${this.apiBaseUrl}${path}`;
        const requestInput = {
            endpoint,
            method: input?.method ?? 'GET',
            timeoutMs: this.timeoutMs,
            ...(input?.headers ? { headers: input.headers } : {}),
            ...(input?.body !== undefined ? { body: input.body } : {}),
        };
        const result = await executeJsonRequest<Record<string, unknown>>(requestInput);
        return result.payload;
    }

    async getModels(headers?: RequestHeadersInput): Promise<KiloGatewayModel[]> {
        const payload = await this.fetchGateway('/models', headers);
        return parseModelsPayload(payload);
    }

    async getProviders(headers?: RequestHeadersInput): Promise<KiloGatewayProvider[]> {
        const payload = await this.fetchGateway('/providers', headers);
        return parseProvidersPayload(payload);
    }

    async getModelsByProvider(headers?: RequestHeadersInput): Promise<KiloGatewayModelsByProvider[]> {
        const payload = await this.fetchGateway('/models-by-provider', headers);
        return parseModelsByProviderPayload(payload);
    }

    async getProfile(headers: RequestHeadersInput): Promise<KiloProfileResponse> {
        const payload = await this.fetchApi('/api/profile', { headers });
        return parseProfilePayload(payload);
    }

    async getProfileBalance(headers: RequestHeadersInput): Promise<KiloProfileBalanceResponse> {
        const payload = await this.fetchApi('/api/profile/balance', { headers });
        return parseBalancePayload(payload);
    }

    async getDefaults(headers: RequestHeadersInput): Promise<KiloDefaultsResponse> {
        const payload = await this.fetchApi('/api/defaults', { headers });
        return parseDefaultsPayload(payload);
    }

    async getOrganizationDefaults(orgId: string, headers: RequestHeadersInput): Promise<KiloDefaultsResponse> {
        const payload = await this.fetchApi(`/api/organizations/${orgId}/defaults`, { headers });
        return parseDefaultsPayload(payload);
    }

    async createDeviceCode(): Promise<KiloDeviceCodeResponse> {
        const payload = await this.fetchApi('/api/device-auth/codes', {
            method: 'POST',
            body: {},
        });

        return parseDeviceCodePayload(payload);
    }

    async getDeviceCodeStatus(code: string): Promise<KiloDeviceCodeStatusResponse> {
        const safeCode = encodeURIComponent(code);
        const payload = await this.fetchApi(`/api/device-auth/codes/${safeCode}`);
        return parseDeviceCodeStatusPayload(payload);
    }
}

export const kiloGatewayClient = new KiloGatewayClient();

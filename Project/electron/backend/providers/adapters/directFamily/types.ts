import type { ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

export interface DirectFamilyRuntimeConfig {
    providerId: ProviderRuntimeInput['providerId'];
    modelPrefix: string;
    label: string;
}

export interface DirectFamilyRuntimePathContext {
    providerId: ProviderRuntimeInput['providerId'];
    resolvedBaseUrl: string | null;
}

export interface DirectFamilyRuntimeRequest {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
}

export interface DirectFamilyRuntimeRequestInput {
    runtimeInput: ProviderRuntimeInput;
    config: DirectFamilyRuntimeConfig;
    resolvedBaseUrl: string;
    stream: boolean;
}

export interface DirectFamilyRuntimeConsumeInput {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}

export interface DirectFamilyRuntimePayloadInput {
    payload: unknown;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}

export interface DirectFamilyRuntimeHandler {
    toolProtocol: Extract<
        ProviderRuntimeInput['runtime']['toolProtocol'],
        'anthropic_messages' | 'google_generativeai'
    >;
    familyLabel: string;
    supportsContext: (input: DirectFamilyRuntimePathContext) => boolean;
    incompatibleContextMessage: (input: {
        runtimeInput: ProviderRuntimeInput;
        config: DirectFamilyRuntimeConfig;
    }) => string;
    validateAuth: (input: {
        runtimeInput: ProviderRuntimeInput;
        config: DirectFamilyRuntimeConfig;
    }) => ProviderAdapterResult<void>;
    buildRequest: (input: DirectFamilyRuntimeRequestInput) => DirectFamilyRuntimeRequest;
    consumeStreamResponse: (input: DirectFamilyRuntimeConsumeInput) => Promise<ProviderAdapterResult<void>>;
    emitPayload: (input: DirectFamilyRuntimePayloadInput) => Promise<ProviderAdapterResult<void>>;
}

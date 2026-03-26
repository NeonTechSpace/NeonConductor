import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { executeHttpFallback } from '@/app/backend/providers/adapters/httpFallback';
import {
    consumeKiloAnthropicRoutedStreamResponse,
    emitKiloAnthropicRoutedPayload,
} from '@/app/backend/providers/adapters/kilo/anthropicRouted';
import {
    buildKiloGeminiRoutedBody,
    consumeKiloGeminiRoutedStreamResponse,
    emitKiloGeminiRoutedPayload,
} from '@/app/backend/providers/adapters/kilo/geminiRouted';
import {
    buildKiloRuntimeBody,
    buildKiloRuntimeHeaders,
    resolveKiloRuntimeAuthToken,
} from '@/app/backend/providers/adapters/kilo/headers';
import { unsupportedProviderNativeRuntime } from '@/app/backend/providers/adapters/providerNative';
import {
    emitRuntimeLifecycleSelection,
    failRuntimeAdapter,
    mapHttpFallbackFailureStage,
} from '@/app/backend/providers/adapters/runtimeLifecycle';
import { parseChatCompletionsPayload } from '@/app/backend/providers/adapters/runtimePayload';
import { consumeChatCompletionsStreamResponse, emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import { KILO_GATEWAY_BASE_URL } from '@/app/backend/providers/kiloGatewayClient/constants';
import { getRuntimeFamilyDefinition, resolveRuntimeFamilyExecutionPath } from '@/app/backend/providers/runtimeFamilies';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

type KiloRoutedRuntimeFamily = 'openai_compatible' | 'anthropic_messages' | 'google_generativeai';

interface KiloRoutedRuntimeHandler {
    buildBody: (input: ProviderRuntimeInput) => Record<string, unknown>;
    emitStreamResponse: (input: {
        response: Response;
        handlers: ProviderRuntimeHandlers;
        startedAt: number;
        runtimeInput: ProviderRuntimeInput;
    }) => Promise<ProviderAdapterResult<void>>;
    emitPayload: (input: {
        payload: unknown;
        handlers: ProviderRuntimeHandlers;
        startedAt: number;
        runtimeInput: ProviderRuntimeInput;
    }) => Promise<ProviderAdapterResult<void>>;
}

function failKiloRuntime(
    input: ProviderRuntimeInput,
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    return failRuntimeAdapter({
        input,
        logTag: 'provider.kilo',
        runtimeLabel: 'Kilo runtime',
        context,
        code,
        error,
    });
}

function resolveKiloRoutedRuntimeFamily(input: ProviderRuntimeInput): ProviderAdapterResult<KiloRoutedRuntimeFamily> {
    if (input.runtime.toolProtocol !== 'kilo_gateway') {
        return errProviderAdapter(
            'invalid_payload',
            `Model "${input.modelId}" declares unsupported Kilo protocol "${input.runtime.toolProtocol}".`
        );
    }

    if (input.runtime.routedApiFamily === 'openai_compatible' || input.runtime.routedApiFamily === 'anthropic_messages') {
        return okProviderAdapter(input.runtime.routedApiFamily);
    }

    return okProviderAdapter(input.runtime.routedApiFamily);
}

const kiloRoutedRuntimeHandlers: Record<KiloRoutedRuntimeFamily, KiloRoutedRuntimeHandler> = {
    openai_compatible: {
        buildBody: (input) => buildKiloRuntimeBody(input),
        emitStreamResponse: async (input) =>
            consumeChatCompletionsStreamResponse({
                response: input.response,
                handlers: input.handlers,
                startedAt: input.startedAt,
            }),
        emitPayload: async (input) => {
            const parsed = parseChatCompletionsPayload(input.payload);
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }

            return emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
        },
    },
    anthropic_messages: {
        buildBody: (input) => buildKiloRuntimeBody(input),
        emitStreamResponse: async (input) =>
            consumeKiloAnthropicRoutedStreamResponse({
                response: input.response,
                handlers: input.handlers,
                startedAt: input.startedAt,
                includeEncrypted: input.runtimeInput.runtimeOptions.reasoning.includeEncrypted,
            }),
        emitPayload: async (input) =>
            emitKiloAnthropicRoutedPayload({
                payload: input.payload,
                handlers: input.handlers,
                startedAt: input.startedAt,
                includeEncrypted: input.runtimeInput.runtimeOptions.reasoning.includeEncrypted,
            }),
    },
    google_generativeai: {
        buildBody: (input) => buildKiloGeminiRoutedBody(input),
        emitStreamResponse: async (input) =>
            consumeKiloGeminiRoutedStreamResponse({
                response: input.response,
                handlers: input.handlers,
                startedAt: input.startedAt,
                includeEncrypted: input.runtimeInput.runtimeOptions.reasoning.includeEncrypted,
            }),
        emitPayload: async (input) =>
            emitKiloGeminiRoutedPayload({
                payload: input.payload,
                handlers: input.handlers,
                startedAt: input.startedAt,
                includeEncrypted: input.runtimeInput.runtimeOptions.reasoning.includeEncrypted,
            }),
    },
};

export async function streamKiloRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    const executionPath = resolveRuntimeFamilyExecutionPath(input.runtime.toolProtocol);

    if (executionPath === 'provider_native') {
        return unsupportedProviderNativeRuntime(input);
    }

    if (executionPath !== 'kilo_gateway') {
        return failKiloRuntime(
            input,
            'protocol dispatch',
            'invalid_payload',
            `Model "${input.modelId}" declares unsupported protocol "${input.runtime.toolProtocol}" for the Kilo adapter.`
        );
    }

    const routedFamilyResult = resolveKiloRoutedRuntimeFamily(input);
    if (routedFamilyResult.isErr()) {
        return failKiloRuntime(
            input,
            'routed family dispatch',
            routedFamilyResult.error.code,
            routedFamilyResult.error.message
        );
    }
    const routedFamily = routedFamilyResult.value;
    const routedHandler = kiloRoutedRuntimeHandlers[routedFamily];

    const tokenResult = resolveKiloRuntimeAuthToken(input);
    if (tokenResult.isErr()) {
        return failKiloRuntime(input, 'auth resolution', tokenResult.error.code, tokenResult.error.message);
    }
    const token = tokenResult.value;
    const startedAt = Date.now();

    await emitRuntimeLifecycleSelection({
        handlers,
        transportSelection: {
            selected: getRuntimeFamilyDefinition('kilo_gateway').transportFamily,
            requested: input.runtimeOptions.transport.family,
            degraded: false,
        },
        cacheResult: input.cache,
    });

    const requestBody = routedHandler.buildBody(input);
    const requestHeaders = buildKiloRuntimeHeaders({
        token,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        modelId: input.modelId,
        ...(input.kiloModeHeader ? { kiloModeHeader: input.kiloModeHeader } : {}),
        ...(input.runtime.toolProtocol === 'kilo_gateway' ? { routedApiFamily: input.runtime.routedApiFamily } : {}),
        ...(input.cache.applied && input.cache.key
            ? {
                  cacheKey: input.cache.key,
              }
            : {}),
    });
    const execution = await executeHttpFallback({
        signal: input.signal,
        streamRequest: {
            url: `${KILO_GATEWAY_BASE_URL}/chat/completions`,
            headers: requestHeaders,
            body: requestBody,
        },
        fallbackRequest: {
            url: `${KILO_GATEWAY_BASE_URL}/chat/completions`,
            headers: requestHeaders,
            body: {
                ...requestBody,
                stream: false,
            },
        },
        consumeStreamResponse: (response) =>
            routedHandler.emitStreamResponse({
                response,
                handlers,
                startedAt,
                runtimeInput: input,
            }),
        emitPayload: (payload) =>
            routedHandler.emitPayload({
                payload,
                handlers,
                startedAt,
                runtimeInput: input,
            }),
        formatHttpFailure: ({ response }) =>
            `Kilo runtime completion failed: ${String(response.status)} ${response.statusText}`,
    });
    if (execution.isErr()) {
        return failKiloRuntime(
            input,
            mapHttpFallbackFailureStage(execution.error.stage),
            execution.error.code,
            execution.error.message
        );
    }

    return okProviderAdapter(undefined);
}

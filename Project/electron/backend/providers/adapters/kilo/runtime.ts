import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    buildKiloRuntimeBody,
    buildKiloRuntimeHeaders,
    resolveKiloRuntimeAuthToken,
} from '@/app/backend/providers/adapters/kilo/headers';
import { parseChatCompletionsPayload } from '@/app/backend/providers/adapters/runtimePayload';
import {
    consumeChatCompletionsStreamResponse,
    emitParsedCompletion,
    isEventStreamResponse,
} from '@/app/backend/providers/adapters/streaming';
import { KILO_GATEWAY_BASE_URL } from '@/app/backend/providers/kiloGatewayClient/constants';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';
import { appLog } from '@/app/main/logging';

function failKiloRuntime(
    input: ProviderRuntimeInput,
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    appLog.warn({
        tag: 'provider.kilo',
        message: `Kilo runtime ${context} failed.`,
        runId: input.runId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        modelId: input.modelId,
        code,
        error,
    });

    return errProviderAdapter('provider_request_failed', error);
}

function shouldRetryWithoutStreaming(status: number): boolean {
    return status === 400 || status === 404 || status === 405 || status === 415 || status === 422;
}

export async function streamKiloRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    const tokenResult = resolveKiloRuntimeAuthToken(input);
    if (tokenResult.isErr()) {
        return failKiloRuntime(input, 'auth resolution', tokenResult.error.code, tokenResult.error.message);
    }
    const token = tokenResult.value;
    const startedAt = Date.now();

    if (handlers.onTransportSelected) {
        await handlers.onTransportSelected({
            selected: 'chat_completions',
            requested: input.runtimeOptions.transport.openai,
            degraded: false,
        });
    }
    if (handlers.onCacheResolved) {
        await handlers.onCacheResolved(input.cache);
    }

    let response: Response;
    try {
        response = await fetch(`${KILO_GATEWAY_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: buildKiloRuntimeHeaders({
                token,
                ...(input.organizationId ? { organizationId: input.organizationId } : {}),
                modelId: input.modelId,
                ...(input.cache.applied && input.cache.key
                    ? {
                          cacheKey: input.cache.key,
                      }
                    : {}),
            }),
            body: JSON.stringify(buildKiloRuntimeBody(input)),
            signal: input.signal,
        });
    } catch (error) {
        return failKiloRuntime(
            input,
            'request',
            'provider_request_unavailable',
            error instanceof Error ? error.message : 'Kilo runtime request failed before receiving a response.'
        );
    }

    if (!response.ok) {
        if (!shouldRetryWithoutStreaming(response.status)) {
            return failKiloRuntime(
                input,
                'request',
                'provider_request_failed',
                `Kilo runtime completion failed: ${String(response.status)} ${response.statusText}`
            );
        }

        try {
            response = await fetch(`${KILO_GATEWAY_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: buildKiloRuntimeHeaders({
                    token,
                    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
                    modelId: input.modelId,
                    ...(input.cache.applied && input.cache.key
                        ? {
                              cacheKey: input.cache.key,
                          }
                        : {}),
                }),
                body: JSON.stringify({
                    ...buildKiloRuntimeBody(input),
                    stream: false,
                }),
                signal: input.signal,
            });
        } catch (error) {
            return failKiloRuntime(
                input,
                'request fallback',
                'provider_request_unavailable',
                error instanceof Error ? error.message : 'Kilo runtime request failed before receiving a response.'
            );
        }

        if (!response.ok) {
            return failKiloRuntime(
                input,
                'request fallback',
                'provider_request_failed',
                `Kilo runtime completion failed: ${String(response.status)} ${response.statusText}`
            );
        }
    }

    if (isEventStreamResponse(response)) {
        const streamed = await consumeChatCompletionsStreamResponse({
            response,
            handlers,
            startedAt,
        });
        if (streamed.isErr()) {
            return failKiloRuntime(input, 'payload parse', streamed.error.code, streamed.error.message);
        }
        return okProviderAdapter(undefined);
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }
    const parsed = parseChatCompletionsPayload(payload);
    if (parsed.isErr()) {
        return failKiloRuntime(input, 'payload parse', parsed.error.code, parsed.error.message);
    }
    return emitParsedCompletion(parsed.value, handlers, startedAt);
}

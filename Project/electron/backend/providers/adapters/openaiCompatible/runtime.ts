import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    consumeChatCompletionsStreamResponse,
    consumeResponsesStreamResponse,
    emitParsedCompletion,
    isEventStreamResponse,
} from '@/app/backend/providers/adapters/streaming';
import {
    parseChatCompletionsPayload,
    parseResponsesPayload,
} from '@/app/backend/providers/adapters/runtimePayload';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';
import { appLog } from '@/app/main/logging';

interface HttpResponseResult {
    ok: boolean;
    status: number;
    statusText: string;
    response: Response;
}

interface OpenAICompatibleRuntimeConfig {
    providerId: string;
    modelPrefix: string;
    label: string;
    resolveEndpoints: (
        input: ProviderRuntimeInput
    ) =>
        | Promise<{ chatCompletionsUrl: string; responsesUrl: string }>
        | { chatCompletionsUrl: string; responsesUrl: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function toUpstreamModelId(modelId: string, modelPrefix: string): string {
    return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}

function resolveAuthToken(input: ProviderRuntimeInput, label: string): ProviderAdapterResult<string> {
    const token = input.accessToken ?? input.apiKey;
    if (!token) {
        return errProviderAdapter('auth_missing', `${label} runtime execution requires API key or OAuth access token.`);
    }

    return okProviderAdapter(token);
}

async function fetchJson(input: {
    url: string;
    token: string;
    body: Record<string, unknown>;
    signal: AbortSignal;
}): Promise<ProviderAdapterResult<HttpResponseResult>> {
    try {
        const response = await fetch(input.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${input.token}`,
                Accept: 'text/event-stream, application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input.body),
            signal: input.signal,
        });

        return okProviderAdapter({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            response,
        });
    } catch (error) {
        return errProviderAdapter(
            'provider_request_unavailable',
            error instanceof Error ? error.message : 'Provider runtime request failed before receiving a response.'
        );
    }
}

async function readJsonPayload(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

async function fetchStreamingResponse(input: {
    url: string;
    token: string;
    body: Record<string, unknown>;
    signal: AbortSignal;
}): Promise<ProviderAdapterResult<HttpResponseResult>> {
    return fetchJson(input);
}

function mapReasoningEffort(
    input: ProviderRuntimeInput['runtimeOptions']['reasoning']['effort']
): 'minimal' | 'low' | 'medium' | 'high' | undefined {
    if (input === 'none') {
        return undefined;
    }

    if (input === 'xhigh') {
        return 'high';
    }

    return input;
}

function shouldFallbackToChat(result: { status: number; payload: unknown }): boolean {
    if (result.status === 404 || result.status === 405 || result.status === 415) {
        return true;
    }

    if (result.status !== 400 && result.status !== 422) {
        return false;
    }

    if (!isRecord(result.payload)) {
        return false;
    }

    const errorField = result.payload['error'];
    if (!isRecord(errorField)) {
        return false;
    }

    const code = readOptionalString(errorField['code'])?.toLowerCase();
    const message = readOptionalString(errorField['message'])?.toLowerCase();
    const param = readOptionalString(errorField['param'])?.toLowerCase();

    if (code?.includes('unsupported')) {
        return true;
    }
    if (message?.includes('unsupported')) {
        return true;
    }
    if (message?.includes('responses')) {
        return true;
    }
    if (param?.includes('reasoning')) {
        return true;
    }

    return false;
}

function shouldRetryWithoutStreaming(status: number): boolean {
    return status === 400 || status === 404 || status === 405 || status === 415 || status === 422;
}

async function handleRuntimeResponse(input: {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    streamKind: 'responses' | 'chat_completions';
}): Promise<ProviderAdapterResult<void>> {
    if (isEventStreamResponse(input.response)) {
        return input.streamKind === 'responses'
            ? consumeResponsesStreamResponse(input)
            : consumeChatCompletionsStreamResponse(input);
    }

    const payload = await readJsonPayload(input.response);
    const parsed =
        input.streamKind === 'responses' ? parseResponsesPayload(payload) : parseChatCompletionsPayload(payload);
    if (parsed.isErr()) {
        return errProviderAdapter(parsed.error.code, parsed.error.message);
    }

    await emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
    return okProviderAdapter(undefined);
}

function buildResponsesBody(input: ProviderRuntimeInput, modelPrefix: string): Record<string, unknown> {
    const effort = mapReasoningEffort(input.runtimeOptions.reasoning.effort);
    const include = input.runtimeOptions.reasoning.includeEncrypted ? ['reasoning.encrypted_content'] : [];

    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [{ role: 'user' as const, parts: [{ type: 'text' as const, text: input.promptText }] }];

    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        stream: true,
        input: contextMessages.map((message) => ({
            role: message.role,
            content: message.parts.map((part) =>
                part.type === 'text'
                    ? {
                          type: 'input_text',
                          text: part.text,
                      }
                    : {
                          type: 'input_image',
                          image_url: part.dataUrl,
                      }
            ),
        })),
        reasoning: {
            summary: input.runtimeOptions.reasoning.summary,
            ...(effort ? { effort } : {}),
        },
    };

    if (include.length > 0) {
        body['include'] = include;
    }

    return body;
}

function buildChatCompletionsBody(input: ProviderRuntimeInput, modelPrefix: string): Record<string, unknown> {
    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [{ role: 'user' as const, parts: [{ type: 'text' as const, text: input.promptText }] }];

    return {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        messages: contextMessages.map((message) => ({
            role: message.role,
            content:
                message.parts.length === 1 && message.parts[0]?.type === 'text'
                    ? message.parts[0].text
                    : message.parts.map((part) =>
                          part.type === 'text'
                              ? {
                                    type: 'text',
                                    text: part.text,
                                }
                              : {
                                    type: 'image_url',
                                    image_url: {
                                        url: part.dataUrl,
                                    },
                                }
                      ),
        })),
        stream: true,
        stream_options: {
            include_usage: true,
        },
    };
}

function failWithLog(
    input: ProviderRuntimeInput,
    config: OpenAICompatibleRuntimeConfig,
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    appLog.warn({
        tag: `provider.${config.providerId}`,
        message: `${config.label} runtime ${context} failed.`,
        runId: input.runId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        modelId: input.modelId,
        code,
        error,
    });

    return errProviderAdapter('provider_request_failed', error);
}

export async function streamOpenAICompatibleRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: OpenAICompatibleRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    const tokenResult = resolveAuthToken(input, config.label);
    if (tokenResult.isErr()) {
        return failWithLog(input, config, 'auth resolution', tokenResult.error.code, tokenResult.error.message);
    }
    const token = tokenResult.value;
    const startedAt = Date.now();
    const endpoints = await config.resolveEndpoints(input);

    if (handlers.onCacheResolved) {
        await handlers.onCacheResolved(input.cache);
    }

    const forceChatTransport = input.runtimeOptions.transport.openai === 'chat';
    if (forceChatTransport) {
        if (handlers.onTransportSelected) {
            await handlers.onTransportSelected({
                selected: 'chat_completions',
                requested: input.runtimeOptions.transport.openai,
                degraded: false,
            });
        }

        const chatResult = await fetchStreamingResponse({
            url: endpoints.chatCompletionsUrl,
            token,
            body: buildChatCompletionsBody(input, config.modelPrefix),
            signal: input.signal,
        });
        if (chatResult.isErr()) {
            return failWithLog(input, config, 'chat request', chatResult.error.code, chatResult.error.message);
        }
        if (!chatResult.value.ok) {
            if (!shouldRetryWithoutStreaming(chatResult.value.status)) {
                return failWithLog(
                    input,
                    config,
                    'chat request',
                    'provider_request_failed',
                    `${config.label} chat completion failed: ${String(chatResult.value.status)} ${chatResult.value.statusText}`
                );
            }

            const fallbackChatResult = await fetchJson({
                url: endpoints.chatCompletionsUrl,
                token,
                body: {
                    ...buildChatCompletionsBody(input, config.modelPrefix),
                    stream: false,
                },
                signal: input.signal,
            });
            if (fallbackChatResult.isErr()) {
                return failWithLog(
                    input,
                    config,
                    'chat request fallback',
                    fallbackChatResult.error.code,
                    fallbackChatResult.error.message
                );
            }
            if (!fallbackChatResult.value.ok) {
                return failWithLog(
                    input,
                    config,
                    'chat request fallback',
                    'provider_request_failed',
                    `${config.label} chat completion failed: ${String(fallbackChatResult.value.status)} ${fallbackChatResult.value.statusText}`
                );
            }

            const parsedFallback = parseChatCompletionsPayload(await readJsonPayload(fallbackChatResult.value.response));
            if (parsedFallback.isErr()) {
                return failWithLog(
                    input,
                    config,
                    'chat payload parse fallback',
                    parsedFallback.error.code,
                    parsedFallback.error.message
                );
            }
            await emitParsedCompletion(parsedFallback.value, handlers, startedAt);
            return okProviderAdapter(undefined);
        }

        const handledChat = await handleRuntimeResponse({
            response: chatResult.value.response,
            handlers,
            startedAt,
            streamKind: 'chat_completions',
        });
        if (handledChat.isErr()) {
            return failWithLog(
                input,
                config,
                'chat payload parse',
                handledChat.error.code,
                handledChat.error.message
            );
        }
        return okProviderAdapter(undefined);
    }

    if (handlers.onTransportSelected) {
        await handlers.onTransportSelected({
            selected: 'responses',
            requested: input.runtimeOptions.transport.openai,
            degraded: false,
        });
    }

    const responsesResult = await fetchStreamingResponse({
        url: endpoints.responsesUrl,
        token,
        body: buildResponsesBody(input, config.modelPrefix),
        signal: input.signal,
    });
    if (responsesResult.isErr()) {
        return failWithLog(
            input,
            config,
            'responses request',
            responsesResult.error.code,
            responsesResult.error.message
        );
    }

    if (responsesResult.value.ok) {
        const handledResponses = await handleRuntimeResponse({
            response: responsesResult.value.response,
            handlers,
            startedAt,
            streamKind: 'responses',
        });
        if (handledResponses.isErr()) {
            return failWithLog(
                input,
                config,
                'responses payload parse',
                handledResponses.error.code,
                handledResponses.error.message
            );
        }
        return okProviderAdapter(undefined);
    }

    if (!shouldFallbackToChat({
        status: responsesResult.value.status,
        payload: await readJsonPayload(responsesResult.value.response),
    })) {
        return failWithLog(
            input,
            config,
            'responses request',
            'provider_request_failed',
            `${config.label} responses completion failed: ${String(responsesResult.value.status)} ${responsesResult.value.statusText}`
        );
    }

    if (handlers.onTransportSelected) {
        await handlers.onTransportSelected({
            selected: 'chat_completions',
            requested: input.runtimeOptions.transport.openai,
            degraded: true,
            degradedReason: 'responses_unsupported',
        });
    }

    const chatResult = await fetchStreamingResponse({
        url: endpoints.chatCompletionsUrl,
        token,
        body: buildChatCompletionsBody(input, config.modelPrefix),
        signal: input.signal,
    });
    if (chatResult.isErr()) {
        return failWithLog(input, config, 'chat fallback request', chatResult.error.code, chatResult.error.message);
    }
    if (!chatResult.value.ok) {
        if (!shouldRetryWithoutStreaming(chatResult.value.status)) {
            return failWithLog(
                input,
                config,
                'chat fallback request',
                'provider_request_failed',
                `${config.label} chat fallback failed: ${String(chatResult.value.status)} ${chatResult.value.statusText}`
            );
        }

        const fallbackChatResult = await fetchJson({
            url: endpoints.chatCompletionsUrl,
            token,
            body: {
                ...buildChatCompletionsBody(input, config.modelPrefix),
                stream: false,
            },
            signal: input.signal,
        });
        if (fallbackChatResult.isErr()) {
            return failWithLog(
                input,
                config,
                'chat fallback request',
                fallbackChatResult.error.code,
                fallbackChatResult.error.message
            );
        }
        if (!fallbackChatResult.value.ok) {
            return failWithLog(
                input,
                config,
                'chat fallback request',
                'provider_request_failed',
                `${config.label} chat fallback failed: ${String(fallbackChatResult.value.status)} ${fallbackChatResult.value.statusText}`
            );
        }

        const parsedFallback = parseChatCompletionsPayload(await readJsonPayload(fallbackChatResult.value.response));
        if (parsedFallback.isErr()) {
            return failWithLog(
                input,
                config,
                'chat fallback payload parse',
                parsedFallback.error.code,
                parsedFallback.error.message
            );
        }
        await emitParsedCompletion(parsedFallback.value, handlers, startedAt);
        return okProviderAdapter(undefined);
    }

    const handledChatFallback = await handleRuntimeResponse({
        response: chatResult.value.response,
        handlers,
        startedAt,
        streamKind: 'chat_completions',
    });
    if (handledChatFallback.isErr()) {
        return failWithLog(
            input,
            config,
            'chat fallback payload parse',
            handledChatFallback.error.code,
            handledChatFallback.error.message
        );
    }
    return okProviderAdapter(undefined);
}

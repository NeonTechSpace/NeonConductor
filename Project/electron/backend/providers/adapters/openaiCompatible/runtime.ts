import { streamDirectFamilyRuntime } from '@/app/backend/providers/adapters/directFamily/runtime';
import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { executeHttpFallback } from '@/app/backend/providers/adapters/httpFallback';
import { streamOpenAIRealtimeWebSocketRuntime } from '@/app/backend/providers/adapters/openaiCompatible/realtimeWebsocket';
import { streamProviderNativeRuntime } from '@/app/backend/providers/adapters/providerNative';
import {
    emitRuntimeLifecycleSelection,
    failRuntimeAdapter,
    mapHttpFallbackFailureStage,
} from '@/app/backend/providers/adapters/runtimeLifecycle';
import { parseChatCompletionsPayload, parseResponsesPayload } from '@/app/backend/providers/adapters/runtimePayload';
import {
    consumeChatCompletionsStreamResponse,
    consumeResponsesStreamResponse,
    emitParsedCompletion,
} from '@/app/backend/providers/adapters/streaming';
import { resolveRuntimeFamilyExecutionPath } from '@/app/backend/providers/runtimeFamilies';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

interface OpenAICompatibleRuntimeConfig {
    providerId: string;
    modelPrefix: string;
    label: string;
    resolveEndpoints: (
        input: ProviderRuntimeInput
    ) =>
        | Promise<{ chatCompletionsUrl: string; responsesUrl: string; baseUrl?: string }>
        | { chatCompletionsUrl: string; responsesUrl: string; baseUrl?: string };
}

function toUpstreamModelId(modelId: string, modelPrefix: string): string {
    return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}

function resolveAuthToken(input: ProviderRuntimeInput, label: string): ProviderAdapterResult<string> {
    const token = input.providerId === 'openai_codex' ? input.accessToken : input.apiKey;
    if (!token) {
        return errProviderAdapter(
            'auth_missing',
            input.providerId === 'openai_codex'
                ? `${label} runtime execution requires an OAuth access token.`
                : `${label} runtime execution requires an API key.`
        );
    }

    return okProviderAdapter(token);
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

async function executeChatProtocol(input: {
    runtimeInput: ProviderRuntimeInput;
    handlers: ProviderRuntimeHandlers;
    config: OpenAICompatibleRuntimeConfig;
    token: string;
    url: string;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    const streamBody = buildChatCompletionsBody(input.runtimeInput, input.config.modelPrefix);
    const authHeaders = {
        Authorization: `Bearer ${input.token}`,
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
    };
    const execution = await executeHttpFallback({
        signal: input.runtimeInput.signal,
        streamRequest: {
            url: input.url,
            headers: authHeaders,
            body: streamBody,
        },
        fallbackRequest: {
            url: input.url,
            headers: authHeaders,
            body: {
                ...streamBody,
                stream: false,
            },
        },
        consumeStreamResponse: (response) =>
            consumeChatCompletionsStreamResponse({
                response,
                handlers: input.handlers,
                startedAt: input.startedAt,
            }),
        emitPayload: async (payload) => {
            const parsed = parseChatCompletionsPayload(payload);
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }

            return emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
        },
        formatHttpFailure: ({ response }) =>
            `${input.config.label} chat completion failed: ${String(response.status)} ${response.statusText}`,
    });
    if (execution.isErr()) {
        return failWithLog(
            input.runtimeInput,
            input.config,
            mapHttpFallbackFailureStage(execution.error.stage),
            execution.error.code,
            execution.error.message
        );
    }

    return okProviderAdapter(undefined);
}

async function executeResponsesProtocol(input: {
    runtimeInput: ProviderRuntimeInput;
    handlers: ProviderRuntimeHandlers;
    config: OpenAICompatibleRuntimeConfig;
    token: string;
    url: string;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    const streamBody = buildResponsesBody(input.runtimeInput, input.config.modelPrefix);
    const authHeaders = {
        Authorization: `Bearer ${input.token}`,
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
    };
    const execution = await executeHttpFallback({
        signal: input.runtimeInput.signal,
        streamRequest: {
            url: input.url,
            headers: authHeaders,
            body: streamBody,
        },
        fallbackRequest: {
            url: input.url,
            headers: authHeaders,
            body: {
                ...streamBody,
                stream: false,
            },
        },
        consumeStreamResponse: (response) =>
            consumeResponsesStreamResponse({
                response,
                handlers: input.handlers,
                startedAt: input.startedAt,
            }),
        emitPayload: async (payload) => {
            const parsed = parseResponsesPayload(payload);
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }

            return emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
        },
        formatHttpFailure: ({ response }) =>
            `${input.config.label} responses completion failed: ${String(response.status)} ${response.statusText}`,
    });
    if (execution.isErr()) {
        return failWithLog(
            input.runtimeInput,
            input.config,
            mapHttpFallbackFailureStage(execution.error.stage),
            execution.error.code,
            execution.error.message
        );
    }

    return okProviderAdapter(undefined);
}

function buildResponsesBody(input: ProviderRuntimeInput, modelPrefix: string): Record<string, unknown> {
    const effort = mapReasoningEffort(input.runtimeOptions.reasoning.effort);
    const include = input.runtimeOptions.reasoning.includeEncrypted ? ['reasoning.encrypted_content'] : [];

    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [{ role: 'user' as const, parts: [{ type: 'text' as const, text: input.promptText }] }];

    const responseInputItems = contextMessages.flatMap((message) => {
        const textAndImageParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'text' | 'image' }> =>
                part.type === 'text' || part.type === 'image'
        );
        const toolCallParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'tool_call' }> => part.type === 'tool_call'
        );
        const toolResultParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'tool_result' }> =>
                part.type === 'tool_result'
        );

        const items: Array<Record<string, unknown>> = [];
        if (textAndImageParts.length > 0) {
            items.push({
                role: message.role,
                content: textAndImageParts.map((part) =>
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
            });
        }

        for (const toolCallPart of toolCallParts) {
            items.push({
                type: 'function_call',
                call_id: toolCallPart.callId,
                name: toolCallPart.toolName,
                arguments: toolCallPart.argumentsText,
            });
        }

        for (const toolResultPart of toolResultParts) {
            items.push({
                type: 'function_call_output',
                call_id: toolResultPart.callId,
                output: toolResultPart.outputText,
            });
        }

        return items;
    });

    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        stream: true,
        input: responseInputItems,
        reasoning: {
            summary: input.runtimeOptions.reasoning.summary,
            ...(effort ? { effort } : {}),
        },
    };

    if (input.tools && input.tools.length > 0) {
        body['tools'] = input.tools.map((tool) => ({
            type: 'function',
            name: tool.id,
            description: tool.description,
            parameters: tool.inputSchema,
        }));
        body['tool_choice'] = input.toolChoice ?? 'auto';
    }

    if (include.length > 0) {
        body['include'] = include;
    }

    return body;
}

function buildChatCompletionsBody(input: ProviderRuntimeInput, modelPrefix: string): Record<string, unknown> {
    type ChatCompletionRequestMessage =
        | {
              role: 'tool';
              tool_call_id: string;
              content: string;
          }
        | {
              role: 'system' | 'user' | 'assistant';
              content:
                  | string
                  | Array<
                        | {
                              type: 'text';
                              text: string;
                          }
                        | {
                              type: 'image_url';
                              image_url: {
                                  url: string;
                              };
                          }
                    >
                  | null;
              tool_calls?: Array<{
                  id: string;
                  type: 'function';
                  function: {
                      name: string;
                      arguments: string;
                  };
              }>;
          };

    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [{ role: 'user' as const, parts: [{ type: 'text' as const, text: input.promptText }] }];

    const messages: ChatCompletionRequestMessage[] = [];
    for (const message of contextMessages) {
        if (message.role === 'tool') {
            const toolMessages = message.parts
                .filter(
                    (part): part is Extract<(typeof message.parts)[number], { type: 'tool_result' }> =>
                        part.type === 'tool_result'
                )
                .map((part) => ({
                    role: 'tool' as const,
                    tool_call_id: part.callId,
                    content: part.outputText,
                }));
            messages.push(...toolMessages);
            continue;
        }

        const contentParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'text' | 'image' }> =>
                part.type === 'text' || part.type === 'image'
        );
        const toolCallParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'tool_call' }> => part.type === 'tool_call'
        );
        const content =
            contentParts.length === 0
                ? null
                : contentParts.length === 1 && contentParts[0]?.type === 'text'
                  ? contentParts[0].text
                  : contentParts.map((part) =>
                        part.type === 'text'
                            ? {
                                  type: 'text' as const,
                                  text: part.text,
                              }
                            : {
                                  type: 'image_url' as const,
                                  image_url: {
                                      url: part.dataUrl,
                                  },
                              }
                    );

        messages.push({
            role: message.role,
            content,
            ...(toolCallParts.length > 0
                ? {
                      tool_calls: toolCallParts.map((part) => ({
                          id: part.callId,
                          type: 'function' as const,
                          function: {
                              name: part.toolName,
                              arguments: part.argumentsText,
                          },
                      })),
                  }
                : {}),
        });
    }

    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        messages,
        stream: true,
        stream_options: {
            include_usage: true,
        },
    };

    if (input.tools && input.tools.length > 0) {
        body['tools'] = input.tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.id,
                description: tool.description,
                parameters: tool.inputSchema,
            },
        }));
        body['tool_choice'] = input.toolChoice ?? 'auto';
    }

    return body;
}

function failWithLog(
    input: ProviderRuntimeInput,
    config: OpenAICompatibleRuntimeConfig,
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    return failRuntimeAdapter({
        input,
        logTag: `provider.${config.providerId}`,
        runtimeLabel: `${config.label} runtime`,
        context,
        code,
        error,
    });
}

export async function streamOpenAICompatibleRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: OpenAICompatibleRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    const executionPath = resolveRuntimeFamilyExecutionPath(input.runtime.toolProtocol);

    if (executionPath === 'provider_native') {
        return streamProviderNativeRuntime(input, handlers);
    }

    if (executionPath === 'direct_family') {
        return streamDirectFamilyRuntime(input, handlers, {
            providerId: input.providerId,
            modelPrefix: config.modelPrefix,
            label: config.label,
        });
    }

    const tokenResult = resolveAuthToken(input, config.label);
    if (tokenResult.isErr()) {
        return failWithLog(input, config, 'auth resolution', tokenResult.error.code, tokenResult.error.message);
    }
    const token = tokenResult.value;
    const startedAt = Date.now();
    const endpoints = await config.resolveEndpoints(input);

    if (config.providerId === 'openai' && input.runtimeOptions.execution.openAIExecutionMode === 'realtime_websocket') {
        if (!endpoints.baseUrl) {
            return failWithLog(
                input,
                config,
                'realtime websocket',
                'request_failed',
                'OpenAI Realtime WebSocket execution requires a resolved OpenAI base URL.'
            );
        }

        await emitRuntimeLifecycleSelection({
            handlers,
            transportSelection: {
                selected: 'openai_realtime_websocket',
                requested: input.runtimeOptions.transport.family,
                degraded: false,
            },
            cacheResult: input.cache,
        });

        const result = await streamOpenAIRealtimeWebSocketRuntime({
            runtimeInput: input,
            handlers,
            baseUrl: endpoints.baseUrl,
            token,
            startedAt,
        });
        if (result.isErr()) {
            return failWithLog(input, config, 'realtime websocket', result.error.code, result.error.message);
        }

        return okProviderAdapter(undefined);
    }

    if (input.runtime.toolProtocol === 'openai_chat_completions') {
        await emitRuntimeLifecycleSelection({
            handlers,
            transportSelection: {
                selected: 'openai_chat_completions',
                requested: input.runtimeOptions.transport.family,
                degraded: false,
            },
            cacheResult: input.cache,
        });

        return executeChatProtocol({
            runtimeInput: input,
            handlers,
            config,
            token,
            url: endpoints.chatCompletionsUrl,
            startedAt,
        });
    }

    if (input.runtime.toolProtocol === 'openai_responses') {
        await emitRuntimeLifecycleSelection({
            handlers,
            transportSelection: {
                selected: 'openai_responses',
                requested: input.runtimeOptions.transport.family,
                degraded: false,
            },
            cacheResult: input.cache,
        });

        return executeResponsesProtocol({
            runtimeInput: input,
            handlers,
            config,
            token,
            url: endpoints.responsesUrl,
            startedAt,
        });
    }

    return failWithLog(
        input,
        config,
        'protocol dispatch',
        'invalid_payload',
        `Model "${input.modelId}" declares unsupported protocol "${input.runtime.toolProtocol}" for the OpenAI-compatible adapter.`
    );
}

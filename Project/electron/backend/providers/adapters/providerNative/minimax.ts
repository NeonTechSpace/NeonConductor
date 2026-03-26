import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { resolveOpenAIEndpoints } from '@/app/backend/providers/adapters/openai/endpoints';
import type {
    ProviderNativeCompatibilityContext,
    ProviderNativeHttpRequest,
    ProviderNativeRuntimeSpecialization,
    ProviderNativeStreamEventResult,
    ProviderNativeStreamState,
} from '@/app/backend/providers/adapters/providerNative';
import {
    parseChatCompletionsPayload,
    parseStructuredToolCall,
    type RuntimeParsedCompletion,
    type RuntimeParsedPart,
} from '@/app/backend/providers/adapters/runtimePayload';
import type { ProviderRuntimeInput, ProviderRuntimePart, ProviderRuntimeUsage } from '@/app/backend/providers/types';

interface MiniMaxToolCallAccumulator {
    index: number;
    callId?: string;
    toolName?: string;
    argumentsText: string;
}

interface MiniMaxStreamState extends ProviderNativeStreamState {
    textBuffer: string;
    reasoningBuffers: string[];
    toolCallAccumulators: Map<number, MiniMaxToolCallAccumulator>;
    emittedToolCallIds: Set<string>;
    terminalFrameSeen: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return value.length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeUsage(value: unknown): ProviderRuntimeUsage | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const usage: ProviderRuntimeUsage = {};
    const promptTokens = readOptionalNumber(value['prompt_tokens']);
    const completionTokens = readOptionalNumber(value['completion_tokens']);
    const inputTokens = readOptionalNumber(value['input_tokens']);
    const outputTokens = readOptionalNumber(value['output_tokens']);
    const totalTokens = readOptionalNumber(value['total_tokens']);

    if (promptTokens !== undefined) usage.inputTokens = promptTokens;
    if (completionTokens !== undefined) usage.outputTokens = completionTokens;
    if (inputTokens !== undefined) usage.inputTokens = inputTokens;
    if (outputTokens !== undefined) usage.outputTokens = outputTokens;
    if (totalTokens !== undefined) usage.totalTokens = totalTokens;

    return Object.keys(usage).length > 0 ? usage : undefined;
}

function diffCumulativeText(previousValue: string, nextValue: string): string {
    return nextValue.startsWith(previousValue) ? nextValue.slice(previousValue.length) : nextValue;
}

function extractReasoningText(entry: Record<string, unknown>): string | undefined {
    return (
        readOptionalString(entry['text']) ??
        readOptionalString(entry['content']) ??
        readOptionalString(entry['delta']) ??
        readOptionalString(entry['reasoning'])
    );
}

function classifyReasoningPart(entry: Record<string, unknown>): RuntimeParsedPart['partType'] {
    const type = readOptionalString(entry['type'])?.toLowerCase();
    return type?.includes('summary') ? 'reasoning_summary' : 'reasoning';
}

function parseReasoningDetailParts(value: unknown): RuntimeParsedPart[] {
    const details = Array.isArray(value) ? value : [];
    const parts: RuntimeParsedPart[] = [];

    for (const entry of details) {
        if (!isRecord(entry)) {
            continue;
        }

        const text = extractReasoningText(entry);
        if (!text) {
            continue;
        }

        parts.push({
            partType: classifyReasoningPart(entry),
            payload: { text },
        });
    }

    return parts;
}

function buildChatCompletionsBody(input: ProviderRuntimeInput): Record<string, unknown> {
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
            messages.push(
                ...message.parts
                    .filter(
                        (part): part is Extract<(typeof message.parts)[number], { type: 'tool_result' }> =>
                            part.type === 'tool_result'
                    )
                    .map((part) => ({
                        role: 'tool' as const,
                        tool_call_id: part.callId,
                        content: part.outputText,
                    }))
            );
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

    const upstreamModelId = input.modelId.startsWith('openai/') ? input.modelId.slice('openai/'.length) : input.modelId;
    const body: Record<string, unknown> = {
        model: upstreamModelId,
        messages,
        stream: true,
        stream_options: {
            include_usage: true,
        },
        reasoning_split: true,
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

function flushMiniMaxToolCalls(state: MiniMaxStreamState): ProviderAdapterResult<ProviderRuntimePart[]> {
    const toolCallParts: ProviderRuntimePart[] = [];

    for (const accumulator of [...state.toolCallAccumulators.values()].sort(
        (left, right) => left.index - right.index
    )) {
        const parsedPart = parseStructuredToolCall({
            callId: accumulator.callId,
            toolName: accumulator.toolName,
            argumentsText: accumulator.argumentsText,
            sourceLabel: 'MiniMax stream',
        });
        if (parsedPart.isErr()) {
            return errProviderAdapter(parsedPart.error.code, parsedPart.error.message);
        }

        const callId = parsedPart.value.payload['callId'];
        if (typeof callId !== 'string') {
            return errProviderAdapter(
                'invalid_payload',
                'MiniMax stream emitted a tool call without a stable call id.'
            );
        }

        if (state.emittedToolCallIds.has(callId)) {
            return errProviderAdapter('invalid_payload', `MiniMax stream emitted duplicate tool call id "${callId}".`);
        }

        state.emittedToolCallIds.add(callId);
        toolCallParts.push(parsedPart.value);
    }

    state.toolCallAccumulators.clear();
    return okProviderAdapter(toolCallParts);
}

function readToolCallAccumulatorById(
    state: MiniMaxStreamState,
    callId: string,
    excludeIndex: number
): MiniMaxToolCallAccumulator | undefined {
    for (const accumulator of state.toolCallAccumulators.values()) {
        if (accumulator.index !== excludeIndex && accumulator.callId === callId) {
            return accumulator;
        }
    }

    return undefined;
}

function accumulateMiniMaxToolCalls(
    payload: unknown,
    state: MiniMaxStreamState
): ProviderAdapterResult<{ shouldFlush: boolean }> {
    if (!isRecord(payload)) {
        return okProviderAdapter({ shouldFlush: false });
    }

    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    let shouldFlush = false;

    for (const choice of choices) {
        if (!isRecord(choice)) {
            continue;
        }

        const finishReason = readOptionalString(choice['finish_reason']);
        if (finishReason === 'tool_calls') {
            shouldFlush = true;
        }

        const delta = isRecord(choice['delta']) ? choice['delta'] : null;
        const rawToolCalls = Array.isArray(delta?.['tool_calls']) ? delta['tool_calls'] : [];
        for (const rawToolCall of rawToolCalls) {
            if (!isRecord(rawToolCall)) {
                continue;
            }

            const index = readOptionalNumber(rawToolCall['index']) ?? state.toolCallAccumulators.size;
            const current = state.toolCallAccumulators.get(index) ?? {
                index,
                argumentsText: '',
            };
            const functionRecord = isRecord(rawToolCall['function']) ? rawToolCall['function'] : null;
            const nextArguments = readOptionalString(functionRecord?.['arguments']) ?? '';
            const nextCallId = readOptionalString(rawToolCall['id']);
            const nextToolName = readOptionalString(functionRecord?.['name']);

            if (nextCallId && state.emittedToolCallIds.has(nextCallId)) {
                return errProviderAdapter(
                    'invalid_payload',
                    `MiniMax stream reused completed tool call id "${nextCallId}".`
                );
            }

            if (nextCallId && current.callId && current.callId !== nextCallId) {
                return errProviderAdapter(
                    'invalid_payload',
                    `MiniMax stream changed tool call id from "${current.callId}" to "${nextCallId}" for index ${String(index)}.`
                );
            }

            if (nextToolName && current.toolName && current.toolName !== nextToolName) {
                return errProviderAdapter(
                    'invalid_payload',
                    `MiniMax stream changed tool name from "${current.toolName}" to "${nextToolName}" for index ${String(index)}.`
                );
            }

            if (nextCallId) {
                const duplicateAccumulator = readToolCallAccumulatorById(state, nextCallId, index);
                if (duplicateAccumulator) {
                    return errProviderAdapter(
                        'invalid_payload',
                        `MiniMax stream emitted duplicate tool call id "${nextCallId}" across tool indices.`
                    );
                }
            }

            state.toolCallAccumulators.set(index, {
                ...current,
                ...(nextCallId ? { callId: nextCallId } : {}),
                ...(nextToolName ? { toolName: nextToolName } : {}),
                argumentsText: `${current.argumentsText}${nextArguments}`,
            });
        }
    }

    return okProviderAdapter({ shouldFlush });
}

function parseMiniMaxStreamParts(payload: unknown, state: MiniMaxStreamState): ProviderRuntimePart[] {
    if (!isRecord(payload)) {
        return [];
    }

    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    const parts: ProviderRuntimePart[] = [];

    for (const choice of choices) {
        if (!isRecord(choice)) {
            continue;
        }

        const delta = isRecord(choice['delta']) ? choice['delta'] : null;
        if (!delta) {
            continue;
        }

        const content = readOptionalString(delta['content']);
        if (content) {
            const nextText = diffCumulativeText(state.textBuffer, content);
            state.textBuffer = content;
            if (nextText.length > 0) {
                parts.push({
                    partType: 'text',
                    payload: { text: nextText },
                });
            }
        }

        const reasoningDetails = Array.isArray(delta['reasoning_details']) ? delta['reasoning_details'] : [];
        reasoningDetails.forEach((entry, index) => {
            if (!isRecord(entry)) {
                return;
            }

            const text = extractReasoningText(entry);
            if (!text) {
                return;
            }

            const previousValue = state.reasoningBuffers[index] ?? '';
            const nextText = diffCumulativeText(previousValue, text);
            state.reasoningBuffers[index] = text;
            if (nextText.length === 0) {
                return;
            }

            parts.push({
                partType: classifyReasoningPart(entry),
                payload: { text: nextText },
            });
        });
    }

    return parts;
}

function parseMiniMaxPayload(payload: unknown): ProviderAdapterResult<RuntimeParsedCompletion> {
    const parsedChatCompletion = parseChatCompletionsPayload(payload);
    if (parsedChatCompletion.isErr()) {
        return errProviderAdapter(parsedChatCompletion.error.code, parsedChatCompletion.error.message);
    }

    if (!isRecord(payload)) {
        return okProviderAdapter(parsedChatCompletion.value);
    }

    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    const firstChoice = choices.find((choice) => isRecord(choice));
    const message = firstChoice && isRecord(firstChoice['message']) ? firstChoice['message'] : null;

    return okProviderAdapter({
        parts: [...parseReasoningDetailParts(message?.['reasoning_details']), ...parsedChatCompletion.value.parts],
        usage: parsedChatCompletion.value.usage,
    });
}

function isMiniMaxBaseUrl(baseUrl: string | null): boolean {
    if (!baseUrl) {
        return false;
    }

    try {
        const url = new URL(baseUrl);
        return url.hostname === 'api.minimax.io' || url.hostname === 'api.minimaxi.com';
    } catch {
        return false;
    }
}

export const miniMaxOpenAICompatibilitySpecialization: ProviderNativeRuntimeSpecialization = {
    id: 'openai:minimax_chat_completions',
    providerId: 'openai',
    transportSelection: 'provider_native',
    matchContext(context: ProviderNativeCompatibilityContext) {
        const sourceProvider = context.sourceProvider?.toLowerCase();
        if (
            context.providerId !== 'openai' ||
            context.apiFamily !== 'provider_native' ||
            !isMiniMaxBaseUrl(context.resolvedBaseUrl) ||
            context.providerNativeId !== 'minimax_openai_compat'
        ) {
            return null;
        }

        if (sourceProvider && sourceProvider !== 'minimax') {
            return null;
        }

        return 'trusted';
    },
    buildRequest(input: ProviderRuntimeInput): ProviderAdapterResult<ProviderNativeHttpRequest> {
        const token = input.accessToken ?? input.apiKey;
        if (!token) {
            return errProviderAdapter(
                'auth_missing',
                'MiniMax provider-native execution requires an API key or OAuth access token.'
            );
        }

        const endpoints = resolveOpenAIEndpoints();
        const body = buildChatCompletionsBody(input);

        return okProviderAdapter({
            url: endpoints.chatCompletionsUrl,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'text/event-stream, application/json',
                'Content-Type': 'application/json',
            },
            body,
            fallbackBody: {
                ...body,
                stream: false,
            },
        });
    },
    createStreamState(): ProviderNativeStreamState {
        const streamState: MiniMaxStreamState = {
            textBuffer: '',
            reasoningBuffers: [],
            toolCallAccumulators: new Map<number, MiniMaxToolCallAccumulator>(),
            emittedToolCallIds: new Set<string>(),
            terminalFrameSeen: false,
        };
        return streamState;
    },
    parseStreamEvent(input): ProviderAdapterResult<ProviderNativeStreamEventResult> {
        const state = input.state as MiniMaxStreamState;
        if (input.frame.data === '[DONE]') {
            if (state.terminalFrameSeen) {
                return errProviderAdapter('invalid_payload', 'MiniMax stream received duplicate terminal frame.');
            }

            state.terminalFrameSeen = true;
            if (state.toolCallAccumulators.size === 0) {
                return okProviderAdapter({
                    parts: [],
                    stop: true,
                });
            }

            const flushedToolCalls = flushMiniMaxToolCalls(state);
            if (flushedToolCalls.isErr()) {
                return errProviderAdapter(flushedToolCalls.error.code, flushedToolCalls.error.message);
            }

            return okProviderAdapter({
                parts: flushedToolCalls.value,
                stop: true,
            });
        }

        let payload: unknown;
        try {
            payload = JSON.parse(input.frame.data);
        } catch {
            return errProviderAdapter('invalid_payload', 'MiniMax stream frame contained invalid JSON payload.');
        }

        if (!isRecord(payload)) {
            return errProviderAdapter('invalid_payload', 'MiniMax stream frame payload must be an object.');
        }

        const parts = parseMiniMaxStreamParts(payload, state);
        const accumulationResult = accumulateMiniMaxToolCalls(payload, state);
        if (accumulationResult.isErr()) {
            return errProviderAdapter(accumulationResult.error.code, accumulationResult.error.message);
        }

        const usage = normalizeUsage(isRecord(payload) ? payload['usage'] : undefined);
        if (!accumulationResult.value.shouldFlush || state.toolCallAccumulators.size === 0) {
            return okProviderAdapter({
                parts,
                ...(usage ? { usage } : {}),
            });
        }

        const flushedToolCalls = flushMiniMaxToolCalls(state);
        if (flushedToolCalls.isErr()) {
            return errProviderAdapter(flushedToolCalls.error.code, flushedToolCalls.error.message);
        }

        return okProviderAdapter({
            parts: [...parts, ...flushedToolCalls.value],
            ...(usage ? { usage } : {}),
        });
    },
    finalizeStream(state): ProviderAdapterResult<ProviderNativeStreamEventResult> {
        const typedState = state as MiniMaxStreamState;
        if (typedState.toolCallAccumulators.size > 0) {
            return errProviderAdapter(
                'invalid_payload',
                'MiniMax stream ended before accumulated tool-call arguments reached a complete native tool call.'
            );
        }

        return okProviderAdapter({
            parts: [],
        });
    },
    parseNonStreamPayload(payload: unknown): ProviderAdapterResult<RuntimeParsedCompletion> {
        return parseMiniMaxPayload(payload);
    },
};

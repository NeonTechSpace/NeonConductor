import WebSocket from 'ws';

import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { buildOpenAIRealtimeWebSocketUrl } from '@/app/backend/providers/adapters/openai/endpoints';
import { parseStructuredToolCall } from '@/app/backend/providers/adapters/runtimePayload';
import type {
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';

interface RealtimeAccumulator {
    callId?: string;
    itemId?: string;
    toolName?: string;
    argumentsText: string;
}

function buildRealtimeAccumulator(input: {
    callId: string | undefined;
    itemId: string | undefined;
    toolName: string | undefined;
    argumentsText: string;
}): RealtimeAccumulator {
    return {
        ...(input.callId ? { callId: input.callId } : {}),
        ...(input.itemId ? { itemId: input.itemId } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
        argumentsText: input.argumentsText,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeUsage(value: unknown): ProviderRuntimeUsage | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const usage: ProviderRuntimeUsage = {};
    const inputTokens = typeof value['input_tokens'] === 'number' ? value['input_tokens'] : undefined;
    const outputTokens = typeof value['output_tokens'] === 'number' ? value['output_tokens'] : undefined;
    const totalTokens = typeof value['total_tokens'] === 'number' ? value['total_tokens'] : undefined;

    if (inputTokens !== undefined) {
        usage.inputTokens = inputTokens;
    }
    if (outputTokens !== undefined) {
        usage.outputTokens = outputTokens;
    }
    if (totalTokens !== undefined) {
        usage.totalTokens = totalTokens;
    }

    return Object.keys(usage).length > 0 ? usage : undefined;
}

function toUpstreamModelId(modelId: string): string {
    return modelId.startsWith('openai/') ? modelId.slice('openai/'.length) : modelId;
}

function buildSessionUpdateEvent(input: ProviderRuntimeInput) {
    return {
        type: 'session.update',
        session: {
            modalities: ['text'],
            ...(input.tools && input.tools.length > 0
                ? {
                      tools: input.tools.map((tool) => ({
                          type: 'function',
                          name: tool.id,
                          description: tool.description,
                          parameters: tool.inputSchema,
                      })),
                      tool_choice: input.toolChoice ?? 'auto',
                  }
                : {}),
        },
    };
}

function buildConversationSeedEvents(input: ProviderRuntimeInput): Array<Record<string, unknown>> {
    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [
                  {
                      role: 'user' as const,
                      parts: [{ type: 'text' as const, text: input.promptText }],
                  },
              ];

    return contextMessages.flatMap((message) => {
        const items: Array<Record<string, unknown>> = [];
        const textParts = message.parts.filter(
            (
                part
            ): part is Extract<(typeof message.parts)[number], { type: 'text' | 'reasoning' | 'reasoning_summary' }> =>
                part.type === 'text' || part.type === 'reasoning' || part.type === 'reasoning_summary'
        );
        const imageParts = message.parts.filter((part) => part.type === 'image');
        if (imageParts.length > 0) {
            throw new Error('OpenAI Realtime WebSocket v1 does not support image context seeding in NeonConductor.');
        }

        if (textParts.length > 0 && message.role !== 'tool') {
            items.push({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: message.role,
                    content: textParts.map((part) => ({
                        type: 'input_text',
                        text: part.text,
                    })),
                },
            });
        }

        for (const part of message.parts) {
            if (part.type === 'tool_call') {
                items.push({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call',
                        call_id: part.callId,
                        name: part.toolName,
                        arguments: part.argumentsText,
                    },
                });
            }

            if (part.type === 'tool_result') {
                items.push({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: part.callId,
                        output: part.outputText,
                    },
                });
            }
        }

        return items;
    });
}

async function emitUsage(
    handlers: ProviderRuntimeHandlers,
    usage: ProviderRuntimeUsage | undefined,
    startedAt: number
): Promise<void> {
    if (!usage || !handlers.onUsage) {
        return;
    }

    await handlers.onUsage({
        ...usage,
        latencyMs: Date.now() - startedAt,
    });
}

async function emitStructuredToolCall(
    handlers: ProviderRuntimeHandlers,
    accumulator: RealtimeAccumulator
): Promise<ProviderAdapterResult<void>> {
    const parsed = parseStructuredToolCall({
        callId: accumulator.callId,
        toolName: accumulator.toolName,
        argumentsText: accumulator.argumentsText,
        sourceLabel: 'OpenAI Realtime WebSocket',
    });
    if (parsed.isErr()) {
        const errorResult = errProviderAdapter(parsed.error.code, parsed.error.message);
        errorResult.match(
            () => undefined,
            () => undefined
        );
        return errorResult;
    }

    await handlers.onPart(parsed.value);
    const okResult = okProviderAdapter(undefined);
    okResult.match(
        () => undefined,
        () => undefined
    );
    return okResult;
}

function getAccumulatorKey(payload: Record<string, unknown>): string | undefined {
    return (
        readString(payload['call_id']) ??
        readString(payload['item_id']) ??
        (isRecord(payload['item'])
            ? (readString(payload['item']['call_id']) ?? readString(payload['item']['id']))
            : undefined)
    );
}

export async function streamOpenAIRealtimeWebSocketRuntime(input: {
    runtimeInput: ProviderRuntimeInput;
    handlers: ProviderRuntimeHandlers;
    baseUrl: string;
    token: string;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    const socketUrl = buildOpenAIRealtimeWebSocketUrl(input.baseUrl, toUpstreamModelId(input.runtimeInput.modelId));

    let openListener: (() => void) | undefined;
    let messageListener: ((data: WebSocket.RawData) => void) | undefined;
    let closeListener: ((code: number, reason: Buffer) => void) | undefined;
    let errorListener: ((error: Error) => void) | undefined;
    let abortListener: (() => void) | undefined;

    try {
        const socket = new WebSocket(socketUrl, {
            headers: {
                Authorization: `Bearer ${input.token}`,
            },
        });
        const toolAccumulators = new Map<string, RealtimeAccumulator>();
        let settled = false;

        const cleanup = () => {
            if (openListener) socket.off('open', openListener);
            if (messageListener) socket.off('message', messageListener);
            if (closeListener) socket.off('close', closeListener);
            if (errorListener) socket.off('error', errorListener);
            if (abortListener) input.runtimeInput.signal.removeEventListener('abort', abortListener);
        };

        const result = await new Promise<ProviderAdapterResult<void>>((resolve) => {
            const settle = (value: ProviderAdapterResult<void>) => {
                if (settled) {
                    return;
                }

                settled = true;
                cleanup();
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                }
                resolve(value);
            };

            const sendJson = (payload: Record<string, unknown>) => {
                socket.send(JSON.stringify(payload));
            };

            const handleRealtimeMessage = async (payload: Record<string, unknown>) => {
                const type = readString(payload['type']);
                if (!type) {
                    return;
                }

                if (type === 'error') {
                    const errorResult = errProviderAdapter(
                        'provider_request_failed',
                        readString(payload['message']) ?? 'OpenAI Realtime WebSocket returned an error event.'
                    );
                    errorResult.match(
                        () => undefined,
                        () => undefined
                    );
                    settle(errorResult);
                    return;
                }

                if (type === 'response.output_text.delta') {
                    const text = readString(payload['delta']) ?? readString(payload['text']);
                    if (text) {
                        await input.handlers.onPart({
                            partType: 'text',
                            payload: { text },
                        });
                    }
                    return;
                }

                if (type === 'response.reasoning.delta') {
                    const text = readString(payload['delta']) ?? readString(payload['text']);
                    if (text) {
                        await input.handlers.onPart({
                            partType: 'reasoning',
                            payload: { text },
                        });
                    }
                    return;
                }

                if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_summary.delta') {
                    const text =
                        readString(payload['delta']) ?? readString(payload['text']) ?? readString(payload['summary']);
                    if (text) {
                        await input.handlers.onPart({
                            partType: 'reasoning_summary',
                            payload: { text },
                        });
                    }
                    return;
                }

                if (type === 'response.output_item.added') {
                    const item = isRecord(payload['item']) ? payload['item'] : undefined;
                    if (!item || readString(item['type']) !== 'function_call') {
                        return;
                    }

                    const key = readString(item['call_id']) ?? readString(item['id']);
                    if (!key) {
                        return;
                    }

                    const current =
                        toolAccumulators.get(key) ??
                        buildRealtimeAccumulator({
                            callId: undefined,
                            itemId: undefined,
                            toolName: undefined,
                            argumentsText: '',
                        });
                    toolAccumulators.set(
                        key,
                        buildRealtimeAccumulator({
                            callId: readString(item['call_id']) ?? current.callId,
                            itemId: readString(item['id']) ?? current.itemId,
                            toolName: readString(item['name']) ?? current.toolName,
                            argumentsText: readString(item['arguments']) ?? current.argumentsText,
                        })
                    );
                    return;
                }

                if (type === 'response.function_call_arguments.delta') {
                    const key = getAccumulatorKey(payload);
                    if (!key) {
                        return;
                    }

                    const current =
                        toolAccumulators.get(key) ??
                        buildRealtimeAccumulator({
                            callId: undefined,
                            itemId: undefined,
                            toolName: undefined,
                            argumentsText: '',
                        });
                    toolAccumulators.set(
                        key,
                        buildRealtimeAccumulator({
                            callId: readString(payload['call_id']) ?? current.callId,
                            itemId: readString(payload['item_id']) ?? current.itemId,
                            toolName: current.toolName,
                            argumentsText: `${current.argumentsText}${readString(payload['delta']) ?? ''}`,
                        })
                    );
                    return;
                }

                if (type === 'response.output_item.done') {
                    const item = isRecord(payload['item']) ? payload['item'] : undefined;
                    if (!item || readString(item['type']) !== 'function_call') {
                        return;
                    }

                    const key = readString(item['call_id']) ?? readString(item['id']);
                    if (!key) {
                        return;
                    }

                    const current =
                        toolAccumulators.get(key) ??
                        buildRealtimeAccumulator({
                            callId: undefined,
                            itemId: undefined,
                            toolName: undefined,
                            argumentsText: '',
                        });
                    const nextAccumulator = buildRealtimeAccumulator({
                        callId: readString(item['call_id']) ?? current.callId,
                        itemId: readString(item['id']) ?? current.itemId,
                        toolName: readString(item['name']) ?? current.toolName,
                        argumentsText: readString(item['arguments']) ?? current.argumentsText,
                    });
                    toolAccumulators.delete(key);

                    const toolCallResult = await emitStructuredToolCall(input.handlers, nextAccumulator);
                    if (toolCallResult.isErr()) {
                        settle(toolCallResult);
                    }
                    return;
                }

                if (type === 'response.done') {
                    const response = isRecord(payload['response']) ? payload['response'] : undefined;
                    const usage = normalizeUsage(response?.['usage'] ?? payload['usage']);
                    await emitUsage(input.handlers, usage, input.startedAt);

                    if (response && Array.isArray(response['output'])) {
                        for (const outputItem of response['output']) {
                            if (!isRecord(outputItem) || readString(outputItem['type']) !== 'function_call') {
                                continue;
                            }

                            const accumulator = buildRealtimeAccumulator({
                                callId: readString(outputItem['call_id']),
                                itemId: readString(outputItem['id']),
                                toolName: readString(outputItem['name']),
                                argumentsText: readString(outputItem['arguments']) ?? '',
                            });
                            if (!accumulator.callId || !accumulator.toolName) {
                                continue;
                            }

                            const toolCallResult = await emitStructuredToolCall(input.handlers, accumulator);
                            if (toolCallResult.isErr()) {
                                settle(toolCallResult);
                                return;
                            }
                        }
                    }

                    const okResult = okProviderAdapter(undefined);
                    okResult.match(
                        () => undefined,
                        () => undefined
                    );
                    settle(okResult);
                }
            };

            openListener = () => {
                try {
                    sendJson(buildSessionUpdateEvent(input.runtimeInput));
                    for (const seedEvent of buildConversationSeedEvents(input.runtimeInput)) {
                        sendJson(seedEvent);
                    }
                    sendJson({
                        type: 'response.create',
                        response: {
                            modalities: ['text'],
                        },
                    });
                } catch (error) {
                    const errorResult = errProviderAdapter(
                        'invalid_payload',
                        error instanceof Error ? error.message : 'Failed to seed OpenAI Realtime conversation state.'
                    );
                    errorResult.match(
                        () => undefined,
                        () => undefined
                    );
                    settle(errorResult);
                }
            };

            messageListener = (data) => {
                const raw =
                    typeof data === 'string'
                        ? data
                        : Buffer.isBuffer(data)
                          ? data.toString('utf8')
                          : Array.isArray(data)
                            ? Buffer.concat(data).toString('utf8')
                            : Buffer.from(data).toString('utf8');
                let payload: unknown;
                try {
                    payload = JSON.parse(raw);
                } catch {
                    const errorResult = errProviderAdapter(
                        'invalid_payload',
                        'OpenAI Realtime WebSocket emitted invalid JSON.'
                    );
                    errorResult.match(
                        () => undefined,
                        () => undefined
                    );
                    settle(errorResult);
                    return;
                }

                if (!isRecord(payload)) {
                    const errorResult = errProviderAdapter(
                        'invalid_payload',
                        'OpenAI Realtime WebSocket emitted an invalid event.'
                    );
                    errorResult.match(
                        () => undefined,
                        () => undefined
                    );
                    settle(errorResult);
                    return;
                }

                void handleRealtimeMessage(payload).catch((error: unknown) => {
                    const errorResult = errProviderAdapter(
                        'provider_request_failed',
                        error instanceof Error ? error.message : 'OpenAI Realtime WebSocket processing failed.'
                    );
                    errorResult.match(
                        () => undefined,
                        () => undefined
                    );
                    settle(errorResult);
                });
            };

            closeListener = (code, reason) => {
                if (settled) {
                    return;
                }

                if (input.runtimeInput.signal.aborted) {
                    const okResult = okProviderAdapter(undefined);
                    okResult.match(
                        () => undefined,
                        () => undefined
                    );
                    settle(okResult);
                    return;
                }

                const reasonText = reason.toString('utf8').trim();
                const errorResult = errProviderAdapter(
                    'provider_request_failed',
                    `OpenAI Realtime WebSocket closed before completion (${String(code)}${reasonText ? `: ${reasonText}` : ''}).`
                );
                errorResult.match(
                    () => undefined,
                    () => undefined
                );
                settle(errorResult);
            };

            errorListener = (error) => {
                const errorResult = errProviderAdapter('provider_request_failed', error.message);
                errorResult.match(
                    () => undefined,
                    () => undefined
                );
                settle(errorResult);
            };

            abortListener = () => {
                const okResult = okProviderAdapter(undefined);
                okResult.match(
                    () => undefined,
                    () => undefined
                );
                settle(okResult);
            };

            socket.on('open', openListener);
            socket.on('message', messageListener);
            socket.on('close', closeListener);
            socket.on('error', errorListener);
            input.runtimeInput.signal.addEventListener('abort', abortListener, { once: true });
        });

        return result;
    } catch (error) {
        const errorResult = errProviderAdapter(
            'provider_request_failed',
            error instanceof Error ? error.message : 'OpenAI Realtime WebSocket execution failed.'
        );
        errorResult.match(
            () => undefined,
            () => undefined
        );
        return errorResult;
    }
}

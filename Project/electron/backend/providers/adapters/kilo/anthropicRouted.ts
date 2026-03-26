import {
    isRecord,
    normalizeAnthropicChatUsage,
    parseAnthropicContentTextParts,
    parseAnthropicReasoningDetails,
    parseAnthropicToolCallPart,
    parseAnthropicTopLevelReasoningParts,
    readOptionalNumber,
    readOptionalString,
} from '@/app/backend/providers/adapters/anthropicFamilyCore';
import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { type RuntimeParsedCompletion, type RuntimeParsedPart } from '@/app/backend/providers/adapters/runtimePayload';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import {
    consumeStrictServerSentEvents,
    type StrictServerSentEventFrame,
} from '@/app/backend/providers/adapters/strictServerSentEvents';
import type { ProviderRuntimeHandlers, ProviderRuntimePart, ProviderRuntimeUsage } from '@/app/backend/providers/types';

interface AnthropicRoutedToolCallAccumulator {
    index: number;
    callId?: string;
    toolName?: string;
    argumentsText: string;
}

export interface KiloAnthropicRoutedStreamState {
    toolCallAccumulators: Map<number, AnthropicRoutedToolCallAccumulator>;
    emittedToolCallIds: Set<string>;
    terminalFrameSeen: boolean;
    yieldedDisplayableReasoningDetails: boolean;
}

interface KiloAnthropicRoutedStreamEventResult {
    parts: ProviderRuntimePart[];
    usage?: ProviderRuntimeUsage;
    stop?: boolean;
}

function flushAnthropicRoutedToolCalls(
    state: KiloAnthropicRoutedStreamState
): ProviderAdapterResult<RuntimeParsedPart[]> {
    const toolCallParts: RuntimeParsedPart[] = [];

    for (const accumulator of [...state.toolCallAccumulators.values()].sort(
        (left, right) => left.index - right.index
    )) {
        const parsedPart = parseAnthropicToolCallPart({
            callId: accumulator.callId,
            toolName: accumulator.toolName,
            argumentsText: accumulator.argumentsText,
            sourceLabel: 'Kilo Anthropic stream',
        });
        if (parsedPart.isErr()) {
            return errProviderAdapter(parsedPart.error.code, parsedPart.error.message);
        }

        const callId = parsedPart.value.payload['callId'];
        if (typeof callId !== 'string') {
            return errProviderAdapter(
                'invalid_payload',
                'Kilo Anthropic stream emitted a tool call without a stable call id.'
            );
        }

        if (state.emittedToolCallIds.has(callId)) {
            return errProviderAdapter(
                'invalid_payload',
                `Kilo Anthropic stream emitted duplicate tool call id "${callId}".`
            );
        }

        state.emittedToolCallIds.add(callId);
        toolCallParts.push(parsedPart.value);
    }

    state.toolCallAccumulators.clear();
    return okProviderAdapter(toolCallParts);
}

function readAccumulatorByCallId(
    state: KiloAnthropicRoutedStreamState,
    callId: string,
    excludeIndex: number
): AnthropicRoutedToolCallAccumulator | undefined {
    for (const accumulator of state.toolCallAccumulators.values()) {
        if (accumulator.index !== excludeIndex && accumulator.callId === callId) {
            return accumulator;
        }
    }

    return undefined;
}

function accumulateToolCalls(
    payload: Record<string, unknown>,
    state: KiloAnthropicRoutedStreamState
): ProviderAdapterResult<{ shouldFlush: boolean }> {
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
                    `Kilo Anthropic stream reused completed tool call id "${nextCallId}".`
                );
            }

            if (nextCallId && current.callId && current.callId !== nextCallId) {
                return errProviderAdapter(
                    'invalid_payload',
                    `Kilo Anthropic stream changed tool call id from "${current.callId}" to "${nextCallId}" for index ${String(index)}.`
                );
            }

            if (nextToolName && current.toolName && current.toolName !== nextToolName) {
                return errProviderAdapter(
                    'invalid_payload',
                    `Kilo Anthropic stream changed tool name from "${current.toolName}" to "${nextToolName}" for index ${String(index)}.`
                );
            }

            if (nextCallId) {
                const duplicateAccumulator = readAccumulatorByCallId(state, nextCallId, index);
                if (duplicateAccumulator) {
                    return errProviderAdapter(
                        'invalid_payload',
                        `Kilo Anthropic stream emitted duplicate tool call id "${nextCallId}" across tool indices.`
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

function parseTopLevelReasoningParts(input: {
    delta: Record<string, unknown>;
    state: KiloAnthropicRoutedStreamState;
}): RuntimeParsedPart[] {
    return parseAnthropicTopLevelReasoningParts({
        container: input.delta,
        state: input.state,
    });
}

export function createKiloAnthropicRoutedStreamState(): KiloAnthropicRoutedStreamState {
    return {
        toolCallAccumulators: new Map<number, AnthropicRoutedToolCallAccumulator>(),
        emittedToolCallIds: new Set<string>(),
        terminalFrameSeen: false,
        yieldedDisplayableReasoningDetails: false,
    };
}

export function parseKiloAnthropicRoutedStreamEvent(input: {
    frame: StrictServerSentEventFrame;
    state: KiloAnthropicRoutedStreamState;
    includeEncrypted: boolean;
}): ProviderAdapterResult<KiloAnthropicRoutedStreamEventResult> {
    if (input.frame.data === '[DONE]') {
        if (input.state.terminalFrameSeen) {
            return errProviderAdapter('invalid_payload', 'Kilo Anthropic stream received duplicate terminal frame.');
        }

        input.state.terminalFrameSeen = true;
        if (input.state.toolCallAccumulators.size === 0) {
            return okProviderAdapter({
                parts: [],
                stop: true,
            });
        }

        const flushedToolCalls = flushAnthropicRoutedToolCalls(input.state);
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
        return errProviderAdapter('invalid_payload', 'Kilo Anthropic stream frame contained invalid JSON payload.');
    }

    if (!isRecord(payload)) {
        return errProviderAdapter('invalid_payload', 'Kilo Anthropic stream frame payload must be an object.');
    }

    const parts: RuntimeParsedPart[] = [];
    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    for (const choice of choices) {
        if (!isRecord(choice)) {
            continue;
        }

        const delta = isRecord(choice['delta']) ? choice['delta'] : null;
        if (!delta) {
            continue;
        }

        parts.push(
            ...parseAnthropicReasoningDetails({
                value: delta['reasoning_details'],
                includeEncrypted: input.includeEncrypted,
                state: input.state,
            })
        );
        parts.push(...parseTopLevelReasoningParts({ delta, state: input.state }));
        parts.push(...parseAnthropicContentTextParts(delta['content']));
    }

    const accumulation = accumulateToolCalls(payload, input.state);
    if (accumulation.isErr()) {
        return errProviderAdapter(accumulation.error.code, accumulation.error.message);
    }

    const usage = normalizeAnthropicChatUsage(payload['usage']);
    if (!accumulation.value.shouldFlush || input.state.toolCallAccumulators.size === 0) {
        return okProviderAdapter({
            parts,
            ...(usage ? { usage } : {}),
        });
    }

    const flushedToolCalls = flushAnthropicRoutedToolCalls(input.state);
    if (flushedToolCalls.isErr()) {
        return errProviderAdapter(flushedToolCalls.error.code, flushedToolCalls.error.message);
    }

    return okProviderAdapter({
        parts: [...parts, ...flushedToolCalls.value],
        ...(usage ? { usage } : {}),
    });
}

export function finalizeKiloAnthropicRoutedStream(
    state: KiloAnthropicRoutedStreamState
): ProviderAdapterResult<KiloAnthropicRoutedStreamEventResult> {
    if (state.toolCallAccumulators.size > 0) {
        return errProviderAdapter(
            'invalid_payload',
            'Kilo Anthropic stream ended before accumulated tool-call arguments reached a complete native tool call.'
        );
    }

    return okProviderAdapter({
        parts: [],
    });
}

async function emitKiloAnthropicStreamEvent(input: {
    result: KiloAnthropicRoutedStreamEventResult;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    for (const part of input.result.parts) {
        await input.handlers.onPart(part);
    }

    if (input.result.usage && input.handlers.onUsage) {
        await input.handlers.onUsage({
            ...input.result.usage,
            latencyMs: Date.now() - input.startedAt,
        });
    }

    return okProviderAdapter(undefined);
}

export async function consumeKiloAnthropicRoutedStreamResponse(input: {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const streamState = createKiloAnthropicRoutedStreamState();
    const streamed = await consumeStrictServerSentEvents({
        response: input.response,
        sourceLabel: 'Kilo Anthropic stream',
        onFrame: async (frame) => {
            const parsedEvent = parseKiloAnthropicRoutedStreamEvent({
                frame,
                state: streamState,
                includeEncrypted: input.includeEncrypted,
            });
            if (parsedEvent.isErr()) {
                return errProviderAdapter(parsedEvent.error.code, parsedEvent.error.message);
            }

            const emitted = await emitKiloAnthropicStreamEvent({
                result: parsedEvent.value,
                handlers: input.handlers,
                startedAt: input.startedAt,
            });
            if (emitted.isErr()) {
                return errProviderAdapter(emitted.error.code, emitted.error.message);
            }

            return okProviderAdapter(parsedEvent.value.stop === true);
        },
    });
    if (streamed.isErr()) {
        return streamed;
    }

    const finalized = finalizeKiloAnthropicRoutedStream(streamState);
    if (finalized.isErr()) {
        return errProviderAdapter(finalized.error.code, finalized.error.message);
    }

    return emitKiloAnthropicStreamEvent({
        result: finalized.value,
        handlers: input.handlers,
        startedAt: input.startedAt,
    });
}

export function parseKiloAnthropicRoutedPayload(input: {
    payload: unknown;
    includeEncrypted: boolean;
}): ProviderAdapterResult<RuntimeParsedCompletion> {
    if (!isRecord(input.payload)) {
        return errProviderAdapter('invalid_payload', 'Invalid Kilo Anthropic chat completion payload.');
    }

    const choices = Array.isArray(input.payload['choices']) ? input.payload['choices'] : [];
    const firstChoice = choices.find((choice) => isRecord(choice));
    const message = firstChoice && isRecord(firstChoice['message']) ? firstChoice['message'] : null;
    const parts: RuntimeParsedPart[] = [];

    if (message) {
        const reasoningState = {
            yieldedDisplayableReasoningDetails: false,
        };
        parts.push(
            ...parseAnthropicReasoningDetails({
                value: message['reasoning_details'],
                includeEncrypted: input.includeEncrypted,
                state: reasoningState,
            })
        );
        parts.push(...parseAnthropicTopLevelReasoningParts({ container: message, state: reasoningState }));
        parts.push(...parseAnthropicContentTextParts(message['content']));

        const rawToolCalls = Array.isArray(message['tool_calls']) ? message['tool_calls'] : [];
        for (const rawToolCall of rawToolCalls) {
            if (!isRecord(rawToolCall)) {
                continue;
            }

            const functionRecord = isRecord(rawToolCall['function']) ? rawToolCall['function'] : null;
            const toolCallResult = parseAnthropicToolCallPart({
                callId: rawToolCall['id'],
                toolName: functionRecord?.['name'],
                argumentsText: functionRecord?.['arguments'],
                sourceLabel: 'Kilo Anthropic payload',
            });
            if (toolCallResult.isErr()) {
                return errProviderAdapter(toolCallResult.error.code, toolCallResult.error.message);
            }

            parts.push(toolCallResult.value);
        }
    }

    return okProviderAdapter({
        parts,
        usage: normalizeAnthropicChatUsage(input.payload['usage']) ?? {},
    });
}

export async function emitKiloAnthropicRoutedPayload(input: {
    payload: unknown;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const parsed = parseKiloAnthropicRoutedPayload({
        payload: input.payload,
        includeEncrypted: input.includeEncrypted,
    });
    if (parsed.isErr()) {
        return errProviderAdapter(parsed.error.code, parsed.error.message);
    }

    return emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
}

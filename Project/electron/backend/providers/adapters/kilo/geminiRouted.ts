import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    buildGeminiCompatibilityMessages,
    isRecord,
    readOptionalNumber,
    readOptionalString,
} from '@/app/backend/providers/adapters/geminiShared';
import {
    normalizeGeminiChatUsage,
    parseGeminiContentTextParts,
    parseGeminiReasoningDetails,
    parseGeminiTopLevelReasoningParts,
    type GeminiReasoningState,
} from '@/app/backend/providers/adapters/geminiFamilyCore';
import {
    parseStructuredToolCall,
    type RuntimeParsedCompletion,
    type RuntimeParsedPart,
} from '@/app/backend/providers/adapters/runtimePayload';
import {
    consumeStrictServerSentEvents,
    type StrictServerSentEventFrame,
} from '@/app/backend/providers/adapters/strictServerSentEvents';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import {
    buildKiloProviderPreferences,
    mapReasoningEffort,
} from '@/app/backend/providers/adapters/kilo/headers';
import type {
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';

interface GeminiToolCallAccumulator {
    index: number;
    callId?: string;
    toolName?: string;
    argumentsText: string;
}

export interface KiloGeminiRoutedStreamState {
    toolCallAccumulators: Map<number, GeminiToolCallAccumulator>;
    emittedToolCallIds: Set<string>;
    reasoningTextBuffers: Map<string, string>;
    terminalFrameSeen: boolean;
    yieldedDisplayableReasoningDetails: boolean;
}

interface KiloGeminiRoutedStreamEventResult {
    parts: RuntimeParsedPart[];
    usage?: ProviderRuntimeUsage;
    stop?: boolean;
}

function readAccumulatorByCallId(
    state: KiloGeminiRoutedStreamState,
    callId: string,
    excludeIndex: number
): GeminiToolCallAccumulator | undefined {
    for (const accumulator of state.toolCallAccumulators.values()) {
        if (accumulator.index !== excludeIndex && accumulator.callId === callId) {
            return accumulator;
        }
    }

    return undefined;
}

function accumulateToolCalls(
    payload: Record<string, unknown>,
    state: KiloGeminiRoutedStreamState
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
                    `Kilo Gemini stream reused completed tool call id "${nextCallId}".`
                );
            }

            if (nextCallId && current.callId && current.callId !== nextCallId) {
                return errProviderAdapter(
                    'invalid_payload',
                    `Kilo Gemini stream changed tool call id from "${current.callId}" to "${nextCallId}" for index ${String(index)}.`
                );
            }

            if (nextToolName && current.toolName && current.toolName !== nextToolName) {
                return errProviderAdapter(
                    'invalid_payload',
                    `Kilo Gemini stream changed tool name from "${current.toolName}" to "${nextToolName}" for index ${String(index)}.`
                );
            }

            if (nextCallId) {
                const duplicateAccumulator = readAccumulatorByCallId(state, nextCallId, index);
                if (duplicateAccumulator) {
                    return errProviderAdapter(
                        'invalid_payload',
                        `Kilo Gemini stream emitted duplicate tool call id "${nextCallId}" across tool indices.`
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

function flushGeminiToolCalls(
    state: KiloGeminiRoutedStreamState
): ProviderAdapterResult<RuntimeParsedPart[]> {
    const toolCallParts: RuntimeParsedPart[] = [];

    for (const accumulator of [...state.toolCallAccumulators.values()].sort((left, right) => left.index - right.index)) {
        const parsedPart = parseStructuredToolCall({
            callId: accumulator.callId,
            toolName: accumulator.toolName,
            argumentsText: accumulator.argumentsText,
            sourceLabel: 'Kilo Gemini stream',
        });
        if (parsedPart.isErr()) {
            return errProviderAdapter(parsedPart.error.code, parsedPart.error.message);
        }

        const callId = parsedPart.value.payload['callId'];
        if (typeof callId !== 'string') {
            return errProviderAdapter(
                'invalid_payload',
                'Kilo Gemini stream emitted a tool call without a stable call id.'
            );
        }

        if (state.emittedToolCallIds.has(callId)) {
            return errProviderAdapter(
                'invalid_payload',
                `Kilo Gemini stream emitted duplicate tool call id "${callId}".`
            );
        }

        state.emittedToolCallIds.add(callId);
        toolCallParts.push(parsedPart.value);
    }

    state.toolCallAccumulators.clear();
    return okProviderAdapter(toolCallParts);
}

function parseTopLevelReasoningParts(input: {
    delta: Record<string, unknown>;
    state: KiloGeminiRoutedStreamState;
}): RuntimeParsedPart[] {
    return parseGeminiTopLevelReasoningParts({
        container: input.delta,
        state: input.state,
    });
}

export function buildKiloGeminiRoutedBody(input: ProviderRuntimeInput): Record<string, unknown> {
    const effort = mapReasoningEffort(input.runtimeOptions.reasoning.effort);
    const body: Record<string, unknown> = {
        model: input.modelId,
        messages: buildGeminiCompatibilityMessages(input),
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

    if (effort || input.runtimeOptions.reasoning.summary !== 'none') {
        body['reasoning'] = {
            summary: input.runtimeOptions.reasoning.summary,
            ...(effort ? { effort } : {}),
        };
    }

    const providerPreferences = buildKiloProviderPreferences(input);
    if (providerPreferences) {
        body['provider'] = providerPreferences;
    }

    return body;
}

export function createKiloGeminiRoutedStreamState(): KiloGeminiRoutedStreamState {
    return {
        toolCallAccumulators: new Map<number, GeminiToolCallAccumulator>(),
        emittedToolCallIds: new Set<string>(),
        reasoningTextBuffers: new Map<string, string>(),
        terminalFrameSeen: false,
        yieldedDisplayableReasoningDetails: false,
    };
}

export function parseKiloGeminiRoutedStreamEvent(input: {
    frame: StrictServerSentEventFrame;
    state: KiloGeminiRoutedStreamState;
    includeEncrypted: boolean;
}): ProviderAdapterResult<KiloGeminiRoutedStreamEventResult> {
    if (input.frame.data === '[DONE]') {
        if (input.state.terminalFrameSeen) {
            return errProviderAdapter('invalid_payload', 'Kilo Gemini stream received duplicate terminal frame.');
        }

        input.state.terminalFrameSeen = true;
        if (input.state.toolCallAccumulators.size === 0) {
            return okProviderAdapter({
                parts: [],
                stop: true,
            });
        }

        const flushedToolCalls = flushGeminiToolCalls(input.state);
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
        return errProviderAdapter('invalid_payload', 'Kilo Gemini stream frame contained invalid JSON payload.');
    }

    if (!isRecord(payload)) {
        return errProviderAdapter('invalid_payload', 'Kilo Gemini stream frame payload must be an object.');
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
            ...parseGeminiReasoningDetails({
                value: delta['reasoning_details'],
                includeEncrypted: input.includeEncrypted,
                state: input.state,
                cumulative: true,
            })
        );
        parts.push(...parseTopLevelReasoningParts({ delta, state: input.state }));
        parts.push(...parseGeminiContentTextParts(delta['content']));
    }

    const accumulation = accumulateToolCalls(payload, input.state);
    if (accumulation.isErr()) {
        return errProviderAdapter(accumulation.error.code, accumulation.error.message);
    }

    const usage = normalizeGeminiChatUsage(payload['usage']);
    if (!accumulation.value.shouldFlush || input.state.toolCallAccumulators.size === 0) {
        return okProviderAdapter({
            parts,
            ...(usage ? { usage } : {}),
        });
    }

    const flushedToolCalls = flushGeminiToolCalls(input.state);
    if (flushedToolCalls.isErr()) {
        return errProviderAdapter(flushedToolCalls.error.code, flushedToolCalls.error.message);
    }

    return okProviderAdapter({
        parts: [...parts, ...flushedToolCalls.value],
        ...(usage ? { usage } : {}),
    });
}

export function finalizeKiloGeminiRoutedStream(
    state: KiloGeminiRoutedStreamState
): ProviderAdapterResult<KiloGeminiRoutedStreamEventResult> {
    if (state.toolCallAccumulators.size > 0) {
        return errProviderAdapter(
            'invalid_payload',
            'Kilo Gemini stream ended before accumulated tool-call arguments reached a complete native tool call.'
        );
    }

    return okProviderAdapter({
        parts: [],
    });
}

async function emitKiloGeminiStreamEvent(input: {
    result: KiloGeminiRoutedStreamEventResult;
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

export async function consumeKiloGeminiRoutedStreamResponse(input: {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const streamState = createKiloGeminiRoutedStreamState();
    const streamed = await consumeStrictServerSentEvents({
        response: input.response,
        sourceLabel: 'Kilo Gemini stream',
        onFrame: async (frame) => {
            const parsedEvent = parseKiloGeminiRoutedStreamEvent({
                frame,
                state: streamState,
                includeEncrypted: input.includeEncrypted,
            });
            if (parsedEvent.isErr()) {
                return errProviderAdapter(parsedEvent.error.code, parsedEvent.error.message);
            }

            const emitted = await emitKiloGeminiStreamEvent({
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

    const finalized = finalizeKiloGeminiRoutedStream(streamState);
    if (finalized.isErr()) {
        return errProviderAdapter(finalized.error.code, finalized.error.message);
    }

    return emitKiloGeminiStreamEvent({
        result: finalized.value,
        handlers: input.handlers,
        startedAt: input.startedAt,
    });
}

export function parseKiloGeminiRoutedPayload(input: {
    payload: unknown;
    includeEncrypted: boolean;
}): ProviderAdapterResult<RuntimeParsedCompletion> {
    if (!isRecord(input.payload)) {
        return errProviderAdapter('invalid_payload', 'Invalid Kilo Gemini chat completion payload.');
    }

    const choices = Array.isArray(input.payload['choices']) ? input.payload['choices'] : [];
    const firstChoice = choices.find((choice) => isRecord(choice));
    const message = firstChoice && isRecord(firstChoice['message']) ? firstChoice['message'] : null;
    const parts: RuntimeParsedPart[] = [];

    if (message) {
        const reasoningState: GeminiReasoningState = {
            reasoningTextBuffers: new Map(),
            yieldedDisplayableReasoningDetails: false,
        };
        parts.push(
            ...parseGeminiReasoningDetails({
                value: message['reasoning_details'],
                includeEncrypted: input.includeEncrypted,
                state: reasoningState,
                cumulative: false,
            })
        );
        parts.push(...parseGeminiTopLevelReasoningParts({ container: message, state: reasoningState }));
        parts.push(...parseGeminiContentTextParts(message['content']));

        const rawToolCalls = Array.isArray(message['tool_calls']) ? message['tool_calls'] : [];
        for (const rawToolCall of rawToolCalls) {
            if (!isRecord(rawToolCall)) {
                continue;
            }

            const functionRecord = isRecord(rawToolCall['function']) ? rawToolCall['function'] : null;
            const toolCallResult = parseStructuredToolCall({
                callId: rawToolCall['id'],
                toolName: functionRecord?.['name'],
                argumentsText: functionRecord?.['arguments'],
                sourceLabel: 'Kilo Gemini payload',
            });
            if (toolCallResult.isErr()) {
                return errProviderAdapter(toolCallResult.error.code, toolCallResult.error.message);
            }

            parts.push(toolCallResult.value);
        }
    }

    return okProviderAdapter({
        parts,
        usage: normalizeGeminiChatUsage(input.payload['usage']) ?? {},
    });
}

export async function emitKiloGeminiRoutedPayload(input: {
    payload: unknown;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const parsed = parseKiloGeminiRoutedPayload({
        payload: input.payload,
        includeEncrypted: input.includeEncrypted,
    });
    if (parsed.isErr()) {
        return errProviderAdapter(parsed.error.code, parsed.error.message);
    }

    return emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
}

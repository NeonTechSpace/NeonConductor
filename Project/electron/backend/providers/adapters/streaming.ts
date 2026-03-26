import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    parseStructuredToolCall,
    type RuntimeParsedCompletion,
    type RuntimeParsedPart,
} from '@/app/backend/providers/adapters/runtimePayload';
import type { ProviderRuntimeHandlers, ProviderRuntimeUsage } from '@/app/backend/providers/types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
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
    const cachedTokens = readOptionalNumber(value['cached_tokens']);
    const reasoningTokens = readOptionalNumber(value['reasoning_tokens']);
    const inputDetails = isRecord(value['input_tokens_details']) ? value['input_tokens_details'] : undefined;
    const outputDetails = isRecord(value['output_tokens_details']) ? value['output_tokens_details'] : undefined;

    if (promptTokens !== undefined) usage.inputTokens = promptTokens;
    if (completionTokens !== undefined) usage.outputTokens = completionTokens;
    if (inputTokens !== undefined) usage.inputTokens = inputTokens;
    if (outputTokens !== undefined) usage.outputTokens = outputTokens;
    if (totalTokens !== undefined) usage.totalTokens = totalTokens;
    if (cachedTokens !== undefined) usage.cachedTokens = cachedTokens;
    if (reasoningTokens !== undefined) usage.reasoningTokens = reasoningTokens;

    const detailedCachedTokens = readOptionalNumber(inputDetails?.['cached_tokens']);
    const detailedReasoningTokens = readOptionalNumber(outputDetails?.['reasoning_tokens']);
    if (detailedCachedTokens !== undefined) usage.cachedTokens = detailedCachedTokens;
    if (detailedReasoningTokens !== undefined) usage.reasoningTokens = detailedReasoningTokens;

    return Object.keys(usage).length > 0 ? usage : undefined;
}

function textPart(partType: RuntimeParsedPart['partType'], text: unknown): RuntimeParsedPart[] {
    if (typeof text !== 'string' || text.length === 0) {
        return [];
    }

    return [
        {
            partType,
            payload: { text },
        },
    ];
}

function parseReasoningField(value: unknown): RuntimeParsedPart[] {
    if (typeof value === 'string') {
        return textPart('reasoning', value);
    }

    if (!isRecord(value)) {
        return [];
    }

    return [
        ...textPart('reasoning', value['text'] ?? value['content'] ?? value['delta']),
        ...textPart('reasoning_summary', value['summary'] ?? value['summary_text']),
    ];
}

function parseChatDeltaParts(deltaValue: unknown): RuntimeParsedPart[] {
    if (!isRecord(deltaValue)) {
        return [];
    }

    const parts: RuntimeParsedPart[] = [];
    const content = deltaValue['content'];
    if (typeof content === 'string') {
        parts.push(...textPart('text', content));
    } else if (Array.isArray(content)) {
        for (const item of content) {
            if (!isRecord(item)) {
                continue;
            }

            parts.push(
                ...textPart(
                    'text',
                    item['text'] ?? item['delta'] ?? (isRecord(item['text']) ? item['text']['value'] : undefined)
                )
            );
        }
    }

    parts.push(...parseReasoningField(deltaValue['reasoning']));
    parts.push(...parseReasoningField(deltaValue['reasoning_content']));
    parts.push(...textPart('reasoning_summary', deltaValue['reasoning_summary']));
    return parts;
}

export function parseChatCompletionsStreamChunk(payload: unknown): {
    parts: RuntimeParsedPart[];
    usage?: ProviderRuntimeUsage;
} {
    if (!isRecord(payload)) {
        return { parts: [] };
    }

    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    const parts = choices.flatMap((choice) => (isRecord(choice) ? parseChatDeltaParts(choice['delta']) : []));
    const usage = normalizeUsage(payload['usage']);
    return usage ? { parts, usage } : { parts };
}

function parseResponsesPayloadByType(type: string, payload: Record<string, unknown>): RuntimeParsedPart[] {
    if (type === 'response.output_text.delta') {
        return textPart('text', payload['delta'] ?? payload['text']);
    }
    if (type === 'response.reasoning.delta') {
        return textPart('reasoning', payload['delta'] ?? payload['text'] ?? payload['content']);
    }
    if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_summary.delta') {
        return textPart('reasoning_summary', payload['delta'] ?? payload['text'] ?? payload['summary']);
    }

    return [];
}

export function parseResponsesStreamChunk(input: { eventName?: string; payload: unknown }): {
    parts: RuntimeParsedPart[];
    usage?: ProviderRuntimeUsage;
} {
    if (!isRecord(input.payload)) {
        return { parts: [] };
    }

    const type = readOptionalString(input.payload['type']) ?? input.eventName;
    if (!type) {
        const usage = normalizeUsage(input.payload['usage']);
        return usage ? { parts: [], usage } : { parts: [] };
    }

    const usageSource =
        type === 'response.completed' && isRecord(input.payload['response'])
            ? input.payload['response']['usage']
            : input.payload['usage'];

    const usage = normalizeUsage(usageSource);
    const parts = parseResponsesPayloadByType(type, input.payload);
    return usage ? { parts, usage } : { parts };
}

async function emitParsedCompletionParts(input: {
    parsed: { parts: RuntimeParsedPart[]; usage?: ProviderRuntimeUsage };
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    for (const part of input.parsed.parts) {
        await input.handlers.onPart(part);
    }

    if (input.parsed.usage && input.handlers.onUsage) {
        await input.handlers.onUsage({
            ...input.parsed.usage,
            latencyMs: Date.now() - input.startedAt,
        });
    }

    return okProviderAdapter(undefined);
}

interface ServerSentEventFrame {
    eventName?: string;
    data: string;
}

function parseServerSentEventFrame(frame: string): ServerSentEventFrame | null {
    let eventName: string | undefined;
    const dataLines: string[] = [];

    for (const line of frame.split('\n')) {
        if (line.startsWith(':')) {
            continue;
        }

        if (line.startsWith('event:')) {
            eventName = line.slice('event:'.length).trim();
            continue;
        }

        if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
        }
    }

    if (dataLines.length === 0) {
        return null;
    }

    return {
        ...(eventName ? { eventName } : {}),
        data: dataLines.join('\n'),
    };
}

async function consumeServerSentEvents(
    response: Response,
    onFrame: (frame: ServerSentEventFrame) => Promise<ProviderAdapterResult<void>>
): Promise<ProviderAdapterResult<void>> {
    try {
        const stream = response.body;
        if (!stream) {
            return errProviderAdapter('provider_request_failed', 'Streaming response body was not available.');
        }

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
                const parsedFrame = parseServerSentEventFrame(frame);
                if (!parsedFrame) {
                    continue;
                }

                const frameResult = await onFrame(parsedFrame);
                if (frameResult.isErr()) {
                    return frameResult;
                }
            }

            if (done) {
                break;
            }
        }

        const trailingFrame = parseServerSentEventFrame(buffer);
        if (trailingFrame) {
            const trailingResult = await onFrame(trailingFrame);
            if (trailingResult.isErr()) {
                return trailingResult;
            }
        }

        return okProviderAdapter(undefined);
    } catch (error) {
        return errProviderAdapter(
            'provider_request_failed',
            error instanceof Error ? error.message : 'Streaming response parsing failed.'
        );
    }
}

interface ChatStreamToolCallAccumulator {
    index: number;
    callId?: string;
    toolName?: string;
    argumentsText: string;
}

function flushChatToolCalls(
    accumulators: Map<number, ChatStreamToolCallAccumulator>
): ProviderAdapterResult<RuntimeParsedPart[]> {
    const toolCallParts: RuntimeParsedPart[] = [];
    for (const accumulator of [...accumulators.values()].sort((left, right) => left.index - right.index)) {
        const partResult = parseStructuredToolCall({
            callId: accumulator.callId,
            toolName: accumulator.toolName,
            argumentsText: accumulator.argumentsText,
            sourceLabel: 'Chat completions stream',
        });
        if (partResult.isErr()) {
            return errProviderAdapter(partResult.error.code, partResult.error.message);
        }

        toolCallParts.push(partResult.value);
    }

    accumulators.clear();
    return okProviderAdapter(toolCallParts);
}

function accumulateChatToolCalls(
    payload: unknown,
    accumulators: Map<number, ChatStreamToolCallAccumulator>
): { shouldFlush: boolean } {
    if (!isRecord(payload)) {
        return { shouldFlush: false };
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

        const delta = readOptionalRecord(choice['delta']);
        const rawToolCalls = Array.isArray(delta?.['tool_calls']) ? delta['tool_calls'] : [];
        for (const rawToolCall of rawToolCalls) {
            if (!isRecord(rawToolCall)) {
                continue;
            }

            const index = readOptionalNumber(rawToolCall['index']) ?? accumulators.size;
            const current = accumulators.get(index) ?? {
                index,
                argumentsText: '',
            };
            const functionRecord = readOptionalRecord(rawToolCall['function']);
            const argumentsDelta = typeof functionRecord?.['arguments'] === 'string' ? functionRecord['arguments'] : '';
            const nextCallId = readOptionalString(rawToolCall['id']);
            const nextToolName = readOptionalString(functionRecord?.['name']);

            accumulators.set(index, {
                ...current,
                ...(nextCallId ? { callId: nextCallId } : {}),
                ...(nextToolName ? { toolName: nextToolName } : {}),
                argumentsText: `${current.argumentsText}${argumentsDelta}`,
            });
        }
    }

    return { shouldFlush };
}

function parseResponsesToolCallParts(input: {
    eventName?: string;
    payload: unknown;
}): ProviderAdapterResult<RuntimeParsedPart[]> {
    if (!isRecord(input.payload)) {
        return okProviderAdapter([]);
    }

    const type = readOptionalString(input.payload['type']) ?? input.eventName;
    if (!type) {
        return okProviderAdapter([]);
    }

    const toolCallParts: RuntimeParsedPart[] = [];
    const tryAppendToolCall = (item: unknown, sourceLabel: string): ProviderAdapterResult<void> => {
        if (!isRecord(item) || readOptionalString(item['type']) !== 'function_call') {
            return okProviderAdapter(undefined);
        }

        const partResult = parseStructuredToolCall({
            callId: item['call_id'] ?? item['id'],
            toolName: item['name'],
            argumentsText: item['arguments'],
            sourceLabel,
        });
        if (partResult.isErr()) {
            return errProviderAdapter(partResult.error.code, partResult.error.message);
        }

        toolCallParts.push(partResult.value);
        return okProviderAdapter(undefined);
    };

    if (type === 'response.output_item.done') {
        const appended = tryAppendToolCall(input.payload['item'], 'Responses stream');
        if (appended.isErr()) {
            return errProviderAdapter(appended.error.code, appended.error.message);
        }
    }

    if (type === 'response.completed') {
        const responseRecord = readOptionalRecord(input.payload['response']);
        const outputItems = Array.isArray(responseRecord?.['output']) ? responseRecord['output'] : [];
        for (const outputItem of outputItems) {
            const appended = tryAppendToolCall(outputItem, 'Responses stream');
            if (appended.isErr()) {
                return errProviderAdapter(appended.error.code, appended.error.message);
            }
        }
    }

    return okProviderAdapter(toolCallParts);
}

export function isEventStreamResponse(response: Response): boolean {
    const headers = response.headers as { get?: (name: string) => string | null } | undefined;
    const contentType = typeof headers?.get === 'function' ? headers.get('content-type') : null;
    return contentType?.toLowerCase().includes('text/event-stream') === true;
}

export async function emitParsedCompletion(
    parsed: RuntimeParsedCompletion,
    handlers: ProviderRuntimeHandlers,
    startedAt: number
): Promise<ProviderAdapterResult<void>> {
    return emitParsedCompletionParts({
        parsed: {
            parts: parsed.parts,
            usage: parsed.usage,
        },
        handlers,
        startedAt,
    });
}

export async function consumeChatCompletionsStreamResponse(input: {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    const toolCallAccumulators = new Map<number, ChatStreamToolCallAccumulator>();

    return consumeServerSentEvents(input.response, async (frame) => {
        if (frame.data === '[DONE]') {
            if (toolCallAccumulators.size === 0) {
                return okProviderAdapter(undefined);
            }

            const flushedToolCalls = flushChatToolCalls(toolCallAccumulators);
            if (flushedToolCalls.isErr()) {
                return errProviderAdapter(flushedToolCalls.error.code, flushedToolCalls.error.message);
            }

            return emitParsedCompletionParts({
                parsed: {
                    parts: flushedToolCalls.value,
                },
                handlers: input.handlers,
                startedAt: input.startedAt,
            });
        }

        let payload: unknown;
        try {
            payload = JSON.parse(frame.data);
        } catch {
            return okProviderAdapter(undefined);
        }

        const accumulation = accumulateChatToolCalls(payload, toolCallAccumulators);
        const parsedChunkResult = await emitParsedCompletionParts({
            parsed: parseChatCompletionsStreamChunk(payload),
            handlers: input.handlers,
            startedAt: input.startedAt,
        });
        if (parsedChunkResult.isErr()) {
            return parsedChunkResult;
        }

        if (!accumulation.shouldFlush || toolCallAccumulators.size === 0) {
            return okProviderAdapter(undefined);
        }

        const flushedToolCalls = flushChatToolCalls(toolCallAccumulators);
        if (flushedToolCalls.isErr()) {
            return errProviderAdapter(flushedToolCalls.error.code, flushedToolCalls.error.message);
        }

        return emitParsedCompletionParts({
            parsed: {
                parts: flushedToolCalls.value,
            },
            handlers: input.handlers,
            startedAt: input.startedAt,
        });
    });
}

export async function consumeResponsesStreamResponse(input: {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    const emittedToolCallIds = new Set<string>();

    return consumeServerSentEvents(input.response, async (frame) => {
        if (frame.data === '[DONE]') {
            return okProviderAdapter(undefined);
        }

        let payload: unknown;
        try {
            payload = JSON.parse(frame.data);
        } catch {
            return okProviderAdapter(undefined);
        }

        const parsedChunkResult = await emitParsedCompletionParts({
            parsed: parseResponsesStreamChunk({
                ...(frame.eventName ? { eventName: frame.eventName } : {}),
                payload,
            }),
            handlers: input.handlers,
            startedAt: input.startedAt,
        });
        if (parsedChunkResult.isErr()) {
            return parsedChunkResult;
        }

        const toolCallPartsResult = parseResponsesToolCallParts({
            ...(frame.eventName ? { eventName: frame.eventName } : {}),
            payload,
        });
        if (toolCallPartsResult.isErr()) {
            return errProviderAdapter(toolCallPartsResult.error.code, toolCallPartsResult.error.message);
        }

        const nextToolCallParts = toolCallPartsResult.value.filter((part) => {
            const callId = part.payload['callId'];
            if (typeof callId !== 'string' || emittedToolCallIds.has(callId)) {
                return false;
            }

            emittedToolCallIds.add(callId);
            return true;
        });

        if (nextToolCallParts.length === 0) {
            return okProviderAdapter(undefined);
        }

        return emitParsedCompletionParts({
            parsed: {
                parts: nextToolCallParts,
            },
            handlers: input.handlers,
            startedAt: input.startedAt,
        });
    });
}

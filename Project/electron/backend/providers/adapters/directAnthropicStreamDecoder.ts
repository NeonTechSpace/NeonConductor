import {
    isRecord,
    normalizeAnthropicMessagesUsage,
    parseAnthropicDirectBlockParts,
    parseAnthropicDirectContentBlocks,
    readOptionalNumber,
    readOptionalString,
} from '@/app/backend/providers/adapters/anthropicFamilyCore';
import { errProviderAdapter, okProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import { type RuntimeParsedCompletion, type RuntimeParsedPart } from '@/app/backend/providers/adapters/runtimePayload';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import {
    consumeStrictServerSentEvents,
    type StrictServerSentEventFrame,
} from '@/app/backend/providers/adapters/strictServerSentEvents';
import type {
    ProviderRuntimeHandlers,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';

interface AnthropicContentBlockState {
    index: number;
    type: 'text' | 'thinking' | 'redacted_thinking' | 'tool_use';
    text: string;
    signature?: string;
    opaque?: unknown;
    callId?: string;
    toolName?: string;
    argumentsText: string;
}

interface AnthropicStreamState {
    blocks: Map<number, AnthropicContentBlockState>;
    emittedToolCallIds: Set<string>;
    terminalFrameSeen: boolean;
    usage: ProviderRuntimeUsage;
}

interface AnthropicStreamEventResult {
    parts: RuntimeParsedPart[];
    usage?: ProviderRuntimeUsage;
    stop?: boolean;
}

function mergeUsage(
    state: AnthropicStreamState,
    usage: ProviderRuntimeUsage | undefined
): ProviderRuntimeUsage | undefined {
    if (!usage) {
        return undefined;
    }

    state.usage = {
        ...state.usage,
        ...usage,
    };
    if (state.usage.inputTokens !== undefined || state.usage.outputTokens !== undefined) {
        state.usage.totalTokens = (state.usage.inputTokens ?? 0) + (state.usage.outputTokens ?? 0);
    }
    return state.usage;
}

function finalizeAnthropicBlock(
    state: AnthropicStreamState,
    blockIndex: number,
    includeEncrypted: boolean
): ProviderAdapterResult<RuntimeParsedPart[]> {
    const block = state.blocks.get(blockIndex);
    if (!block) {
        return errProviderAdapter(
            'invalid_payload',
            `Anthropic Messages stream stopped unknown block ${String(blockIndex)}.`
        );
    }

    state.blocks.delete(blockIndex);
    if (block.type === 'text') {
        return okProviderAdapter([]);
    }

    const finalizedBlock =
        block.type === 'thinking'
            ? {
                  index: block.index,
                  type: 'thinking' as const,
                  text: block.text,
                  argumentsText: block.argumentsText,
                  ...(block.signature ? { signature: block.signature } : {}),
              }
            : block.type === 'redacted_thinking'
              ? {
                    index: block.index,
                    type: 'redacted_thinking' as const,
                    text: block.text,
                    argumentsText: block.argumentsText,
                    ...(block.opaque !== undefined ? { opaque: block.opaque } : {}),
                }
              : {
                    index: block.index,
                    type: 'tool_use' as const,
                    text: block.text,
                    argumentsText: block.argumentsText,
                    ...(block.callId ? { callId: block.callId } : {}),
                    ...(block.toolName ? { toolName: block.toolName } : {}),
                };

    return parseAnthropicDirectBlockParts({
        block: finalizedBlock,
        includeEncrypted,
        sourceLabel: 'Anthropic Messages stream',
        emittedToolCallIds: state.emittedToolCallIds,
    });
}

function parseAnthropicStreamFrame(input: {
    frame: StrictServerSentEventFrame;
    state: AnthropicStreamState;
    includeEncrypted: boolean;
}): ProviderAdapterResult<AnthropicStreamEventResult> {
    if (input.frame.data === '[DONE]') {
        if (input.state.terminalFrameSeen) {
            return errProviderAdapter('invalid_payload', 'Anthropic Messages stream emitted duplicate terminal frames.');
        }
        input.state.terminalFrameSeen = true;
        return okProviderAdapter({
            parts: [],
            stop: true,
        });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(input.frame.data);
    } catch {
        return errProviderAdapter('invalid_payload', 'Anthropic Messages stream emitted an invalid JSON payload.');
    }

    if (!isRecord(payload)) {
        return errProviderAdapter('invalid_payload', 'Anthropic Messages stream emitted a non-object payload.');
    }

    const eventType = readOptionalString(payload['type']) ?? input.frame.eventName;
    if (!eventType) {
        return okProviderAdapter({ parts: [] });
    }

    if (eventType === 'error') {
        const errorRecord = isRecord(payload['error']) ? payload['error'] : payload;
        const message = readOptionalString(errorRecord['message']) ?? 'Anthropic Messages request failed.';
        return errProviderAdapter('provider_request_failed', message);
    }

    if (eventType === 'message_start') {
        const usage = mergeUsage(
            input.state,
            normalizeAnthropicMessagesUsage(isRecord(payload['message']) ? payload['message']['usage'] : payload['usage'])
        );
        return okProviderAdapter({
            parts: [],
            ...(usage ? { usage } : {}),
        });
    }

    if (eventType === 'message_delta') {
        const usage = mergeUsage(input.state, normalizeAnthropicMessagesUsage(payload['usage']));
        return okProviderAdapter({
            parts: [],
            ...(usage ? { usage } : {}),
        });
    }

    if (eventType === 'message_stop') {
        if (input.state.terminalFrameSeen) {
            return errProviderAdapter('invalid_payload', 'Anthropic Messages stream emitted duplicate terminal frames.');
        }
        input.state.terminalFrameSeen = true;
        return okProviderAdapter({
            parts: [],
            stop: true,
        });
    }

    const index = readOptionalNumber(payload['index']);
    if (index === undefined) {
        return okProviderAdapter({ parts: [] });
    }

    if (eventType === 'content_block_start') {
        const block = isRecord(payload['content_block']) ? payload['content_block'] : null;
        const blockType = readOptionalString(block?.['type']);
        if (!block || !blockType) {
            return errProviderAdapter('invalid_payload', 'Anthropic Messages stream started a content block without a valid type.');
        }
        if (input.state.blocks.has(index)) {
            return errProviderAdapter('invalid_payload', `Anthropic Messages stream duplicated content block index ${String(index)}.`);
        }

        if (blockType === 'text') {
            input.state.blocks.set(index, {
                index,
                type: 'text',
                text: '',
                argumentsText: '',
            });
            const text = readOptionalString(block['text']);
            return okProviderAdapter({
                parts: text ? [{ partType: 'text', payload: { text } }] : [],
            });
        }

        if (blockType === 'thinking') {
            const signature = readOptionalString(block['signature']);
            input.state.blocks.set(index, {
                index,
                type: 'thinking',
                text: readOptionalString(block['thinking']) ?? '',
                argumentsText: '',
                ...(signature ? { signature } : {}),
            });
            return okProviderAdapter({ parts: [] });
        }

        if (blockType === 'redacted_thinking') {
            input.state.blocks.set(index, {
                index,
                type: 'redacted_thinking',
                text: '',
                opaque: block['data'],
                argumentsText: '',
            });
            return okProviderAdapter({ parts: [] });
        }

        if (blockType === 'tool_use') {
            const rawInput = isRecord(block['input']) ? block['input'] : null;
            const callId = readOptionalString(block['id']);
            const toolName = readOptionalString(block['name']);
            input.state.blocks.set(index, {
                index,
                type: 'tool_use',
                text: '',
                argumentsText: rawInput && Object.keys(rawInput).length > 0 ? JSON.stringify(rawInput) : '',
                ...(callId ? { callId } : {}),
                ...(toolName ? { toolName } : {}),
            });
            return okProviderAdapter({ parts: [] });
        }

        return okProviderAdapter({ parts: [] });
    }

    if (eventType === 'content_block_delta') {
        const block = input.state.blocks.get(index);
        if (!block) {
            return errProviderAdapter('invalid_payload', `Anthropic Messages stream emitted a delta for unknown block ${String(index)}.`);
        }

        const delta = isRecord(payload['delta']) ? payload['delta'] : null;
        const deltaType = readOptionalString(delta?.['type']);
        if (!delta || !deltaType) {
            return errProviderAdapter('invalid_payload', 'Anthropic Messages stream emitted a malformed content block delta.');
        }

        if (deltaType === 'text_delta') {
            const text = readOptionalString(delta['text']) ?? '';
            block.text = `${block.text}${text}`;
            return okProviderAdapter({
                parts: text.length > 0 ? [{ partType: 'text', payload: { text } }] : [],
            });
        }

        if (deltaType === 'thinking_delta') {
            block.text = `${block.text}${readOptionalString(delta['thinking']) ?? ''}`;
            return okProviderAdapter({ parts: [] });
        }

        if (deltaType === 'signature_delta') {
            const signature = readOptionalString(delta['signature']);
            if (signature) {
                block.signature = signature;
            }
            return okProviderAdapter({ parts: [] });
        }

        if (deltaType === 'input_json_delta') {
            const partialJson = readOptionalString(delta['partial_json']);
            if (partialJson) {
                block.argumentsText = `${block.argumentsText}${partialJson}`;
            }
            return okProviderAdapter({ parts: [] });
        }

        return okProviderAdapter({ parts: [] });
    }

    if (eventType === 'content_block_stop') {
        const finalized = finalizeAnthropicBlock(input.state, index, input.includeEncrypted);
        if (finalized.isErr()) {
            return errProviderAdapter(finalized.error.code, finalized.error.message);
        }
        return okProviderAdapter({
            parts: finalized.value,
        });
    }

    return okProviderAdapter({ parts: [] });
}

function finalizeAnthropicStreamState(state: AnthropicStreamState): ProviderAdapterResult<void> {
    if (state.blocks.size > 0) {
        return errProviderAdapter('invalid_payload', 'Anthropic Messages stream ended with dangling content blocks.');
    }
    if (!state.terminalFrameSeen) {
        return errProviderAdapter('invalid_payload', 'Anthropic Messages stream ended without a terminal frame.');
    }
    return okProviderAdapter(undefined);
}

export function parseDirectAnthropicPayload(input: {
    payload: unknown;
    includeEncrypted: boolean;
}): ProviderAdapterResult<RuntimeParsedCompletion> {
    if (!isRecord(input.payload)) {
        return errProviderAdapter('invalid_payload', 'Invalid Anthropic Messages payload.');
    }

    const parsedContent = parseAnthropicDirectContentBlocks({
        content: input.payload['content'],
        includeEncrypted: input.includeEncrypted,
        sourceLabel: 'Anthropic Messages payload',
    });
    if (parsedContent.isErr()) {
        return errProviderAdapter(parsedContent.error.code, parsedContent.error.message);
    }

    return okProviderAdapter({
        parts: parsedContent.value.parts,
        usage: normalizeAnthropicMessagesUsage(input.payload['usage']) ?? {},
    });
}

export async function emitDirectAnthropicPayload(input: {
    payload: unknown;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const parsed = parseDirectAnthropicPayload({
        payload: input.payload,
        includeEncrypted: input.includeEncrypted,
    });
    if (parsed.isErr()) {
        return errProviderAdapter(parsed.error.code, parsed.error.message);
    }

    return emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
}

export async function consumeDirectAnthropicStreamResponse(input: {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const state: AnthropicStreamState = {
        blocks: new Map(),
        emittedToolCallIds: new Set(),
        terminalFrameSeen: false,
        usage: {},
    };

    const streamed = await consumeStrictServerSentEvents({
        response: input.response,
        sourceLabel: 'Anthropic Messages stream',
        onFrame: async (frame) => {
            const parsed = parseAnthropicStreamFrame({
                frame,
                state,
                includeEncrypted: input.includeEncrypted,
            });
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }

            if (parsed.value.usage && input.handlers.onUsage) {
                await input.handlers.onUsage({
                    ...parsed.value.usage,
                    latencyMs: Date.now() - input.startedAt,
                });
            }

            for (const part of parsed.value.parts) {
                await input.handlers.onPart(part);
            }

            return okProviderAdapter(parsed.value.stop === true);
        },
    });
    if (streamed.isErr()) {
        return errProviderAdapter(streamed.error.code, streamed.error.message);
    }

    return finalizeAnthropicStreamState(state);
}

import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    parseAnthropicDirectBlockParts,
    parseAnthropicDirectContentBlocks,
    normalizeAnthropicMessagesUsage,
    isRecord,
    readOptionalNumber,
    readOptionalString,
} from '@/app/backend/providers/adapters/anthropicFamilyCore';
import {
    type RuntimeParsedCompletion,
    type RuntimeParsedPart,
} from '@/app/backend/providers/adapters/runtimePayload';
import {
    consumeStrictServerSentEvents,
    type StrictServerSentEventFrame,
} from '@/app/backend/providers/adapters/strictServerSentEvents';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import { streamDirectFamilyRuntimeWithHandler } from '@/app/backend/providers/adapters/directFamily/shell';
import type {
    DirectFamilyRuntimeConfig,
    DirectFamilyRuntimeHandler,
} from '@/app/backend/providers/adapters/directFamily/types';
import type {
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';

const ANTHROPIC_API_VERSION = '2023-06-01';
const ANTHROPIC_TOOL_STREAMING_BETA = 'fine-grained-tool-streaming-2025-05-14';
const ANTHROPIC_THINKING_BETA = 'interleaved-thinking-2025-05-14';
const DEFAULT_ANTHROPIC_MAX_TOKENS = 8_192;

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

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function toUpstreamModelId(modelId: string, modelPrefix: string): string {
    return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}

export function isAnthropicCompatibleBaseUrl(baseUrl: string | null): boolean {
    if (!baseUrl) {
        return false;
    }

    try {
        const url = new URL(baseUrl);
        return url.hostname.toLowerCase().includes('anthropic');
    } catch {
        return false;
    }
}

export function supportsDirectAnthropicRuntimeContext(input: {
    providerId: ProviderRuntimeInput['providerId'];
    resolvedBaseUrl: string | null;
}): boolean {
    return input.providerId !== 'kilo' && isAnthropicCompatibleBaseUrl(input.resolvedBaseUrl);
}

function resolveAnthropicMessagesUrl(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    if (normalized.endsWith('/v1/messages') || normalized.endsWith('/messages')) {
        return normalized;
    }
    if (normalized.endsWith('/v1')) {
        return `${normalized}/messages`;
    }
    return `${normalized}/v1/messages`;
}

function mapReasoningBudget(effort: ProviderRuntimeInput['runtimeOptions']['reasoning']['effort']): number | undefined {
    switch (effort) {
        case 'minimal':
            return 1_024;
        case 'low':
            return 2_048;
        case 'medium':
            return 4_096;
        case 'high':
            return 8_192;
        case 'xhigh':
            return 16_384;
        default:
            return undefined;
    }
}

function extractBase64Data(dataUrl: string): string | null {
    const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
    return match?.[2] ?? null;
}

function buildAnthropicSystemPrompt(
    input: NonNullable<ProviderRuntimeInput['contextMessages']>
): string | undefined {
    const chunks = input.flatMap((message) =>
        message.role !== 'system'
            ? []
            : message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
    );
    const content = chunks.join('\n\n').trim();
    return content.length > 0 ? content : undefined;
}

function toAnthropicReasoningBlock(
    part: Extract<
        NonNullable<ProviderRuntimeInput['contextMessages']>[number]['parts'][number],
        { type: 'reasoning' | 'reasoning_encrypted' }
    >
): Record<string, unknown> | null {
    if (part.type === 'reasoning') {
        if (!part.detailSignature) {
            return null;
        }

        return {
            type: 'thinking',
            thinking: part.text,
            signature: part.detailSignature,
        };
    }

    return {
        type: 'redacted_thinking',
        data: part.opaque,
    };
}

function buildAnthropicMessageContent(
    message: NonNullable<ProviderRuntimeInput['contextMessages']>[number]
): Array<Record<string, unknown>> {
    const contentBlocks: Array<Record<string, unknown>> = [];

    for (const part of message.parts) {
        if (part.type === 'text') {
            contentBlocks.push({
                type: 'text',
                text: part.text,
            });
            continue;
        }

        if (part.type === 'image') {
            const base64Data = extractBase64Data(part.dataUrl);
            if (!base64Data) {
                continue;
            }

            contentBlocks.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: part.mimeType,
                    data: base64Data,
                },
            });
            continue;
        }

        if (part.type === 'tool_call') {
            let parsedInput: unknown;
            try {
                parsedInput = JSON.parse(part.argumentsText);
            } catch {
                continue;
            }
            if (!isRecord(parsedInput)) {
                continue;
            }

            contentBlocks.push({
                type: 'tool_use',
                id: part.callId,
                name: part.toolName,
                input: parsedInput,
            });
            continue;
        }

        if (part.type === 'tool_result') {
            contentBlocks.push({
                type: 'tool_result',
                tool_use_id: part.callId,
                is_error: part.isError,
                content: [
                    {
                        type: 'text',
                        text: part.outputText,
                    },
                ],
            });
            continue;
        }

        if (part.type === 'reasoning' || part.type === 'reasoning_encrypted') {
            const reasoningBlock = toAnthropicReasoningBlock(part);
            if (reasoningBlock) {
                contentBlocks.push(reasoningBlock);
            }
        }
    }

    return contentBlocks;
}

function buildAnthropicMessages(
    input: ProviderRuntimeInput
): Array<{
    role: 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
}> {
    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [
                  {
                      role: 'user' as const,
                      parts: [
                          {
                              type: 'text' as const,
                              text: input.promptText,
                          },
                      ],
                  },
              ];

    const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [];
    for (const message of contextMessages) {
        if (message.role === 'system') {
            continue;
        }

        const content = buildAnthropicMessageContent(message);
        if (content.length === 0) {
            continue;
        }

        messages.push({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content:
                content.length === 1 && content[0]?.['type'] === 'text' && typeof content[0]?.['text'] === 'string'
                    ? (content[0]?.['text'] as string)
                    : content,
        });
    }

    return messages;
}

export function buildDirectAnthropicBody(
    input: ProviderRuntimeInput,
    modelPrefix: string
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        max_tokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
        stream: true,
        messages: buildAnthropicMessages(input),
    };

    const system = input.contextMessages ? buildAnthropicSystemPrompt(input.contextMessages) : undefined;
    if (system) {
        body['system'] = system;
    }

    if (input.tools && input.tools.length > 0) {
        body['tools'] = input.tools.map((tool) => ({
            name: tool.id,
            description: tool.description,
            input_schema: tool.inputSchema,
        }));
        body['tool_choice'] = {
            type: input.toolChoice ?? 'auto',
        };
    }

    const thinkingBudget = mapReasoningBudget(input.runtimeOptions.reasoning.effort);
    if (thinkingBudget !== undefined) {
        body['thinking'] = {
            type: 'enabled',
            budget_tokens: thinkingBudget,
        };
    }

    return body;
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
        return errProviderAdapter('invalid_payload', `Anthropic Messages stream stopped unknown block ${String(blockIndex)}.`);
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

function buildAnthropicBetaHeader(input: ProviderRuntimeInput): string | undefined {
    const betas: string[] = [];
    if (input.tools && input.tools.length > 0) {
        betas.push(ANTHROPIC_TOOL_STREAMING_BETA);
    }
    if (mapReasoningBudget(input.runtimeOptions.reasoning.effort) !== undefined) {
        betas.push(ANTHROPIC_THINKING_BETA);
    }

    return betas.length > 0 ? betas.join(',') : undefined;
}

function validateDirectAnthropicAuth(input: {
    runtimeInput: ProviderRuntimeInput;
    config: DirectFamilyRuntimeConfig;
}): ProviderAdapterResult<void> {
    if (!input.runtimeInput.apiKey) {
        return errProviderAdapter(
            'auth_missing',
            `${input.config.label} Anthropic runtime requires an API key.`
        );
    }

    return okProviderAdapter(undefined);
}

function buildDirectAnthropicRequest(input: {
    runtimeInput: ProviderRuntimeInput;
    config: DirectFamilyRuntimeConfig;
    resolvedBaseUrl: string;
    stream: boolean;
}): {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
} {
    const headers: Record<string, string> = {
        'x-api-key': input.runtimeInput.apiKey!,
        'anthropic-version': ANTHROPIC_API_VERSION,
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
    };
    const betaHeader = buildAnthropicBetaHeader(input.runtimeInput);
    if (betaHeader) {
        headers['x-anthropic-beta'] = betaHeader;
    }

    return {
        url: resolveAnthropicMessagesUrl(input.resolvedBaseUrl),
        headers,
        body: {
            ...buildDirectAnthropicBody(input.runtimeInput, input.config.modelPrefix),
            stream: input.stream,
        },
    };
}

export const directAnthropicRuntimeHandler: DirectFamilyRuntimeHandler = {
    toolProtocol: 'anthropic_messages',
    familyLabel: 'Anthropic',
    supportsContext: supportsDirectAnthropicRuntimeContext,
    incompatibleContextMessage: ({ runtimeInput, config }) =>
        `Model "${runtimeInput.modelId}" requires an Anthropic-compatible base URL on provider "${config.providerId}".`,
    validateAuth: validateDirectAnthropicAuth,
    buildRequest: buildDirectAnthropicRequest,
    consumeStreamResponse: consumeDirectAnthropicStreamResponse,
    emitPayload: emitDirectAnthropicPayload,
};

export async function streamDirectAnthropicRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: DirectFamilyRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    return streamDirectFamilyRuntimeWithHandler(input, handlers, config, directAnthropicRuntimeHandler);
}

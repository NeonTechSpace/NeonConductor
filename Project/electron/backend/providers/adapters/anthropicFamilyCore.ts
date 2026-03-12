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
import type { ProviderRuntimeUsage } from '@/app/backend/providers/types';

export interface AnthropicDisplayableReasoningState {
    yieldedDisplayableReasoningDetails: boolean;
}

export interface AnthropicDirectBlock {
    index: number;
    type: 'thinking' | 'redacted_thinking' | 'tool_use';
    text: string;
    signature?: string;
    opaque?: unknown;
    callId?: string;
    toolName?: string;
    argumentsText: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeAnthropicMessagesUsage(value: unknown): ProviderRuntimeUsage | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const inputTokens = readOptionalNumber(value['input_tokens']);
    const outputTokens = readOptionalNumber(value['output_tokens']);
    const cacheCreationTokens = readOptionalNumber(value['cache_creation_input_tokens']) ?? 0;
    const cacheReadTokens = readOptionalNumber(value['cache_read_input_tokens']) ?? 0;
    const usage: ProviderRuntimeUsage = {};

    if (inputTokens !== undefined) {
        usage.inputTokens = inputTokens;
    }
    if (outputTokens !== undefined) {
        usage.outputTokens = outputTokens;
    }
    if (cacheCreationTokens + cacheReadTokens > 0) {
        usage.cachedTokens = cacheCreationTokens + cacheReadTokens;
    }
    if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
        usage.totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    }

    return Object.keys(usage).length > 0 ? usage : undefined;
}

export function normalizeAnthropicChatUsage(value: unknown): ProviderRuntimeUsage | undefined {
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

function classifyAnthropicReasoningPart(detailType: string | undefined): RuntimeParsedPart['partType'] | null {
    const normalizedType = detailType?.toLowerCase();
    if (!normalizedType) {
        return null;
    }

    if (normalizedType.includes('encrypted')) {
        return 'reasoning_encrypted';
    }

    if (normalizedType.includes('summary')) {
        return 'reasoning_summary';
    }

    if (normalizedType.includes('reasoning')) {
        return 'reasoning';
    }

    return null;
}

function parseAnthropicReasoningDetailDisplayText(entry: Record<string, unknown>): string | undefined {
    return (
        readOptionalString(entry['text']) ??
        readOptionalString(entry['content']) ??
        readOptionalString(entry['delta']) ??
        readOptionalString(entry['summary'])
    );
}

export function parseAnthropicReasoningDetails(input: {
    value: unknown;
    includeEncrypted: boolean;
    state: AnthropicDisplayableReasoningState;
}): RuntimeParsedPart[] {
    const details = Array.isArray(input.value) ? input.value : [];
    const parts: RuntimeParsedPart[] = [];

    for (const detail of details) {
        if (!isRecord(detail)) {
            continue;
        }

        const partType = classifyAnthropicReasoningPart(readOptionalString(detail['type']));
        if (!partType) {
            continue;
        }

        if (partType === 'reasoning_encrypted') {
            if (!input.includeEncrypted) {
                continue;
            }

            const opaque =
                detail['encrypted_content'] ??
                detail['encrypted'] ??
                detail['encryptedContent'] ??
                detail['data'];
            if (opaque === undefined || opaque === null) {
                continue;
            }

            parts.push({
                partType,
                payload: {
                    opaque,
                },
            });
            continue;
        }

        const text = parseAnthropicReasoningDetailDisplayText(detail);
        if (!text) {
            continue;
        }

        input.state.yieldedDisplayableReasoningDetails = true;
        parts.push({
            partType,
            payload: { text },
        });
    }

    return parts;
}

export function parseAnthropicContentTextParts(content: unknown): RuntimeParsedPart[] {
    if (typeof content === 'string' && content.length > 0) {
        return [
            {
                partType: 'text',
                payload: { text: content },
            },
        ];
    }

    if (!Array.isArray(content)) {
        return [];
    }

    const parts: RuntimeParsedPart[] = [];
    for (const item of content) {
        if (!isRecord(item)) {
            continue;
        }

        const text =
            readOptionalString(item['text']) ??
            (isRecord(item['text']) ? readOptionalString(item['text']['value']) : undefined) ??
            readOptionalString(item['delta']);

        if (!text) {
            continue;
        }

        parts.push({
            partType: 'text',
            payload: { text },
        });
    }

    return parts;
}

export function parseAnthropicTopLevelReasoningParts(input: {
    container: Record<string, unknown>;
    state: AnthropicDisplayableReasoningState;
}): RuntimeParsedPart[] {
    if (input.state.yieldedDisplayableReasoningDetails) {
        return [];
    }

    const reasoningText =
        readOptionalString(input.container['reasoning']) ??
        readOptionalString(input.container['reasoning_content']);
    if (!reasoningText) {
        return [];
    }

    return [
        {
            partType: 'reasoning',
            payload: { text: reasoningText },
        },
    ];
}

export function parseAnthropicToolCallPart(input: {
    callId: unknown;
    toolName: unknown;
    argumentsText: unknown;
    sourceLabel: string;
}): ProviderAdapterResult<RuntimeParsedPart> {
    return parseStructuredToolCall({
        callId: input.callId,
        toolName: input.toolName,
        argumentsText:
            typeof input.argumentsText === 'string' && input.argumentsText.length > 0
                ? input.argumentsText
                : '{}',
        sourceLabel: input.sourceLabel,
    });
}

export function parseAnthropicDirectBlockParts(input: {
    block: AnthropicDirectBlock;
    includeEncrypted: boolean;
    sourceLabel: string;
    emittedToolCallIds?: Set<string>;
}): ProviderAdapterResult<RuntimeParsedPart[]> {
    const { block } = input;
    if (block.type === 'thinking') {
        if (block.text.trim().length === 0) {
            return okProviderAdapter([]);
        }

        return okProviderAdapter([
            {
                partType: 'reasoning',
                payload: {
                    text: block.text,
                    detailType: 'anthropic.thinking',
                    detailFormat: 'anthropic_messages',
                    ...(block.signature ? { detailSignature: block.signature } : {}),
                    detailIndex: block.index,
                },
            },
        ]);
    }

    if (block.type === 'redacted_thinking') {
        if (!input.includeEncrypted || block.opaque === undefined || block.opaque === null) {
            return okProviderAdapter([]);
        }

        return okProviderAdapter([
            {
                partType: 'reasoning_encrypted',
                payload: {
                    opaque: block.opaque,
                    detailType: 'anthropic.redacted_thinking',
                    detailFormat: 'anthropic_messages',
                    detailIndex: block.index,
                },
            },
        ]);
    }

    const toolCallResult = parseAnthropicToolCallPart({
        callId: block.callId,
        toolName: block.toolName,
        argumentsText: block.argumentsText,
        sourceLabel: input.sourceLabel,
    });
    if (toolCallResult.isErr()) {
        return errProviderAdapter(toolCallResult.error.code, toolCallResult.error.message);
    }

    const callId = toolCallResult.value.payload['callId'];
    if (typeof callId !== 'string') {
        return errProviderAdapter('invalid_payload', `${input.sourceLabel} emitted a tool call without a stable id.`);
    }

    if (input.emittedToolCallIds?.has(callId)) {
        return errProviderAdapter('invalid_payload', `${input.sourceLabel} emitted duplicate tool call id "${callId}".`);
    }

    input.emittedToolCallIds?.add(callId);
    return okProviderAdapter([toolCallResult.value]);
}

export function parseAnthropicDirectContentBlocks(input: {
    content: unknown;
    includeEncrypted: boolean;
    sourceLabel: string;
}): ProviderAdapterResult<RuntimeParsedCompletion> {
    const parts: RuntimeParsedPart[] = [];
    const content = Array.isArray(input.content) ? input.content : [];
    const emittedToolCallIds = new Set<string>();

    for (const rawBlock of content) {
        if (!isRecord(rawBlock)) {
            continue;
        }

        const blockType = readOptionalString(rawBlock['type']);
        if (blockType === 'text') {
            const text = readOptionalString(rawBlock['text']);
            if (text) {
                parts.push({
                    partType: 'text',
                    payload: { text },
                });
            }
            continue;
        }

        if (blockType === 'thinking') {
            const signature = readOptionalString(rawBlock['signature']);
            const parsed = parseAnthropicDirectBlockParts({
                block: {
                    index: readOptionalNumber(rawBlock['index']) ?? 0,
                    type: 'thinking',
                    text: readOptionalString(rawBlock['thinking']) ?? '',
                    argumentsText: '',
                    ...(signature ? { signature } : {}),
                },
                includeEncrypted: input.includeEncrypted,
                sourceLabel: input.sourceLabel,
            });
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }
            parts.push(...parsed.value);
            continue;
        }

        if (blockType === 'redacted_thinking') {
            const parsed = parseAnthropicDirectBlockParts({
                block: {
                    index: readOptionalNumber(rawBlock['index']) ?? 0,
                    type: 'redacted_thinking',
                    text: '',
                    opaque: rawBlock['data'],
                    argumentsText: '',
                },
                includeEncrypted: input.includeEncrypted,
                sourceLabel: input.sourceLabel,
            });
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }
            parts.push(...parsed.value);
            continue;
        }

        if (blockType === 'tool_use') {
            const callId = readOptionalString(rawBlock['id']);
            const toolName = readOptionalString(rawBlock['name']);
            const parsed = parseAnthropicDirectBlockParts({
                block: {
                    index: readOptionalNumber(rawBlock['index']) ?? 0,
                    type: 'tool_use',
                    text: '',
                    argumentsText: JSON.stringify(isRecord(rawBlock['input']) ? rawBlock['input'] : {}),
                    ...(callId ? { callId } : {}),
                    ...(toolName ? { toolName } : {}),
                },
                includeEncrypted: input.includeEncrypted,
                sourceLabel: input.sourceLabel,
                emittedToolCallIds,
            });
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }
            parts.push(...parsed.value);
        }
    }

    return okProviderAdapter({
        parts,
        usage: {},
    });
}

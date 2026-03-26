import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { isRecord, readOptionalNumber, readOptionalString } from '@/app/backend/providers/adapters/geminiShared';
import { parseStructuredToolCall, type RuntimeParsedPart } from '@/app/backend/providers/adapters/runtimePayload';
import type { ProviderRuntimeUsage } from '@/app/backend/providers/types';

export interface GeminiReasoningState {
    reasoningTextBuffers: Map<string, string>;
    yieldedDisplayableReasoningDetails: boolean;
}

export interface GeminiToolCallState {
    emittedToolCallIds: Set<string>;
    nextSyntheticToolCallIndex: number;
}

export function normalizeGeminiUsageMetadata(value: unknown): ProviderRuntimeUsage | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const usage: ProviderRuntimeUsage = {};
    const inputTokens = readOptionalNumber(value['promptTokenCount']) ?? readOptionalNumber(value['totalTokenCount']);
    const outputTokens = readOptionalNumber(value['candidatesTokenCount']);
    const totalTokens = readOptionalNumber(value['totalTokenCount']);
    const cachedTokens = readOptionalNumber(value['cachedContentTokenCount']);
    const reasoningTokens = readOptionalNumber(value['thoughtsTokenCount']);

    if (inputTokens !== undefined) usage.inputTokens = inputTokens;
    if (outputTokens !== undefined) usage.outputTokens = outputTokens;
    if (totalTokens !== undefined) usage.totalTokens = totalTokens;
    if (cachedTokens !== undefined) usage.cachedTokens = cachedTokens;
    if (reasoningTokens !== undefined) usage.reasoningTokens = reasoningTokens;

    return Object.keys(usage).length > 0 ? usage : undefined;
}

export function normalizeGeminiChatUsage(value: unknown): ProviderRuntimeUsage | undefined {
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

function classifyGeminiReasoningPart(detailType: string | undefined): RuntimeParsedPart['partType'] | null {
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

function readReasoningMetadata(detail: Record<string, unknown>) {
    return {
        ...(readOptionalString(detail['type']) ? { detailType: readOptionalString(detail['type']) } : {}),
        ...(readOptionalString(detail['id']) ? { detailId: readOptionalString(detail['id']) } : {}),
        ...(readOptionalString(detail['format']) ? { detailFormat: readOptionalString(detail['format']) } : {}),
        ...(readOptionalString(detail['signature'])
            ? { detailSignature: readOptionalString(detail['signature']) }
            : {}),
        ...(readOptionalNumber(detail['index']) !== undefined
            ? { detailIndex: readOptionalNumber(detail['index']) }
            : {}),
    };
}

function buildReasoningStateKey(detail: Record<string, unknown>): string {
    return [
        readOptionalString(detail['type']) ?? 'reasoning.text',
        readOptionalString(detail['id']) ?? '',
        String(readOptionalNumber(detail['index']) ?? 0),
    ].join('|');
}

function diffCumulativeText(previousValue: string, nextValue: string): string {
    return nextValue.startsWith(previousValue) ? nextValue.slice(previousValue.length) : nextValue;
}

function parseReasoningDetailText(detail: Record<string, unknown>): string | undefined {
    return (
        readOptionalString(detail['text']) ??
        readOptionalString(detail['summary']) ??
        readOptionalString(detail['content']) ??
        readOptionalString(detail['delta'])
    );
}

export function parseGeminiReasoningDetails(input: {
    value: unknown;
    includeEncrypted: boolean;
    state: GeminiReasoningState;
    cumulative: boolean;
}): RuntimeParsedPart[] {
    const details = Array.isArray(input.value) ? input.value : [];
    const parts: RuntimeParsedPart[] = [];

    for (const detail of details) {
        if (!isRecord(detail)) {
            continue;
        }

        const partType = classifyGeminiReasoningPart(readOptionalString(detail['type']));
        if (!partType) {
            continue;
        }

        const metadata = readReasoningMetadata(detail);
        if (partType === 'reasoning_encrypted') {
            if (!input.includeEncrypted) {
                continue;
            }

            const opaque =
                detail['data'] ?? detail['encrypted_content'] ?? detail['encrypted'] ?? detail['encryptedContent'];
            if (opaque === undefined || opaque === null) {
                continue;
            }

            parts.push({
                partType,
                payload: {
                    opaque,
                    ...metadata,
                },
            });
            continue;
        }

        const text = parseReasoningDetailText(detail);
        if (!text) {
            continue;
        }

        const nextText = input.cumulative
            ? diffCumulativeText(input.state.reasoningTextBuffers.get(buildReasoningStateKey(detail)) ?? '', text)
            : text;
        if (input.cumulative) {
            input.state.reasoningTextBuffers.set(buildReasoningStateKey(detail), text);
        }
        if (nextText.length === 0) {
            continue;
        }

        input.state.yieldedDisplayableReasoningDetails = true;
        parts.push({
            partType,
            payload: {
                text: nextText,
                ...metadata,
            },
        });
    }

    return parts;
}

export function parseGeminiContentTextParts(content: unknown): RuntimeParsedPart[] {
    if (typeof content === 'string' && content.length > 0) {
        return [
            {
                partType: 'text',
                payload: {
                    text: content,
                },
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

export function parseGeminiTopLevelReasoningParts(input: {
    container: Record<string, unknown>;
    state: GeminiReasoningState;
}): RuntimeParsedPart[] {
    if (input.state.yieldedDisplayableReasoningDetails) {
        return [];
    }

    const reasoningText =
        readOptionalString(input.container['reasoning']) ?? readOptionalString(input.container['reasoning_content']);
    const reasoningSummary = readOptionalString(input.container['reasoning_summary']);
    const parts: RuntimeParsedPart[] = [];

    if (reasoningText) {
        parts.push({
            partType: 'reasoning',
            payload: { text: reasoningText },
        });
    }

    if (reasoningSummary) {
        parts.push({
            partType: 'reasoning_summary',
            payload: { text: reasoningSummary },
        });
    }

    return parts;
}

export function createSyntheticGeminiToolCallId(state: GeminiToolCallState): string {
    const callId = `gemini_call_${String(state.nextSyntheticToolCallIndex)}`;
    state.nextSyntheticToolCallIndex += 1;
    return callId;
}

export function parseGeminiDirectPart(input: {
    part: Record<string, unknown>;
    includeEncrypted: boolean;
    state: GeminiToolCallState;
    sourceLabel: string;
}): ProviderAdapterResult<RuntimeParsedPart[]> {
    const runtimeParts: RuntimeParsedPart[] = [];
    const thoughtSignature = readOptionalString(input.part['thoughtSignature']);
    const thought = input.part['thought'] === true;

    if (isRecord(input.part['functionCall'])) {
        const functionCall = input.part['functionCall'];
        const toolName = readOptionalString(functionCall['name']);
        if (!toolName) {
            return errProviderAdapter('invalid_payload', `${input.sourceLabel} emitted a tool call without a name.`);
        }

        const callId =
            readOptionalString(functionCall['id']) ??
            readOptionalString(input.part['id']) ??
            createSyntheticGeminiToolCallId(input.state);
        if (input.state.emittedToolCallIds.has(callId)) {
            return errProviderAdapter(
                'invalid_payload',
                `${input.sourceLabel} emitted duplicate tool call id "${callId}".`
            );
        }
        input.state.emittedToolCallIds.add(callId);

        if (thoughtSignature && input.includeEncrypted) {
            runtimeParts.push({
                partType: 'reasoning_encrypted',
                payload: {
                    opaque: thoughtSignature,
                    detailType: 'google_generativeai.thought_signature',
                    detailId: callId,
                    detailFormat: 'google_generativeai',
                },
            });
        }

        const parsedToolCall = parseStructuredToolCall({
            callId,
            toolName,
            argumentsText: JSON.stringify(functionCall['args'] ?? {}),
            sourceLabel: input.sourceLabel,
        });
        if (parsedToolCall.isErr()) {
            return errProviderAdapter(parsedToolCall.error.code, parsedToolCall.error.message);
        }

        runtimeParts.push(parsedToolCall.value);
        return okProviderAdapter(runtimeParts);
    }

    const text = readOptionalString(input.part['text']);
    if (!text) {
        return okProviderAdapter(runtimeParts);
    }

    if (thought) {
        runtimeParts.push({
            partType: 'reasoning_summary',
            payload: {
                text,
                detailType: 'google_generativeai.thought',
                detailFormat: 'google_generativeai',
            },
        });
        if (thoughtSignature && input.includeEncrypted) {
            runtimeParts.push({
                partType: 'reasoning_encrypted',
                payload: {
                    opaque: thoughtSignature,
                    detailType: 'google_generativeai.thought_signature',
                    detailFormat: 'google_generativeai',
                },
            });
        }
    } else {
        runtimeParts.push({
            partType: 'text',
            payload: { text },
        });
    }

    return okProviderAdapter(runtimeParts);
}

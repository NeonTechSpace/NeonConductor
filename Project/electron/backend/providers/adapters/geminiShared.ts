import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

export interface GeminiReasoningDetail {
    type: string;
    text?: string;
    summary?: string;
    data?: string;
    signature?: string;
    id?: string;
    format?: string;
    index?: number;
}

export type GeminiCompatibilityMessage =
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
          reasoning_details?: GeminiReasoningDetail[];
      };

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return value.length > 0 ? value : undefined;
}

export function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function extractBase64Data(dataUrl: string): string | null {
    const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
    return match?.[2] ?? null;
}

function serializeOpaqueReasoningValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value.length > 0 ? value : undefined;
    }

    if (value === undefined || value === null) {
        return undefined;
    }

    try {
        const serialized = JSON.stringify(value);
        return serialized && serialized.length > 0 ? serialized : undefined;
    } catch {
        return undefined;
    }
}

function detailTypeForContextPart(
    part: Extract<
        NonNullable<ProviderRuntimeInput['contextMessages']>[number]['parts'][number],
        { type: 'reasoning' | 'reasoning_summary' | 'reasoning_encrypted' }
    >
): string {
    if (part.type === 'reasoning_summary') {
        return part.detailType ?? 'reasoning.summary';
    }

    if (part.type === 'reasoning_encrypted') {
        return part.detailType ?? 'reasoning.encrypted';
    }

    return part.detailType ?? 'reasoning.text';
}

function toReasoningDetail(
    part: Extract<
        NonNullable<ProviderRuntimeInput['contextMessages']>[number]['parts'][number],
        { type: 'reasoning' | 'reasoning_summary' | 'reasoning_encrypted' }
    >
): GeminiReasoningDetail | null {
    const type = detailTypeForContextPart(part);
    const baseDetail = {
        type,
        ...(part.detailId ? { id: part.detailId } : {}),
        ...(part.detailFormat ? { format: part.detailFormat } : {}),
        ...(part.detailSignature ? { signature: part.detailSignature } : {}),
        ...(part.detailIndex !== undefined ? { index: part.detailIndex } : {}),
    };

    if (part.type === 'reasoning_encrypted') {
        const data = serializeOpaqueReasoningValue(part.opaque);
        return data
            ? {
                  ...baseDetail,
                  data,
              }
            : null;
    }

    return {
        ...baseDetail,
        ...(part.type === 'reasoning_summary' ? { summary: part.text } : { text: part.text }),
    };
}

function consolidateReasoningDetails(details: GeminiReasoningDetail[]): GeminiReasoningDetail[] {
    if (details.length === 0) {
        return [];
    }

    const grouped = new Map<string, GeminiReasoningDetail[]>();
    for (const detail of details) {
        if (detail.type === 'reasoning.encrypted' && !detail.data) {
            continue;
        }

        const key = `${detail.type}|${String(detail.index ?? 0)}`;
        const existing = grouped.get(key) ?? [];
        existing.push(detail);
        grouped.set(key, existing);
    }

    const consolidated: GeminiReasoningDetail[] = [];
    for (const [, entries] of [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
        let concatenatedText = '';
        let concatenatedSummary = '';
        let lastData: string | undefined;
        let signature: string | undefined;
        let id: string | undefined;
        let format: string | undefined;
        let type = entries[0]?.type ?? 'reasoning.text';
        const index = entries[0]?.index;

        for (const entry of entries) {
            if (entry.text) {
                concatenatedText += entry.text;
            }
            if (entry.summary) {
                concatenatedSummary += entry.summary;
            }
            if (entry.data) {
                lastData = entry.data;
            }
            if (entry.signature) {
                signature = entry.signature;
            }
            if (entry.id) {
                id = entry.id;
            }
            if (entry.format) {
                format = entry.format;
            }
            if (entry.type) {
                type = entry.type;
            }
        }

        if (concatenatedText.length > 0) {
            consolidated.push({
                type,
                text: concatenatedText,
                ...(signature ? { signature } : {}),
                ...(id ? { id } : {}),
                ...(format ? { format } : {}),
                ...(index !== undefined ? { index } : {}),
            });
        } else if (concatenatedSummary.length > 0) {
            consolidated.push({
                type,
                summary: concatenatedSummary,
                ...(signature ? { signature } : {}),
                ...(id ? { id } : {}),
                ...(format ? { format } : {}),
                ...(index !== undefined ? { index } : {}),
            });
        }

        if (lastData) {
            consolidated.push({
                type,
                data: lastData,
                ...(signature ? { signature } : {}),
                ...(id ? { id } : {}),
                ...(format ? { format } : {}),
                ...(index !== undefined ? { index } : {}),
            });
        }
    }

    return consolidated;
}

function buildMessageContent(
    message: NonNullable<ProviderRuntimeInput['contextMessages']>[number]
): GeminiCompatibilityMessage['content'] {
    const contentParts = message.parts.filter(
        (
            part
        ): part is Extract<(typeof message.parts)[number], { type: 'text' | 'image' }> =>
            part.type === 'text' || part.type === 'image'
    );

    if (contentParts.length === 0) {
        return null;
    }

    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
        return contentParts[0].text;
    }

    return contentParts.map((part) =>
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
}

function buildRawGeminiCompatibilityMessages(input: ProviderRuntimeInput): GeminiCompatibilityMessage[] {
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

    const messages: GeminiCompatibilityMessage[] = [];
    for (const message of contextMessages) {
        if (message.role === 'tool') {
            messages.push(
                ...message.parts
                    .filter(
                        (
                            part
                        ): part is Extract<(typeof message.parts)[number], { type: 'tool_result' }> =>
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

        const toolCalls = message.parts
            .filter(
                (
                    part
                ): part is Extract<(typeof message.parts)[number], { type: 'tool_call' }> => part.type === 'tool_call'
            )
            .map((part) => ({
                id: part.callId,
                type: 'function' as const,
                function: {
                    name: part.toolName,
                    arguments: part.argumentsText,
                },
            }));
        const reasoningDetails = consolidateReasoningDetails(
            message.parts
                .filter(
                    (
                        part
                    ): part is Extract<
                        (typeof message.parts)[number],
                        { type: 'reasoning' | 'reasoning_summary' | 'reasoning_encrypted' }
                    > =>
                        part.type === 'reasoning' ||
                        part.type === 'reasoning_summary' ||
                        part.type === 'reasoning_encrypted'
                )
                .map((part) => toReasoningDetail(part))
                .filter((part): part is GeminiReasoningDetail => part !== null)
        );
        const content = buildMessageContent(message);

        messages.push({
            role: message.role,
            content:
                message.role === 'assistant' && content === null && (toolCalls.length > 0 || reasoningDetails.length > 0)
                    ? ''
                    : content,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            ...(reasoningDetails.length > 0 ? { reasoning_details: reasoningDetails } : {}),
        });
    }

    return messages;
}

function hasEncryptedReasoningDetail(details: GeminiReasoningDetail[]): boolean {
    return details.some((detail) => detail.type.toLowerCase().includes('encrypted') && typeof detail.data === 'string');
}

function hasMessageContent(content: GeminiCompatibilityMessage['content']): boolean {
    if (typeof content === 'string') {
        return content.length > 0;
    }

    return Array.isArray(content) && content.length > 0;
}

function sanitizeGeminiCompatibilityMessages(messages: GeminiCompatibilityMessage[]): GeminiCompatibilityMessage[] {
    const droppedToolCallIds = new Set<string>();
    const sanitized: GeminiCompatibilityMessage[] = [];

    for (const message of messages) {
        if (message.role === 'tool') {
            if (droppedToolCallIds.has(message.tool_call_id)) {
                continue;
            }

            sanitized.push(message);
            continue;
        }

        if (message.role !== 'assistant' || !message.tool_calls || message.tool_calls.length === 0) {
            sanitized.push(message);
            continue;
        }

        const reasoningDetails = message.reasoning_details ?? [];
        if (reasoningDetails.length === 0) {
            for (const toolCall of message.tool_calls) {
                droppedToolCallIds.add(toolCall.id);
            }

            if (!hasMessageContent(message.content)) {
                continue;
            }

            sanitized.push({
                role: 'assistant',
                content: message.content,
            });
            continue;
        }

        const validToolCalls: Array<{
            id: string;
            type: 'function';
            function: {
                name: string;
                arguments: string;
            };
        }> = [];
        const validReasoningDetails: GeminiReasoningDetail[] = [];
        const matchedToolCallIds = new Set<string>();
        const hasTaggedReasoningDetails = reasoningDetails.some((detail) => typeof detail.id === 'string' && detail.id.length > 0);

        for (const toolCall of message.tool_calls) {
            const matchingDetails = reasoningDetails.filter((detail) => detail.id === toolCall.id);
            if (matchingDetails.length === 0 && hasTaggedReasoningDetails) {
                droppedToolCallIds.add(toolCall.id);
                continue;
            }

            validToolCalls.push(toolCall);
            matchedToolCallIds.add(toolCall.id);
            validReasoningDetails.push(...matchingDetails);
        }

        validReasoningDetails.push(...reasoningDetails.filter((detail) => !detail.id));
        const consolidatedReasoningDetails = consolidateReasoningDetails(validReasoningDetails);

        const firstValidToolCall = validToolCalls[0];
        if (firstValidToolCall && !hasEncryptedReasoningDetail(consolidatedReasoningDetails)) {
            consolidatedReasoningDetails.unshift({
                type: 'reasoning.encrypted',
                data: 'skip_thought_signature_validator',
                id: firstValidToolCall.id,
                format: 'google-gemini-v1',
                index: 0,
            });
        }

        const filteredReasoningDetails: GeminiReasoningDetail[] = consolidatedReasoningDetails.filter(
            (detail) => !detail.id || matchedToolCallIds.has(detail.id)
        );
        if (validToolCalls.length === 0 && filteredReasoningDetails.length === 0 && !hasMessageContent(message.content)) {
            continue;
        }

        sanitized.push({
            role: 'assistant',
            content:
                validToolCalls.length > 0 || filteredReasoningDetails.length > 0
                    ? (message.content ?? '')
                    : message.content,
            ...(validToolCalls.length > 0 ? { tool_calls: validToolCalls } : {}),
            ...(filteredReasoningDetails.length > 0 ? { reasoning_details: filteredReasoningDetails } : {}),
        });
    }

    return sanitized;
}

export function buildGeminiCompatibilityMessages(input: ProviderRuntimeInput): GeminiCompatibilityMessage[] {
    return sanitizeGeminiCompatibilityMessages(buildRawGeminiCompatibilityMessages(input));
}

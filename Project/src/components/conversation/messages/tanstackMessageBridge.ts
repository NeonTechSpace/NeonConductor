
import { buildMessageCopyPayloads } from '@/web/components/conversation/messages/messageCopy';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';
import { readImageMimeType } from '@/app/shared/imageMimeType';

import type { EntityId } from '@/shared/contracts';
import { parseAssistantStatusPartPayload } from '@/shared/contracts/types/messagePart';

import type { MessagePart, ToolCallPart, ToolResultPart, UIMessage } from '@tanstack/ai';

export interface ConversationTanstackMessage {
    id: string;
    runId: string;
    role: MessageRecord['role'];
    createdAt: string;
    uiMessage: UIMessage;
    renderParts: ConversationTanstackRenderPart[];
    plainCopyText?: string;
    rawCopyText?: string;
    editableText?: string;
    deliveryState?: 'sending';
    isOptimistic?: boolean;
}

export type ConversationTanstackRenderPart =
    | {
          key: string;
          kind: 'text';
          text: string;
      }
    | {
          key: string;
          kind: 'image';
          mediaId: EntityId<'media'>;
          mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
          width: number;
          height: number;
      }
    | {
          key: string;
          kind: 'reasoning';
          text: string;
          providerLimitedReasoning: boolean;
      }
    | {
          key: string;
          kind: 'tool_call';
          callId: string;
          toolName: string;
          argumentsText: string;
      }
    | {
          key: string;
          kind: 'tool_result';
          callId: string;
          outputText: string;
      }
    | {
          key: string;
          kind: 'status';
          code: 'received' | 'stalled' | 'failed_before_output';
          label: string;
          elapsedMs?: number;
      };

interface ConversationImageMetadata {
    mediaId: EntityId<'media'>;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    width: number;
    height: number;
}

function readTextPayload(part: MessagePartRecord): string | null {
    const text = part.payload['text'];
    if (typeof text !== 'string') {
        return null;
    }

    return text.trim().length > 0 ? text : null;
}

function buildProjectedParts(message: MessageRecord, parts: MessagePartRecord[]): ConversationTanstackRenderPart[] {
    const projected: ConversationTanstackRenderPart[] = [];

    for (const part of parts) {
        if (part.partType === 'reasoning_encrypted') {
            continue;
        }

        if (part.partType === 'image') {
            const rawMediaId = part.payload['mediaId'];
            const mimeType = part.payload['mimeType'];
            const width = part.payload['width'];
            const height = part.payload['height'];
            const mediaId = typeof rawMediaId === 'string' ? rawMediaId : undefined;
            const normalizedMimeType = readImageMimeType(mimeType);

            if (
                isEntityId(mediaId, 'media') &&
                normalizedMimeType &&
                typeof width === 'number' &&
                typeof height === 'number'
            ) {
                projected.push({
                    key: part.id,
                    kind: 'image',
                    mediaId,
                    mimeType: normalizedMimeType,
                    width,
                    height,
                });
            }
            continue;
        }

        if (part.partType === 'reasoning' || part.partType === 'reasoning_summary') {
            const text = readTextPayload(part);
            if (!text) {
                continue;
            }

            projected.push({
                key: part.id,
                kind: 'reasoning',
                text,
                providerLimitedReasoning: part.partType === 'reasoning_summary',
            });
            continue;
        }

        if (part.partType === 'status' && message.role === 'assistant') {
            const statusPayload = parseAssistantStatusPartPayload(part.payload);
            if (!statusPayload) {
                continue;
            }

            projected.push({
                key: part.id,
                kind: 'status',
                code: statusPayload.code,
                label: statusPayload.label,
                ...(statusPayload.elapsedMs !== undefined ? { elapsedMs: statusPayload.elapsedMs } : {}),
            });
            continue;
        }

        if (part.partType === 'tool_call' && message.role === 'assistant') {
            const toolName = typeof part.payload['toolName'] === 'string' ? part.payload['toolName'] : 'tool';
            const argumentsText =
                typeof part.payload['argumentsText'] === 'string' ? part.payload['argumentsText'] : '';
            const callId = typeof part.payload['callId'] === 'string' ? part.payload['callId'] : part.id;

            projected.push({
                key: part.id,
                kind: 'tool_call',
                callId,
                toolName,
                argumentsText,
            });
            continue;
        }

        if (part.partType === 'tool_result' && message.role === 'tool') {
            const callId = typeof part.payload['callId'] === 'string' ? part.payload['callId'] : part.id;
            const outputText = typeof part.payload['outputText'] === 'string' ? part.payload['outputText'] : '';

            projected.push({
                key: part.id,
                kind: 'tool_result',
                callId,
                outputText,
            });
            continue;
        }

        const text = readTextPayload(part);
        if (!text) {
            continue;
        }

        projected.push({
            key: part.id,
            kind: 'text',
            text,
        });
    }

    return projected;
}

function buildMessageParts(projectedParts: ConversationTanstackRenderPart[]): MessagePart[] {
    const projected: MessagePart[] = [];

    for (const part of projectedParts) {
        if (part.kind === 'image') {
            const metadata: ConversationImageMetadata = {
                mediaId: part.mediaId,
                mimeType: part.mimeType,
                width: part.width,
                height: part.height,
            };

            projected.push({
                type: 'image',
                source: {
                    type: 'url',
                    value: `neonconductor://media/${part.mediaId}`,
                    mimeType: part.mimeType,
                },
                metadata,
            });
            continue;
        }

        if (part.kind === 'reasoning') {
            projected.push({
                type: 'thinking',
                content: part.text,
            });
            continue;
        }

        if (part.kind === 'tool_call') {
            projected.push({
                type: 'tool-call',
                id: part.callId,
                name: part.toolName,
                arguments: part.argumentsText,
                state: 'input-complete',
            } satisfies ToolCallPart);
            continue;
        }

        if (part.kind === 'tool_result') {
            projected.push({
                type: 'tool-result',
                toolCallId: part.callId,
                content: part.outputText,
                state: 'complete',
            } satisfies ToolResultPart);
            continue;
        }

        if (part.kind !== 'text') {
            continue;
        }

        projected.push({
            type: 'text',
            content: part.text,
        });
    }

    return projected;
}

function buildEditableText(message: MessageRecord, uiMessage: UIMessage): string | undefined {
    if (message.role !== 'user') {
        return undefined;
    }

    const editableText = uiMessage.parts
        .filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.content)
        .join('\n\n');

    return editableText.trim().length > 0 ? editableText : undefined;
}

type CopyPayloadBodyEntry = Parameters<typeof buildMessageCopyPayloads>[0]['body'][number];

function buildCopyPayloadBody(
    message: MessageRecord,
    renderParts: ConversationTanstackRenderPart[]
): CopyPayloadBodyEntry[] {
    const body: CopyPayloadBodyEntry[] = [];

    for (const part of renderParts) {
        if (part.kind === 'text') {
            body.push({
                id: part.key,
                type:
                    message.role === 'assistant'
                        ? 'assistant_text'
                        : message.role === 'user'
                          ? 'user_text'
                          : 'system_text',
                text: part.text,
                providerLimitedReasoning: false,
            });
            continue;
        }

        if (part.kind === 'reasoning') {
            body.push({
                id: part.key,
                type: 'assistant_reasoning',
                text: part.text,
                providerLimitedReasoning: part.providerLimitedReasoning,
            });
            continue;
        }

        if (part.kind === 'tool_call') {
            body.push({
                id: part.key,
                type: 'assistant_tool_call',
                text: part.argumentsText.length > 0 ? `\`\`\`json\n${part.argumentsText}\n\`\`\`` : '',
                providerLimitedReasoning: false,
                displayLabel: `Tool Call: ${part.toolName}`,
            });
            continue;
        }

        if (part.kind === 'tool_result') {
            body.push({
                id: part.key,
                type: 'tool_result',
                text: part.outputText,
                providerLimitedReasoning: false,
                displayLabel: 'Tool Result',
            });
        }
    }

    return body;
}

export function projectOptimisticConversationUserMessage(
    input: OptimisticConversationUserMessage
): ConversationTanstackMessage {
    const prompt = input.prompt.trim();
    const textPartKey = `${input.id}_text`;
    const renderParts: ConversationTanstackRenderPart[] =
        prompt.length > 0
            ? [
                  {
                      key: textPartKey,
                      kind: 'text',
                      text: prompt,
                  },
              ]
            : [];
    const uiMessage: UIMessage = {
        id: input.id,
        role: 'user',
        createdAt: new Date(input.createdAt),
        parts: buildMessageParts(renderParts),
    };
    const copyPayloads = buildMessageCopyPayloads({
        body:
            prompt.length > 0
                ? [
                      {
                          id: textPartKey,
                          type: 'user_text',
                          text: prompt,
                          providerLimitedReasoning: false,
                      },
                  ]
                : [],
    });

    return {
        id: input.id,
        runId: input.runId,
        role: 'user',
        createdAt: input.createdAt,
        uiMessage,
        renderParts,
        ...(copyPayloads.plainText ? { plainCopyText: copyPayloads.plainText } : {}),
        ...(copyPayloads.rawText ? { rawCopyText: copyPayloads.rawText } : {}),
        ...(prompt.length > 0 ? { editableText: prompt } : {}),
        deliveryState: 'sending',
        isOptimistic: true,
    };
}

export function projectConversationTanstackMessage(
    message: MessageRecord,
    messageParts: MessagePartRecord[]
): ConversationTanstackMessage {
    const renderParts = buildProjectedParts(message, messageParts);
    const uiMessage: UIMessage = {
        id: message.id,
        role: message.role === 'tool' ? 'assistant' : message.role,
        createdAt: new Date(message.createdAt),
        parts: buildMessageParts(renderParts),
    };
    const editableText = buildEditableText(message, uiMessage);
    const copyPayloads = buildMessageCopyPayloads({
        body: buildCopyPayloadBody(message, renderParts),
    });

    return {
        id: message.id,
        runId: message.runId,
        role: message.role,
        createdAt: message.createdAt,
        uiMessage,
        renderParts,
        ...(copyPayloads.plainText ? { plainCopyText: copyPayloads.plainText } : {}),
        ...(copyPayloads.rawText ? { rawCopyText: copyPayloads.rawText } : {}),
        ...(editableText ? { editableText } : {}),
    };
}

export function projectConversationTanstackMessages(
    messages: MessageRecord[],
    partsByMessageId: Map<string, MessagePartRecord[]>
): ConversationTanstackMessage[] {
    return messages.map((message) =>
        projectConversationTanstackMessage(message, partsByMessageId.get(message.id) ?? [])
    );
}

import { buildMessageCopyPayloads } from '@/web/components/conversation/messages/messageCopy';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';


import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { readImageMimeType } from '@/app/shared/imageMimeType';

export type MessageTimelineTextEntryType = 'assistant_reasoning' | 'assistant_text' | 'user_text' | 'system_text';
export type MessageTimelineImageEntryType = 'assistant_image' | 'user_image' | 'system_image';

export type MessageTimelineBodyEntry =
    | {
          id: string;
          type: MessageTimelineTextEntryType;
          text: string;
          providerLimitedReasoning: boolean;
      }
      | {
          id: string;
          type: MessageTimelineImageEntryType;
          mediaId: EntityId<'media'>;
          mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
          width: number;
          height: number;
      };

export interface MessageTimelineEntry {
    id: string;
    runId: MessageRecord['runId'];
    role: MessageRecord['role'];
    createdAt: string;
    body: MessageTimelineBodyEntry[];
    plainCopyText?: string;
    rawCopyText?: string;
    editableText?: string;
}

export interface BottomThresholdInput {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
    thresholdPx?: number;
}

const DEFAULT_BOTTOM_THRESHOLD_PX = 96;

function readTextPayload(part: MessagePartRecord): string | null {
    const text = part.payload['text'];
    if (typeof text !== 'string') {
        return null;
    }

    const normalized = text.trim();
    return normalized.length > 0 ? normalized : null;
}

function mapImageEntryType(role: MessageRecord['role']): MessageTimelineImageEntryType | null {
    if (role === 'assistant') {
        return 'assistant_image';
    }
    if (role === 'user') {
        return 'user_image';
    }
    if (role === 'system') {
        return 'system_image';
    }

    return null;
}

function mapTextEntryType(role: MessageRecord['role']): Exclude<MessageTimelineTextEntryType, 'assistant_reasoning'> | null {
    if (role === 'assistant') {
        return 'assistant_text';
    }
    if (role === 'user') {
        return 'user_text';
    }
    if (role === 'system') {
        return 'system_text';
    }

    return null;
}

function buildBodyEntries(message: MessageRecord, parts: MessagePartRecord[]): MessageTimelineBodyEntry[] {
    const projected: MessageTimelineBodyEntry[] = [];

    for (const part of parts) {
        if (part.partType === 'reasoning_encrypted') {
            continue;
        }

        if (part.partType === 'image') {
            const rawMediaId = part.payload['mediaId'];
            const mimeType = part.payload['mimeType'];
            const width = part.payload['width'];
            const height = part.payload['height'];
            const imageEntryType = mapImageEntryType(message.role);
            const mediaId = typeof rawMediaId === 'string' ? rawMediaId : undefined;
            const normalizedMimeType = readImageMimeType(mimeType);

            if (
                imageEntryType &&
                isEntityId(mediaId, 'media') &&
                normalizedMimeType &&
                typeof width === 'number' &&
                typeof height === 'number'
            ) {
                projected.push({
                    id: part.id,
                    type: imageEntryType,
                    mediaId,
                    mimeType: normalizedMimeType,
                    width,
                    height,
                });
            }
            continue;
        }

        const text = readTextPayload(part);
        if (!text) {
            continue;
        }

        if (part.partType === 'reasoning') {
            projected.push({
                id: part.id,
                type: 'assistant_reasoning',
                text,
                providerLimitedReasoning: false,
            });
            continue;
        }

        if (part.partType === 'reasoning_summary') {
            projected.push({
                id: part.id,
                type: 'assistant_reasoning',
                text,
                providerLimitedReasoning: true,
            });
            continue;
        }

        const textEntryType = mapTextEntryType(message.role);
        if (!textEntryType) {
            continue;
        }

        projected.push({
            id: part.id,
            type: textEntryType,
            text,
            providerLimitedReasoning: false,
        });
    }

    return projected;
}

export function buildTimelineEntries(
    messages: MessageRecord[],
    partsByMessageId: Map<string, MessagePartRecord[]>
): MessageTimelineEntry[] {
    return messages.map((message) => {
        const parts = partsByMessageId.get(message.id) ?? [];
        const body = buildBodyEntries(message, parts);
        const editableText =
            message.role === 'user'
                ? body
                      .filter((item): item is MessageTimelineBodyEntry & { type: 'user_text'; text: string } =>
                          item.type === 'user_text' && 'text' in item
                      )
                      .map((item) => item.text)
                      .join('\n\n')
                : undefined;

        const copyPayloads = buildMessageCopyPayloads({
            id: message.id,
            runId: message.runId,
            role: message.role,
            createdAt: message.createdAt,
            body,
            ...(editableText && editableText.trim().length > 0 ? { editableText } : {}),
        });

        return {
            id: message.id,
            runId: message.runId,
            role: message.role,
            createdAt: message.createdAt,
            body,
            ...(copyPayloads.plainText ? { plainCopyText: copyPayloads.plainText } : {}),
            ...(copyPayloads.rawText ? { rawCopyText: copyPayloads.rawText } : {}),
            ...(editableText && editableText.trim().length > 0 ? { editableText } : {}),
        };
    });
}

export function isWithinBottomThreshold({
    scrollHeight,
    scrollTop,
    clientHeight,
    thresholdPx = DEFAULT_BOTTOM_THRESHOLD_PX,
}: BottomThresholdInput): boolean {
    const distance = scrollHeight - scrollTop - clientHeight;
    return distance <= thresholdPx;
}

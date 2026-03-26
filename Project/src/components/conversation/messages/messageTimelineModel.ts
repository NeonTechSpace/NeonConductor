import type { ConversationTanstackMessage } from '@/web/components/conversation/messages/tanstackMessageBridge';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';


import type { EntityId } from '@/shared/contracts';

export type MessageTimelineTextEntryType =
    | 'assistant_reasoning'
    | 'assistant_text'
    | 'user_text'
    | 'system_text'
    | 'assistant_tool_call'
    | 'tool_result';
export type MessageTimelineImageEntryType = 'assistant_image' | 'user_image' | 'system_image';
export type MessageTimelineStatusEntryType = 'assistant_status';

export type MessageTimelineBodyEntry =
    | {
          id: string;
          type: MessageTimelineTextEntryType;
          text: string;
          providerLimitedReasoning: boolean;
          displayLabel?: string;
      }
    | {
          id: string;
          type: MessageTimelineImageEntryType;
          mediaId: EntityId<'media'>;
          mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
          width: number;
          height: number;
      }
    | {
          id: string;
          type: MessageTimelineStatusEntryType;
          code: 'received' | 'stalled' | 'failed_before_output';
          label: string;
          elapsedMs?: number;
      };

export interface MessageTimelineEntry {
    id: string;
    runId: ConversationTanstackMessage['runId'];
    role: ConversationTanstackMessage['role'];
    createdAt: string;
    body: MessageTimelineBodyEntry[];
    plainCopyText?: string;
    rawCopyText?: string;
    editableText?: string;
    deliveryState?: 'sending';
    isOptimistic?: boolean;
}

export interface BottomThresholdInput {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
    thresholdPx?: number;
}

const DEFAULT_BOTTOM_THRESHOLD_PX = 96;

function mapImageEntryType(role: ConversationTanstackMessage['role']): MessageTimelineImageEntryType | null {
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

function mapTextEntryType(
    role: ConversationTanstackMessage['role']
): Exclude<MessageTimelineTextEntryType, 'assistant_reasoning'> | null {
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

function buildBodyEntries(message: ConversationTanstackMessage): MessageTimelineBodyEntry[] {
    const projected: MessageTimelineBodyEntry[] = [];
    const assistantStatusEntries: Extract<MessageTimelineBodyEntry, { type: 'assistant_status' }>[] = [];

    for (const part of message.renderParts) {
        if (part.kind === 'status' && message.role === 'assistant') {
            assistantStatusEntries.push({
                id: part.key,
                type: 'assistant_status',
                code: part.code,
                label: part.label,
                ...(part.elapsedMs !== undefined ? { elapsedMs: part.elapsedMs } : {}),
            });
            continue;
        }

        if (part.kind === 'image') {
            const imageEntryType = mapImageEntryType(message.role);

            if (
                imageEntryType &&
                isEntityId(part.mediaId, 'media') &&
                typeof part.width === 'number' &&
                typeof part.height === 'number'
            ) {
                projected.push({
                    id: part.key,
                    type: imageEntryType,
                    mediaId: part.mediaId,
                    mimeType: part.mimeType,
                    width: part.width,
                    height: part.height,
                });
            }
            continue;
        }

        if (part.kind === 'reasoning') {
            const text = part.text.trim();
            if (text.length === 0) {
                continue;
            }

            projected.push({
                id: part.key,
                type: 'assistant_reasoning',
                text,
                providerLimitedReasoning: part.providerLimitedReasoning,
            });
            continue;
        }

        if (part.kind === 'tool_call' && message.role === 'assistant') {
            projected.push({
                id: part.key,
                type: 'assistant_tool_call',
                text: part.argumentsText.trim().length > 0 ? `\`\`\`json\n${part.argumentsText}\n\`\`\`` : '',
                providerLimitedReasoning: false,
                displayLabel: `Tool Call: ${part.toolName}`,
            });
            continue;
        }

        if (part.kind === 'tool_result' && message.role === 'tool') {
            projected.push({
                id: part.key,
                type: 'tool_result',
                text: part.outputText,
                providerLimitedReasoning: false,
                displayLabel: 'Tool Result',
            });
            continue;
        }

        if (part.kind !== 'text') {
            continue;
        }

        const text = part.text.trim();
        if (text.length === 0) {
            continue;
        }

        const textEntryType = mapTextEntryType(message.role);
        if (!textEntryType) {
            continue;
        }

        projected.push({
            id: part.key,
            type: textEntryType,
            text: part.text,
            providerLimitedReasoning: false,
        });
    }

    if (projected.length === 0 && assistantStatusEntries.length > 0) {
        const lastStatusEntry = assistantStatusEntries.at(-1);
        return lastStatusEntry ? [lastStatusEntry] : [];
    }

    return projected;
}

export function buildTimelineEntries(messages: ConversationTanstackMessage[]): MessageTimelineEntry[] {
    return messages.map((message) => {
        const body = buildBodyEntries(message);

        return {
            id: message.id,
            runId: message.runId,
            role: message.role,
            createdAt: message.createdAt,
            body,
            ...(message.plainCopyText ? { plainCopyText: message.plainCopyText } : {}),
            ...(message.rawCopyText ? { rawCopyText: message.rawCopyText } : {}),
            ...(message.editableText ? { editableText: message.editableText } : {}),
            ...(message.deliveryState ? { deliveryState: message.deliveryState } : {}),
            ...(message.isOptimistic ? { isOptimistic: message.isOptimistic } : {}),
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

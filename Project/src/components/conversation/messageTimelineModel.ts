import { parseRichContentBlocks } from '@/web/components/content/richContentModel';
import type { RichContentBlock } from '@/web/components/content/richContentModel';
import { projectConversationParts } from '@/web/lib/runtime/reasoningProjection';

import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';

export interface MessageTimelineBodyEntry {
    id: string;
    type: 'assistant_reasoning' | 'assistant_text' | 'user_text';
    text: string;
    blocks: RichContentBlock[];
    providerLimitedReasoning: boolean;
}

export interface MessageTimelineEntry {
    id: string;
    runId: MessageRecord['runId'];
    role: MessageRecord['role'];
    createdAt: string;
    body: MessageTimelineBodyEntry[];
    editableText?: string;
}

export interface BottomThresholdInput {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
    thresholdPx?: number;
}

const DEFAULT_BOTTOM_THRESHOLD_PX = 96;

function readTextPart(part: MessagePartRecord): string | null {
    const text = part.payload['text'];
    if (typeof text !== 'string') {
        return null;
    }

    const normalized = text.trim();
    return normalized.length > 0 ? normalized : null;
}

function buildBodyEntries(message: MessageRecord, parts: MessagePartRecord[]): MessageTimelineBodyEntry[] {
    if (message.role === 'assistant') {
        return projectConversationParts(parts).map((item) => ({
            id: item.id,
            type: item.role,
            text: item.text,
            blocks: parseRichContentBlocks(item.text),
            providerLimitedReasoning: item.providerLimitedReasoning,
        }));
    }

    const projected: MessageTimelineBodyEntry[] = [];
    for (const part of parts) {
        const text = readTextPart(part);
        if (!text) {
            continue;
        }

        projected.push({
            id: part.id,
            type: message.role === 'user' ? 'user_text' : 'assistant_text',
            text,
            blocks: parseRichContentBlocks(text),
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
                      .filter((item) => item.type === 'user_text')
                      .map((item) => item.text)
                      .join('\n\n')
                : undefined;

        return {
            id: message.id,
            runId: message.runId,
            role: message.role,
            createdAt: message.createdAt,
            body,
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

import type { ConversationTanstackMessage } from '@/web/components/conversation/messages/tanstackMessageBridge';
import type {
    ToolArtifactKind,
    ToolArtifactPreviewStrategy,
} from '@/web/components/conversation/messages/toolArtifactFormatting';
import {
    buildWorkbenchTimelineMessages,
    type WorkbenchTimelineItem,
    type WorkbenchTimelineMessage,
} from '@/web/components/conversation/messages/workbenchTimelineModel';

import type { EntityId } from '@/shared/contracts';

export type MessageTimelineTextEntryType =
    | 'assistant_reasoning'
    | 'assistant_text'
    | 'user_text'
    | 'system_text'
    | 'assistant_tool_call';
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
          mediaId?: EntityId<'media'>;
          attachmentId?: EntityId<'att'>;
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
      }
    | {
          id: string;
          type: 'tool_result';
          text: string;
          providerLimitedReasoning: false;
          displayLabel: 'Tool Result';
          messagePartId: EntityId<'part'>;
          toolName: string;
          artifactized: boolean;
          artifactAvailable: boolean;
          artifactKind?: ToolArtifactKind;
          previewStrategy?: ToolArtifactPreviewStrategy;
          totalBytes?: number;
          totalLines?: number;
          omittedBytes?: number;
          summaryMode?: 'deterministic' | 'utility_ai';
          summaryProviderId?: string;
          summaryModelId?: string;
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

function mapImageEntryType(role: WorkbenchTimelineItem['role']): MessageTimelineImageEntryType | null {
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
    role: WorkbenchTimelineItem['role']
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

function adaptWorkbenchItemToTimelineBodyEntry(item: WorkbenchTimelineItem): MessageTimelineBodyEntry | null {
    if (item.kind === 'status') {
        return {
            id: item.sourcePartId ?? item.id,
            type: 'assistant_status',
            code: item.code,
            label: item.label,
            ...(item.elapsedMs !== undefined ? { elapsedMs: item.elapsedMs } : {}),
        };
    }

    if (item.kind === 'error') {
        return {
            id: item.sourcePartId ?? item.id,
            type: 'assistant_status',
            code: item.code,
            label: item.label,
            ...(item.elapsedMs !== undefined ? { elapsedMs: item.elapsedMs } : {}),
        };
    }

    if (item.kind === 'media') {
        const imageEntryType = mapImageEntryType(item.role);
        if (!imageEntryType) {
            return null;
        }

        return {
            id: item.sourcePartId ?? item.id,
            type: imageEntryType,
            ...(item.mediaId ? { mediaId: item.mediaId } : {}),
            ...(item.attachmentId ? { attachmentId: item.attachmentId } : {}),
            mimeType: item.mimeType,
            width: item.width,
            height: item.height,
        };
    }

    if (item.kind === 'reasoning') {
        return {
            id: item.sourcePartId ?? item.id,
            type: 'assistant_reasoning',
            text: item.text,
            providerLimitedReasoning: item.providerLimitedReasoning,
        };
    }

    if (item.kind === 'tool_call') {
        return {
            id: item.sourcePartId ?? item.id,
            type: 'assistant_tool_call',
            text: item.argumentsText.trim().length > 0 ? `\`\`\`json\n${item.argumentsText}\n\`\`\`` : '',
            providerLimitedReasoning: false,
            displayLabel: `Tool Call: ${item.toolName}`,
        };
    }

    if (item.kind === 'command' || item.kind === 'artifact') {
        return {
            id: item.sourcePartId ?? item.id,
            type: 'tool_result',
            text: item.text,
            providerLimitedReasoning: false,
            displayLabel: 'Tool Result',
            messagePartId: item.artifactRef.messagePartId,
            toolName: item.toolName,
            artifactized: item.artifactRef.artifactized,
            artifactAvailable: item.artifactRef.artifactAvailable,
            ...(item.artifactRef.artifactKind ? { artifactKind: item.artifactRef.artifactKind } : {}),
            ...(item.artifactRef.previewStrategy ? { previewStrategy: item.artifactRef.previewStrategy } : {}),
            ...(item.artifactRef.totalBytes !== undefined ? { totalBytes: item.artifactRef.totalBytes } : {}),
            ...(item.artifactRef.totalLines !== undefined ? { totalLines: item.artifactRef.totalLines } : {}),
            ...(item.artifactRef.omittedBytes !== undefined ? { omittedBytes: item.artifactRef.omittedBytes } : {}),
            ...(item.artifactRef.summaryMode ? { summaryMode: item.artifactRef.summaryMode } : {}),
            ...(item.artifactRef.summaryProviderId ? { summaryProviderId: item.artifactRef.summaryProviderId } : {}),
            ...(item.artifactRef.summaryModelId ? { summaryModelId: item.artifactRef.summaryModelId } : {}),
        };
    }

    const textEntryType = mapTextEntryType(item.role);
    if (!textEntryType) {
        return null;
    }

    return {
        id: item.sourcePartId ?? item.id,
        type: textEntryType,
        text: item.text,
        providerLimitedReasoning: false,
    };
}

function buildTimelineEntry(message: WorkbenchTimelineMessage): MessageTimelineEntry {
    const body = message.items
        .map((item) => adaptWorkbenchItemToTimelineBodyEntry(item))
        .filter((item): item is MessageTimelineBodyEntry => item !== null);

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
}

export function buildTimelineEntries(messages: ConversationTanstackMessage[]): MessageTimelineEntry[] {
    return buildWorkbenchTimelineMessages(messages).map((message) => buildTimelineEntry(message));
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

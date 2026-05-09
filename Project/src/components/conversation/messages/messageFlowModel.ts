import type { ConversationTanstackMessage } from '@/web/components/conversation/messages/tanstackMessageBridge';
import type {
    ToolArtifactKind,
    ToolArtifactPreviewStrategy,
} from '@/web/components/conversation/messages/toolArtifactFormatting';
import {
    buildWorkbenchTimelineContextProjection,
    buildWorkbenchTimelineMessages,
    type WorkbenchTimelineItem,
    type WorkbenchTimelineContext,
    type WorkbenchTimelineContextItem,
    type WorkbenchTimelineIconToken,
    type WorkbenchTimelineItemSeverity,
    type WorkbenchTimelineItemStatus,
} from '@/web/components/conversation/messages/workbenchTimelineModel';

import type { EntityId } from '@/shared/contracts';

export type MessageFlowTextEntryType =
    | 'assistant_reasoning'
    | 'assistant_text'
    | 'user_text'
    | 'system_text'
    | 'assistant_tool_call';
export type MessageFlowImageEntryType = 'assistant_image' | 'user_image' | 'system_image';
export type MessageFlowStatusEntryType = 'assistant_status';

export type MessageFlowBodyEntry =
    | {
          id: string;
          type: MessageFlowTextEntryType;
          text: string;
          providerLimitedReasoning: boolean;
          displayLabel?: string;
          workbenchItemId?: string;
          workbenchKind?: Extract<WorkbenchTimelineItem['kind'], 'tool_call'>;
          status?: WorkbenchTimelineItemStatus;
          severity?: WorkbenchTimelineItemSeverity;
          icon?: WorkbenchTimelineIconToken;
          title?: string;
          summary?: string;
          defaultCollapsed?: boolean;
      }
    | {
          id: string;
          type: MessageFlowImageEntryType;
          mediaId?: EntityId<'media'>;
          attachmentId?: EntityId<'att'>;
          mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
          width: number;
          height: number;
      }
    | {
          id: string;
          workbenchItemId: string;
          type: MessageFlowStatusEntryType;
          code: 'received' | 'stalled' | 'failed_before_output';
          label: string;
          status: WorkbenchTimelineItemStatus;
          severity: WorkbenchTimelineItemSeverity;
          icon: WorkbenchTimelineIconToken;
          title: string;
          defaultCollapsed: boolean;
          summary?: string;
          elapsedMs?: number;
      }
    | {
          id: string;
          workbenchItemId?: string;
          workbenchKind?: 'command' | 'artifact';
          type: 'tool_result';
          text: string;
          providerLimitedReasoning: false;
          displayLabel: 'Tool Result';
          status?: WorkbenchTimelineItemStatus;
          severity?: WorkbenchTimelineItemSeverity;
          icon?: WorkbenchTimelineIconToken;
          title?: string;
          summary?: string;
          defaultCollapsed?: boolean;
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

export interface MessageFlowMessage {
    id: string;
    runId: ConversationTanstackMessage['runId'];
    role: ConversationTanstackMessage['role'];
    createdAt: string;
    body: MessageFlowBodyEntry[];
    plainCopyText?: string;
    rawCopyText?: string;
    editableText?: string;
    deliveryState?: 'sending';
    isOptimistic?: boolean;
}

export interface MessageFlowTurn {
    id: string;
    runId: ConversationTanstackMessage['runId'];
    createdAt: string;
    messages: MessageFlowMessage[];
    timelineItems: WorkbenchTimelineContextItem[];
    source: 'run' | 'session_context';
}

export interface BottomThresholdInput {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
    thresholdPx?: number;
}

const DEFAULT_BOTTOM_THRESHOLD_PX = 96;

function mapImageEntryType(role: WorkbenchTimelineItem['role']): MessageFlowImageEntryType | null {
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
): Exclude<MessageFlowTextEntryType, 'assistant_reasoning'> | null {
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

function adaptWorkbenchItemToFlowBodyEntry(item: WorkbenchTimelineItem): MessageFlowBodyEntry | null {
    if (item.kind === 'status') {
        return {
            id: item.sourcePartId ?? item.id,
            workbenchItemId: item.id,
            type: 'assistant_status',
            code: item.code,
            label: item.label,
            status: item.status,
            severity: item.severity,
            icon: item.icon,
            title: item.title,
            defaultCollapsed: item.defaultCollapsed,
            ...(item.summary ? { summary: item.summary } : {}),
            ...(item.elapsedMs !== undefined ? { elapsedMs: item.elapsedMs } : {}),
        };
    }

    if (item.kind === 'error') {
        return {
            id: item.sourcePartId ?? item.id,
            workbenchItemId: item.id,
            type: 'assistant_status',
            code: item.code,
            label: item.label,
            status: item.status,
            severity: item.severity,
            icon: item.icon,
            title: item.title,
            defaultCollapsed: item.defaultCollapsed,
            ...(item.summary ? { summary: item.summary } : {}),
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
            workbenchItemId: item.id,
            workbenchKind: item.kind,
            type: 'assistant_tool_call',
            text: item.argumentsText.trim().length > 0 ? `\`\`\`json\n${item.argumentsText}\n\`\`\`` : '',
            providerLimitedReasoning: false,
            displayLabel: `Tool Call: ${item.toolName}`,
            status: item.status,
            severity: item.severity,
            icon: item.icon,
            title: item.title,
            ...(item.summary ? { summary: item.summary } : {}),
            defaultCollapsed: item.defaultCollapsed,
        };
    }

    if (item.kind === 'command' || item.kind === 'artifact') {
        return {
            id: item.sourcePartId ?? item.id,
            workbenchItemId: item.id,
            workbenchKind: item.kind,
            type: 'tool_result',
            text: item.text,
            providerLimitedReasoning: false,
            displayLabel: 'Tool Result',
            status: item.status,
            severity: item.severity,
            icon: item.icon,
            title: item.title,
            ...(item.summary ? { summary: item.summary } : {}),
            defaultCollapsed: item.defaultCollapsed,
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

function buildFlowMessage(message: ReturnType<typeof buildWorkbenchTimelineMessages>[number]): MessageFlowMessage {
    const body = message.items
        .map((item) => adaptWorkbenchItemToFlowBodyEntry(item))
        .filter((item): item is MessageFlowBodyEntry => item !== null);
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

export function buildMessageFlowTurns(
    messages: ConversationTanstackMessage[],
    timelineContext?: WorkbenchTimelineContext
): MessageFlowTurn[] {
    const turns: MessageFlowTurn[] = [];
    const turnByRunId = new Map<string, MessageFlowTurn>();

    for (const message of buildWorkbenchTimelineMessages(messages)) {
        const flowMessage = buildFlowMessage(message);
        const existingTurn = turnByRunId.get(message.runId);
        if (existingTurn) {
            existingTurn.messages.push(flowMessage);
            continue;
        }

        const nextTurn: MessageFlowTurn = {
            id: message.runId,
            runId: message.runId,
            createdAt: message.createdAt,
            messages: [flowMessage],
            timelineItems: [],
            source: 'run',
        };
        turnByRunId.set(message.runId, nextTurn);
        turns.push(nextTurn);
    }

    if (!timelineContext) {
        return turns;
    }

    const contextProjection = buildWorkbenchTimelineContextProjection(timelineContext);

    for (const [runId, timelineItems] of contextProjection.itemsByRunId) {
        const existingTurn = turnByRunId.get(runId);
        if (existingTurn) {
            existingTurn.timelineItems.push(...timelineItems);
            continue;
        }

        const firstItem = timelineItems[0];
        const nextTurn: MessageFlowTurn = {
            id: runId,
            runId,
            createdAt: firstItem?.createdAt ?? new Date(0).toISOString(),
            messages: [],
            timelineItems,
            source: 'run',
        };
        turnByRunId.set(runId, nextTurn);
        turns.push(nextTurn);
    }

    if (contextProjection.sessionItems.length > 0) {
        turns.push({
            id: 'session-context',
            runId: 'session-context',
            createdAt: contextProjection.sessionItems[0]?.createdAt ?? new Date(0).toISOString(),
            messages: [],
            timelineItems: contextProjection.sessionItems,
            source: 'session_context',
        });
    }

    return turns;
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

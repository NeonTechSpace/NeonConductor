import type { ConversationTanstackMessage } from '@/web/components/conversation/messages/tanstackMessageBridge';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import type { ToolArtifactKind, ToolArtifactPreviewStrategy } from '@/web/components/conversation/messages/toolArtifactFormatting';


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
          type: MessageFlowStatusEntryType;
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
}

export interface BottomThresholdInput {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
    thresholdPx?: number;
}

const DEFAULT_BOTTOM_THRESHOLD_PX = 96;

function mapImageEntryType(role: ConversationTanstackMessage['role']): MessageFlowImageEntryType | null {
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

function buildBodyEntries(message: ConversationTanstackMessage): MessageFlowBodyEntry[] {
    const projected: MessageFlowBodyEntry[] = [];
    const assistantStatusEntries: Extract<MessageFlowBodyEntry, { type: 'assistant_status' }>[] = [];

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
                (isEntityId(part.mediaId, 'media') || isEntityId(part.attachmentId, 'att')) &&
                typeof part.width === 'number' &&
                typeof part.height === 'number'
            ) {
                projected.push({
                    id: part.key,
                    type: imageEntryType,
                    ...(isEntityId(part.mediaId, 'media') ? { mediaId: part.mediaId } : {}),
                    ...(isEntityId(part.attachmentId, 'att') ? { attachmentId: part.attachmentId } : {}),
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
                messagePartId: part.messagePartId,
                toolName: part.toolName,
                artifactized: part.artifactized,
                artifactAvailable: part.artifactAvailable,
                ...(part.artifactKind ? { artifactKind: part.artifactKind } : {}),
                ...(part.previewStrategy ? { previewStrategy: part.previewStrategy } : {}),
                ...(part.totalBytes !== undefined ? { totalBytes: part.totalBytes } : {}),
                ...(part.totalLines !== undefined ? { totalLines: part.totalLines } : {}),
                ...(part.omittedBytes !== undefined ? { omittedBytes: part.omittedBytes } : {}),
                ...(part.summaryMode ? { summaryMode: part.summaryMode } : {}),
                ...(part.summaryProviderId ? { summaryProviderId: part.summaryProviderId } : {}),
                ...(part.summaryModelId ? { summaryModelId: part.summaryModelId } : {}),
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

function buildFlowMessage(message: ConversationTanstackMessage): MessageFlowMessage {
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
}

export function buildMessageFlowTurns(messages: ConversationTanstackMessage[]): MessageFlowTurn[] {
    const turns: MessageFlowTurn[] = [];
    const turnByRunId = new Map<string, MessageFlowTurn>();

    for (const message of messages) {
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
        };
        turnByRunId.set(message.runId, nextTurn);
        turns.push(nextTurn);
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

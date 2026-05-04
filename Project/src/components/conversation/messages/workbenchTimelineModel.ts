import type { ConversationTanstackMessage } from '@/web/components/conversation/messages/tanstackMessageBridge';
import type {
    ToolArtifactKind,
    ToolArtifactPreviewStrategy,
} from '@/web/components/conversation/messages/toolArtifactFormatting';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type { EntityId } from '@/shared/contracts';

export const workbenchTimelineItemKinds = [
    'message',
    'reasoning',
    'status',
    'tool_call',
    'command',
    'artifact',
    'media',
    'error',
    'approval',
    'file_change',
    'diff',
    'plan_step',
    'web_research',
    'queued_followup',
] as const;

export type WorkbenchTimelineItemKind = (typeof workbenchTimelineItemKinds)[number];
export type WorkbenchTimelineItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'sending';
export type WorkbenchTimelineItemSeverity = 'neutral' | 'info' | 'success' | 'warning' | 'error';
export type WorkbenchTimelineIconToken =
    | 'message'
    | 'reasoning'
    | 'activity'
    | 'tool'
    | 'terminal'
    | 'artifact'
    | 'image'
    | 'error'
    | 'approval'
    | 'file'
    | 'diff'
    | 'plan'
    | 'web'
    | 'queue';

export interface WorkbenchTimelineItemBase {
    id: string;
    kind: WorkbenchTimelineItemKind;
    status: WorkbenchTimelineItemStatus;
    severity: WorkbenchTimelineItemSeverity;
    icon: WorkbenchTimelineIconToken;
    title: string;
    createdAt: string;
    runId: ConversationTanstackMessage['runId'];
    messageId: string;
    role: ConversationTanstackMessage['role'];
    defaultCollapsed: boolean;
    sourcePartId?: string;
    summary?: string;
    details?: string;
}

export interface WorkbenchTimelineArtifactRef {
    messagePartId: EntityId<'part'>;
    artifactKind?: ToolArtifactKind;
    artifactized: boolean;
    artifactAvailable: boolean;
    previewStrategy?: ToolArtifactPreviewStrategy;
    totalBytes?: number;
    totalLines?: number;
    omittedBytes?: number;
    summaryMode?: 'deterministic' | 'utility_ai';
    summaryProviderId?: string;
    summaryModelId?: string;
}

export type WorkbenchTimelineItem =
    | (WorkbenchTimelineItemBase & {
          kind: 'message';
          text: string;
      })
    | (WorkbenchTimelineItemBase & {
          kind: 'reasoning';
          text: string;
          providerLimitedReasoning: boolean;
      })
    | (WorkbenchTimelineItemBase & {
          kind: 'status';
          code: 'received' | 'stalled';
          label: string;
          elapsedMs?: number;
      })
    | (WorkbenchTimelineItemBase & {
          kind: 'tool_call';
          toolName: string;
          argumentsText: string;
      })
    | (WorkbenchTimelineItemBase & {
          kind: 'command';
          text: string;
          toolName: string;
          artifactRef: WorkbenchTimelineArtifactRef;
      })
    | (WorkbenchTimelineItemBase & {
          kind: 'artifact';
          text: string;
          toolName: string;
          artifactRef: WorkbenchTimelineArtifactRef;
      })
    | (WorkbenchTimelineItemBase & {
          kind: 'media';
          mediaId?: EntityId<'media'>;
          attachmentId?: EntityId<'att'>;
          mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
          width: number;
          height: number;
      })
    | (WorkbenchTimelineItemBase & {
          kind: 'error';
          code: 'failed_before_output';
          label: string;
          elapsedMs?: number;
      });

export interface WorkbenchTimelineMessage {
    id: string;
    runId: ConversationTanstackMessage['runId'];
    role: ConversationTanstackMessage['role'];
    createdAt: string;
    items: WorkbenchTimelineItem[];
    plainCopyText?: string;
    rawCopyText?: string;
    editableText?: string;
    deliveryState?: 'sending';
    isOptimistic?: boolean;
}

function buildItemBase(input: {
    message: ConversationTanstackMessage;
    partKey: string;
    kind: WorkbenchTimelineItemKind;
    status: WorkbenchTimelineItemStatus;
    severity: WorkbenchTimelineItemSeverity;
    icon: WorkbenchTimelineIconToken;
    title: string;
    defaultCollapsed: boolean;
    summary?: string;
    details?: string;
}): WorkbenchTimelineItemBase {
    return {
        id: `${input.message.id}:${input.partKey}:${input.kind}`,
        kind: input.kind,
        status: input.status,
        severity: input.severity,
        icon: input.icon,
        title: input.title,
        createdAt: input.message.createdAt,
        runId: input.message.runId,
        messageId: input.message.id,
        role: input.message.role,
        defaultCollapsed: input.defaultCollapsed,
        sourcePartId: input.partKey,
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.details ? { details: input.details } : {}),
    };
}

function buildArtifactRef(
    part: Extract<ConversationTanstackMessage['renderParts'][number], { kind: 'tool_result' }>
): WorkbenchTimelineArtifactRef {
    return {
        messagePartId: part.messagePartId,
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
    };
}

function titleForMessageRole(role: ConversationTanstackMessage['role']): string {
    if (role === 'assistant') {
        return 'Assistant message';
    }
    if (role === 'user') {
        return 'User message';
    }
    if (role === 'system') {
        return 'System message';
    }
    return 'Tool message';
}

function statusForMessage(message: ConversationTanstackMessage): WorkbenchTimelineItemStatus {
    return message.deliveryState === 'sending' ? 'sending' : 'completed';
}

function firstSummaryLine(text: string): string {
    return text.split('\n')[0] ?? text;
}

function buildWorkbenchItems(message: ConversationTanstackMessage): WorkbenchTimelineItem[] {
    const projected: WorkbenchTimelineItem[] = [];
    const assistantStatusEntries: WorkbenchTimelineItem[] = [];

    for (const part of message.renderParts) {
        if (part.kind === 'status' && message.role === 'assistant') {
            if (part.code === 'failed_before_output') {
                assistantStatusEntries.push({
                    ...buildItemBase({
                        message,
                        partKey: part.key,
                        kind: 'error',
                        status: 'failed',
                        severity: 'error',
                        icon: 'error',
                        title: 'Assistant failed before output',
                        defaultCollapsed: false,
                        summary: part.label,
                    }),
                    kind: 'error',
                    code: part.code,
                    label: part.label,
                    ...(part.elapsedMs !== undefined ? { elapsedMs: part.elapsedMs } : {}),
                });
                continue;
            }

            assistantStatusEntries.push({
                ...buildItemBase({
                    message,
                    partKey: part.key,
                    kind: 'status',
                    status: part.code === 'received' ? 'running' : 'pending',
                    severity: part.code === 'stalled' ? 'warning' : 'info',
                    icon: 'activity',
                    title: part.label,
                    defaultCollapsed: false,
                    summary: part.label,
                }),
                kind: 'status',
                code: part.code,
                label: part.label,
                ...(part.elapsedMs !== undefined ? { elapsedMs: part.elapsedMs } : {}),
            });
            continue;
        }

        if (part.kind === 'image') {
            if (
                (isEntityId(part.mediaId, 'media') || isEntityId(part.attachmentId, 'att')) &&
                typeof part.width === 'number' &&
                typeof part.height === 'number'
            ) {
                projected.push({
                    ...buildItemBase({
                        message,
                        partKey: part.key,
                        kind: 'media',
                        status: statusForMessage(message),
                        severity: 'neutral',
                        icon: 'image',
                        title: 'Image',
                        defaultCollapsed: false,
                    }),
                    kind: 'media',
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
                ...buildItemBase({
                    message,
                    partKey: part.key,
                    kind: 'reasoning',
                    status: statusForMessage(message),
                    severity: 'info',
                    icon: 'reasoning',
                    title: part.providerLimitedReasoning ? 'Reasoning summary' : 'Reasoning',
                    defaultCollapsed: true,
                    summary: firstSummaryLine(text),
                }),
                kind: 'reasoning',
                text,
                providerLimitedReasoning: part.providerLimitedReasoning,
            });
            continue;
        }

        if (part.kind === 'tool_call' && message.role === 'assistant') {
            projected.push({
                ...buildItemBase({
                    message,
                    partKey: part.key,
                    kind: 'tool_call',
                    status: 'completed',
                    severity: 'neutral',
                    icon: 'tool',
                    title: `Tool Call: ${part.toolName}`,
                    defaultCollapsed: true,
                    summary: part.toolName,
                }),
                kind: 'tool_call',
                toolName: part.toolName,
                argumentsText: part.argumentsText,
            });
            continue;
        }

        if (part.kind === 'tool_result' && message.role === 'tool') {
            const artifactRef = buildArtifactRef(part);
            const isCommandResult = part.toolName === 'run_command' || part.artifactKind === 'command_output';
            const kind = isCommandResult ? 'command' : 'artifact';

            projected.push({
                ...buildItemBase({
                    message,
                    partKey: part.key,
                    kind,
                    status: 'completed',
                    severity: 'neutral',
                    icon: isCommandResult ? 'terminal' : 'artifact',
                    title: isCommandResult ? `Command: ${part.toolName}` : `Tool Result: ${part.toolName}`,
                    defaultCollapsed: true,
                    summary: firstSummaryLine(part.outputText),
                }),
                kind,
                text: part.outputText,
                toolName: part.toolName,
                artifactRef,
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

        projected.push({
            ...buildItemBase({
                message,
                partKey: part.key,
                kind: 'message',
                status: statusForMessage(message),
                severity: 'neutral',
                icon: 'message',
                title: titleForMessageRole(message.role),
                defaultCollapsed: false,
                summary: firstSummaryLine(text),
            }),
            kind: 'message',
            text: part.text,
        });
    }

    if (projected.length === 0 && assistantStatusEntries.length > 0) {
        const lastStatusEntry = assistantStatusEntries.at(-1);
        return lastStatusEntry ? [lastStatusEntry] : [];
    }

    return projected;
}

export function buildWorkbenchTimelineMessages(messages: ConversationTanstackMessage[]): WorkbenchTimelineMessage[] {
    return messages.map((message) => ({
        id: message.id,
        runId: message.runId,
        role: message.role,
        createdAt: message.createdAt,
        items: buildWorkbenchItems(message),
        ...(message.plainCopyText ? { plainCopyText: message.plainCopyText } : {}),
        ...(message.rawCopyText ? { rawCopyText: message.rawCopyText } : {}),
        ...(message.editableText ? { editableText: message.editableText } : {}),
        ...(message.deliveryState ? { deliveryState: message.deliveryState } : {}),
        ...(message.isOptimistic ? { isOptimistic: message.isOptimistic } : {}),
    }));
}

export function buildWorkbenchTimelineItems(messages: ConversationTanstackMessage[]): WorkbenchTimelineItem[] {
    return buildWorkbenchTimelineMessages(messages).flatMap((message) => message.items);
}

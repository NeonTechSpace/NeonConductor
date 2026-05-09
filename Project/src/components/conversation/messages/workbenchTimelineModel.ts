import type { ConversationTanstackMessage } from '@/web/components/conversation/messages/tanstackMessageBridge';
import type {
    ToolArtifactKind,
    ToolArtifactPreviewStrategy,
} from '@/web/components/conversation/messages/toolArtifactFormatting';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type { PermissionRecord, RunRecord } from '@/app/backend/persistence/types';

import type {
    DiffHighlightedFileOverview,
    DiffOverview,
    ExecutionReceipt,
    SessionOutboxEntry,
} from '@/shared/contracts';
import type { EntityId } from '@/shared/contracts';
import type { PlanRecordView } from '@/shared/contracts/types/plan';

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
    'run_state',
    'execution_receipt',
    'compaction',
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

export interface WorkbenchTimelineContextItemBase {
    id: string;
    kind: WorkbenchTimelineItemKind;
    status: WorkbenchTimelineItemStatus;
    severity: WorkbenchTimelineItemSeverity;
    icon: WorkbenchTimelineIconToken;
    title: string;
    createdAt: string;
    defaultCollapsed: boolean;
    summary?: string;
    details?: string;
    inspectorSectionId?:
        | 'workspace-status'
        | 'plan-and-orchestration'
        | 'run-changes'
        | 'execution-receipt'
        | 'selected-outbox-entry'
        | 'pending-permissions';
}

export type WorkbenchTimelineContextItem =
    | (WorkbenchTimelineContextItemBase & {
          kind: 'run_state';
          run: RunRecord;
      })
    | (WorkbenchTimelineContextItemBase & {
          kind: 'approval';
          request: PermissionRecord;
          workspaceInfo?: {
              label: string;
              absolutePath: string;
          };
      })
    | (WorkbenchTimelineContextItemBase & {
          kind: 'diff';
          overview: DiffOverview;
      })
    | (WorkbenchTimelineContextItemBase & {
          kind: 'file_change';
          file: DiffHighlightedFileOverview;
      })
    | (WorkbenchTimelineContextItemBase & {
          kind: 'plan_step';
          planId: EntityId<'plan'>;
          planItemId: string;
          description: string;
          planItemStatus: PlanRecordView['items'][number]['status'];
          sequence: number;
      })
    | (WorkbenchTimelineContextItemBase & {
          kind: 'queued_followup';
          entry: SessionOutboxEntry;
      })
    | (WorkbenchTimelineContextItemBase & {
          kind: 'execution_receipt';
          receipt: ExecutionReceipt;
      })
    | (WorkbenchTimelineContextItemBase & {
          kind: 'compaction';
          receipt: ExecutionReceipt;
      });

export interface WorkbenchTimelineContext {
    runs: RunRecord[];
    selectedRunId?: EntityId<'run'>;
    activePlan?: PlanRecordView;
    pendingPermissions?: PermissionRecord[];
    permissionWorkspaces?: Record<
        string,
        {
            label: string;
            absolutePath: string;
        }
    >;
    runDiffOverview?: DiffOverview;
    executionReceipt?: ExecutionReceipt;
    selectedOutboxEntry?: SessionOutboxEntry;
}

export interface WorkbenchTimelineContextProjection {
    itemsByRunId: Map<string, WorkbenchTimelineContextItem[]>;
    sessionItems: WorkbenchTimelineContextItem[];
}

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

function addRunItem(
    itemsByRunId: Map<string, WorkbenchTimelineContextItem[]>,
    runId: string,
    item: WorkbenchTimelineContextItem
) {
    const items = itemsByRunId.get(runId);
    if (items) {
        items.push(item);
        return;
    }
    itemsByRunId.set(runId, [item]);
}

function firstNonEmptyLine(text: string): string {
    return (
        text
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.length > 0) ?? text.trim()
    );
}

function statusForRun(run: RunRecord): WorkbenchTimelineItemStatus {
    if (run.status === 'running') {
        return 'running';
    }
    if (run.status === 'error' || run.status === 'aborted') {
        return 'failed';
    }
    return 'completed';
}

function severityForRun(run: RunRecord): WorkbenchTimelineItemSeverity {
    if (run.status === 'error') {
        return 'error';
    }
    if (run.status === 'aborted') {
        return 'warning';
    }
    if (run.status === 'running') {
        return 'info';
    }
    return 'success';
}

function titleForRun(run: RunRecord): string {
    if (run.status === 'running') {
        return 'Run running';
    }
    if (run.status === 'error') {
        return 'Run failed';
    }
    if (run.status === 'aborted') {
        return 'Run aborted';
    }
    return 'Run completed';
}

function statusForPlanItem(status: PlanRecordView['items'][number]['status']): WorkbenchTimelineItemStatus {
    if (status === 'running') {
        return 'running';
    }
    if (status === 'failed' || status === 'aborted') {
        return 'failed';
    }
    if (status === 'completed') {
        return 'completed';
    }
    return 'pending';
}

function severityForPlanItem(status: PlanRecordView['items'][number]['status']): WorkbenchTimelineItemSeverity {
    if (status === 'failed' || status === 'aborted') {
        return 'error';
    }
    if (status === 'completed') {
        return 'success';
    }
    if (status === 'running') {
        return 'info';
    }
    return 'neutral';
}

function statusForOutboxEntry(entry: SessionOutboxEntry): WorkbenchTimelineItemStatus {
    if (entry.state === 'running') {
        return 'running';
    }
    if (entry.state === 'failed' || entry.state === 'cancelled') {
        return 'failed';
    }
    if (entry.state === 'completed') {
        return 'completed';
    }
    return 'pending';
}

function severityForOutboxEntry(entry: SessionOutboxEntry): WorkbenchTimelineItemSeverity {
    if (entry.state === 'failed' || entry.state === 'cancelled') {
        return 'error';
    }
    if (entry.state === 'paused_for_review' || entry.state === 'paused_for_permission') {
        return 'warning';
    }
    if (entry.state === 'completed') {
        return 'success';
    }
    return 'info';
}

function createdAtForSelectedRun(input: WorkbenchTimelineContext): string {
    const selectedRun = input.runs.find((run) => run.id === input.selectedRunId);
    return selectedRun?.updatedAt ?? selectedRun?.createdAt ?? new Date(0).toISOString();
}

export function buildWorkbenchTimelineContextProjection(
    input: WorkbenchTimelineContext
): WorkbenchTimelineContextProjection {
    const itemsByRunId = new Map<string, WorkbenchTimelineContextItem[]>();
    const sessionItems: WorkbenchTimelineContextItem[] = [];
    const selectedRun = input.runs.find((run) => run.id === input.selectedRunId);

    if (selectedRun && selectedRun.status !== 'idle') {
        addRunItem(itemsByRunId, selectedRun.id, {
            id: `run-state:${selectedRun.id}`,
            kind: 'run_state',
            status: statusForRun(selectedRun),
            severity: severityForRun(selectedRun),
            icon: 'activity',
            title: titleForRun(selectedRun),
            createdAt: selectedRun.updatedAt,
            defaultCollapsed: selectedRun.status === 'completed',
            summary: selectedRun.errorMessage ?? firstNonEmptyLine(selectedRun.prompt),
            inspectorSectionId: 'workspace-status',
            run: selectedRun,
        });
    }

    for (const request of input.pendingPermissions ?? []) {
        const workspaceInfo = request.workspaceFingerprint
            ? input.permissionWorkspaces?.[request.workspaceFingerprint]
            : undefined;
        const item: WorkbenchTimelineContextItem = {
            id: `approval:${request.id}`,
            kind: 'approval',
            status: 'pending',
            severity: 'warning',
            icon: 'approval',
            title: request.summary.title,
            createdAt: request.createdAt,
            defaultCollapsed: false,
            summary: request.summary.detail,
            inspectorSectionId: 'pending-permissions',
            request,
            ...(workspaceInfo ? { workspaceInfo } : {}),
        };
        if (input.selectedRunId) {
            addRunItem(itemsByRunId, input.selectedRunId, item);
        } else {
            sessionItems.push(item);
        }
    }

    if (input.activePlan) {
        for (const planItem of input.activePlan.items) {
            const selectedRunMatchesPlan =
                input.selectedRunId && input.selectedRunId === input.activePlan.implementationRunId;
            const runId = planItem.runId ?? (selectedRunMatchesPlan ? input.selectedRunId : undefined);
            if (!runId) {
                continue;
            }
            addRunItem(itemsByRunId, runId, {
                id: `plan-step:${input.activePlan.id}:${planItem.id}`,
                kind: 'plan_step',
                status: statusForPlanItem(planItem.status),
                severity: severityForPlanItem(planItem.status),
                icon: 'plan',
                title: `Plan step ${String(planItem.sequence + 1)}`,
                createdAt: input.activePlan.updatedAt,
                defaultCollapsed: planItem.status === 'completed',
                summary: firstNonEmptyLine(planItem.description),
                inspectorSectionId: 'plan-and-orchestration',
                planId: input.activePlan.id,
                planItemId: planItem.id,
                description: planItem.description,
                planItemStatus: planItem.status,
                sequence: planItem.sequence,
            });
        }
    }

    if (input.runDiffOverview && input.selectedRunId) {
        addRunItem(itemsByRunId, input.selectedRunId, {
            id: `diff:${input.selectedRunId}`,
            kind: 'diff',
            status: input.runDiffOverview.kind === 'unsupported' ? 'failed' : 'completed',
            severity: input.runDiffOverview.kind === 'unsupported' ? 'warning' : 'info',
            icon: 'diff',
            title: 'Run changes',
            createdAt: createdAtForSelectedRun(input),
            defaultCollapsed: false,
            summary: input.runDiffOverview.summary,
            inspectorSectionId: 'run-changes',
            overview: input.runDiffOverview,
        });

        if (input.runDiffOverview.kind === 'git') {
            for (const file of input.runDiffOverview.highlightedFiles) {
                addRunItem(itemsByRunId, input.selectedRunId, {
                    id: `file-change:${input.selectedRunId}:${file.path}`,
                    kind: 'file_change',
                    status: 'completed',
                    severity: 'neutral',
                    icon: 'file',
                    title: file.path,
                    createdAt: createdAtForSelectedRun(input),
                    defaultCollapsed: true,
                    summary: file.status.replaceAll('_', ' '),
                    inspectorSectionId: 'run-changes',
                    file,
                });
            }
        }
    }

    if (input.executionReceipt) {
        addRunItem(itemsByRunId, input.executionReceipt.runId, {
            id: `execution-receipt:${input.executionReceipt.id}`,
            kind: 'execution_receipt',
            status: input.executionReceipt.terminalOutcome.kind === 'completed' ? 'completed' : 'failed',
            severity: input.executionReceipt.terminalOutcome.kind === 'failed' ? 'error' : 'success',
            icon: 'artifact',
            title: 'Execution receipt',
            createdAt: input.executionReceipt.createdAt,
            defaultCollapsed: false,
            summary: `Outcome: ${input.executionReceipt.terminalOutcome.kind}`,
            inspectorSectionId: 'execution-receipt',
            receipt: input.executionReceipt,
        });

        if (input.executionReceipt.contract.preparedContext.compactionReseedActive) {
            const reseedCheckpoint =
                input.executionReceipt.contract.preparedContext.digest.checkpoints.post_compaction_reseed;
            addRunItem(itemsByRunId, input.executionReceipt.runId, {
                id: `compaction:${input.executionReceipt.id}`,
                kind: 'compaction',
                status: 'completed',
                severity: 'info',
                icon: 'activity',
                title: 'Compaction reseed active',
                createdAt: input.executionReceipt.createdAt,
                defaultCollapsed: true,
                summary: `${String(reseedCheckpoint.includedContributorCount)} contributors reseeded`,
                inspectorSectionId: 'execution-receipt',
                receipt: input.executionReceipt,
            });
        }
    }

    if (input.selectedOutboxEntry) {
        sessionItems.push({
            id: `queued-followup:${input.selectedOutboxEntry.id}`,
            kind: 'queued_followup',
            status: statusForOutboxEntry(input.selectedOutboxEntry),
            severity: severityForOutboxEntry(input.selectedOutboxEntry),
            icon: 'queue',
            title: 'Queued run review',
            createdAt: input.selectedOutboxEntry.updatedAt,
            defaultCollapsed: false,
            summary: input.selectedOutboxEntry.pausedReason ?? firstNonEmptyLine(input.selectedOutboxEntry.prompt),
            inspectorSectionId: 'selected-outbox-entry',
            entry: input.selectedOutboxEntry,
        });
    }

    return { itemsByRunId, sessionItems };
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

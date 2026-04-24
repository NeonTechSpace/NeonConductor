import { createElement } from 'react';

import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import { PendingPermissionsPanel } from '@/web/components/conversation/panels/pendingPermissionsPanel';
import { RunChangeSummaryPanel } from '@/web/components/conversation/panels/runChangeSummaryPanel';
import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';
import type {
    WorkspaceHeaderModel,
    WorkspaceInspectorModel,
    WorkspaceInspectorSection,
    WorkspaceShellProjection,
} from '@/web/components/conversation/sessions/workspaceShellModel';
import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
import type { ExecutionTargetExplanationModel } from '@/web/components/conversation/shell/workspace/runTargetSelection';
import type { ModelCompatibilityState, ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import type {
    MessagePartRecord,
    MessageRecord,
    PermissionRecord,
    ProviderUsageSummary,
    RunRecord,
    SessionSummaryRecord,
} from '@/app/backend/persistence/types';

import type {
    BrowserContextPacket,
    ComposerAttachmentInput,
    DiffOverview,
    EntityId,
    ResolvedContextState,
    RulesetDefinition,
    RuntimeRunOptions,
    RuntimeReasoningEffort,
    SessionOutboxEntry,
    SkillfileDefinition,
    TopLevelTab,
    ExecutionReceipt,
} from '@/shared/contracts';

import type { ReactNode } from 'react';

export interface PendingImageView {
    clientId: string;
    fileName: string;
    previewUrl: string;
    status: 'queued' | 'compressing' | 'ready' | 'failed';
    errorMessage?: string;
    byteSize?: number;
    attachment?: {
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
        width: number;
        height: number;
    };
}

export interface PendingTextFileView {
    clientId: string;
    fileName: string;
    status: 'reading' | 'ready' | 'failed';
    byteSize?: number;
    errorMessage?: string;
    attachment?: {
        mimeType: string;
        encoding: 'utf-8' | 'utf-8-bom';
    };
}

export type WorkspaceScope =
    | {
          kind: 'detached';
      }
    | {
          kind: 'workspace_unresolved';
          label: string;
          workspaceFingerprint: string;
          executionEnvironmentMode: 'local' | 'new_sandbox';
      }
    | {
          kind: 'workspace';
          label: string;
          absolutePath: string;
          executionEnvironmentMode: 'local' | 'new_sandbox';
      }
    | {
          kind: 'sandbox';
          label: string;
          absolutePath: string;
          baseWorkspaceLabel: string;
          baseWorkspacePath: string;
          sandboxId: string;
      };

export interface ProviderStatusSummary {
    label: string;
    authState: string;
    authMethod: string;
}

export interface RegistrySummary {
    modes: number;
    rulesets: number;
    skillfiles: number;
}

export interface AgentContextSummary {
    modeLabel: string;
    rulesetCount: number;
    attachedRuleCount: number;
    attachedSkillCount: number;
}

export interface SessionWorkspacePanelProps {
    profileId: string;
    profiles: Array<{ id: string; name: string }>;
    selectedProfileId?: string;
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    selectedSessionId?: string;
    selectedRunId?: string;
    selectedWorkspaceFingerprint?: string;
    selectedSandboxId?: EntityId<'sb'>;
    optimisticUserMessage?: OptimisticConversationUserMessage;
    executionPreset: 'privacy' | 'standard' | 'yolo';
    workspaceScope: WorkspaceScope;
    pendingPermissions: PermissionRecord[];
    permissionWorkspaces?: Record<
        string,
        {
            label: string;
            absolutePath: string;
        }
    >;
    pendingImages: PendingImageView[];
    pendingTextFiles: PendingTextFileView[];
    readyComposerAttachments: ComposerAttachmentInput[];
    hasBlockingPendingAttachments: boolean;
    isCreatingSession: boolean;
    isStartingRun: boolean;
    isResolvingPermission: boolean;
    canCreateSession: boolean;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    topLevelTab: TopLevelTab;
    activeModeKey: string;
    modes: ConversationModeOption[];
    reasoningEffort: RuntimeReasoningEffort;
    selectedModelSupportsReasoning: boolean;
    supportedReasoningEfforts?: RuntimeReasoningEffort[];
    maxImageAttachmentsPerMessage: number;
    canAttachImages: boolean;
    imageAttachmentBlockedReason?: string;
    routingBadge?: string;
    selectedModelCompatibilityState?: ModelCompatibilityState;
    selectedModelCompatibilityReason?: string;
    selectedProviderStatus?: ProviderStatusSummary;
    selectedModelLabel?: string;
    selectedTargetExplanation?: ExecutionTargetExplanationModel;
    selectedUsageSummary?: ProviderUsageSummary;
    registrySummary?: RegistrySummary;
    agentContextSummary?: AgentContextSummary;
    runDiffOverview?: DiffOverview;
    modelOptions: ModelPickerOption[];
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    outboxEntries?: SessionOutboxEntry[];
    selectedOutboxEntry?: SessionOutboxEntry;
    executionReceipt?: ExecutionReceipt;
    attachedRules: RulesetDefinition[];
    missingAttachedRuleKeys: string[];
    attachedSkills: SkillfileDefinition[];
    missingAttachedSkillKeys: string[];
    showRunContractPreview?: boolean;
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    executionEnvironmentPanel?: ReactNode;
    modeExecutionPanel?: ReactNode;
    contextAssetsPanel?: ReactNode;
    memoryPanel?: ReactNode;
    diffCheckpointPanel?: ReactNode;
    workspaceShell?: WorkspaceShellProjection;
    promptResetKey?: number;
    focusComposerRequestKey?: number;
    controlsDisabled?: boolean;
    submitDisabled?: boolean;
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
    onProfileChange: (profileId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onReasoningEffortChange: (effort: RuntimeReasoningEffort) => void;
    onModeChange: (modeKey: string) => void;
    onCreateSession: () => void;
    onPromptEdited: () => void;
    onAddFiles: (files: FileList | File[]) => void;
    onRemovePendingImage: (clientId: string) => void;
    onRemovePendingTextFile: (clientId: string) => void;
    onRetryPendingImage: (clientId: string) => void;
    onQueuePrompt?: (prompt: string, browserContext?: BrowserContextPacket) => void;
    onSubmitPrompt: (prompt: string, browserContext?: BrowserContextPacket) => void;
    onMoveOutboxEntry?: (entryId: EntityId<'outbox'>, direction: 'up' | 'down') => void;
    onResumeOutboxEntry?: (entryId: EntityId<'outbox'>) => void;
    onCancelOutboxEntry?: (entryId: EntityId<'outbox'>) => void;
    onUpdateOutboxEntry?: (input: {
        entryId: EntityId<'outbox'>;
        prompt: string;
        attachments: ComposerAttachmentInput[];
        browserContext?: BrowserContextPacket | null;
    }) => Promise<void>;
    onSelectOutboxEntry?: (entryId: EntityId<'outbox'>) => void;
    selectedOutboxEntryId?: EntityId<'outbox'>;
    runtimeOptions: RuntimeRunOptions;
    onCompactContext?: () => Promise<
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
        | undefined
    >;
    onResolvePermission: (
        requestId: PermissionRecord['id'],
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace',
        selectedApprovalResource?: string
    ) => void;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
    onPromoteMessage?: (messageId: EntityId<'msg'>) => void;
}

export function buildWorkspaceHeaderModel(input: SessionWorkspacePanelProps): WorkspaceHeaderModel {
    const selectedSession =
        input.sessions.find((session) => session.id === input.selectedSessionId) ?? input.sessions[0];
    const selectedRun = input.runs.find((run) => run.id === input.selectedRunId) ?? input.runs[0];
    const compactConnectionLabel = input.selectedProviderStatus
        ? `${input.selectedProviderStatus.label} · ${input.selectedProviderStatus.authState.replaceAll('_', ' ')}`
        : undefined;

    return {
        sessions: input.sessions,
        runs: input.runs,
        selectedSession,
        selectedRun,
        ...(compactConnectionLabel ? { compactConnectionLabel } : {}),
        ...(input.routingBadge ? { routingBadge: input.routingBadge } : {}),
        pendingPermissionCount: input.pendingPermissions.length,
    };
}

export function buildWorkspaceInspectorModel(input: SessionWorkspacePanelProps): WorkspaceInspectorModel {
    const header = buildWorkspaceHeaderModel(input);
    const pendingPermissionCount = header.pendingPermissionCount;
    const selectedOutboxDynamicContributors =
        input.selectedOutboxEntry?.latestRunContract?.preparedContext.contributors.filter(
            (contributor) => contributor.kind === 'dynamic_skill_context'
        ) ?? [];
    const receiptDynamicContributors =
        input.executionReceipt?.contract.preparedContext.contributors.filter(
            (contributor) => contributor.kind === 'dynamic_skill_context'
        ) ?? [];

    return {
        sections: [
            {
                id: 'workspace-status',
                label: 'Workspace status',
                description: 'Run state, workspace scope, provider readiness, and local telemetry.',
                content: createElement(WorkspaceStatusPanel, {
                    run: header.selectedRun,
                    executionPreset: input.executionPreset,
                    workspaceScope: input.workspaceScope,
                    provider: input.selectedProviderStatus,
                    modelLabel: input.selectedModelLabel,
                    ...(input.selectedTargetExplanation ? { targetExplanation: input.selectedTargetExplanation } : {}),
                    usageSummary: input.selectedUsageSummary,
                    routingBadge: input.routingBadge,
                    registrySummary: input.registrySummary,
                    agentContextSummary: input.agentContextSummary,
                }),
            },
            ...(input.executionEnvironmentPanel
                ? [
                      {
                          id: 'execution-environment',
                          label: 'Execution environment',
                          description: 'Workspace targeting and execution-scope details.',
                          content: input.executionEnvironmentPanel,
                      } satisfies WorkspaceInspectorSection,
                  ]
                : []),
            ...(input.modeExecutionPanel
                ? [
                      {
                          id: 'plan-and-orchestration',
                          label: 'Plan and orchestration',
                          description: 'Plan approval, root orchestration strategy, and delegated worker lane status.',
                          content: input.modeExecutionPanel,
                      } satisfies WorkspaceInspectorSection,
                  ]
                : []),
            {
                id: 'run-changes',
                label: 'Run changes',
                description: 'Diff summaries and run-level changes for the selected run.',
                content: createElement(RunChangeSummaryPanel, {
                    ...(input.selectedRunId ? { selectedRunId: input.selectedRunId } : {}),
                    ...(input.runDiffOverview ? { overview: input.runDiffOverview } : {}),
                }),
            },
            ...(input.executionReceipt
                ? [
                      {
                          id: 'execution-receipt',
                          label: 'Execution receipt',
                          description: 'Immutable execution summary for the selected run.',
                          content: createElement('div', { className: 'space-y-2 text-xs' }, [
                              createElement(
                                  'p',
                                  { key: 'outcome', className: 'font-medium' },
                                  `Outcome: ${input.executionReceipt.terminalOutcome.kind}`
                              ),
                              createElement(
                                  'p',
                                  { key: 'attachments', className: 'text-muted-foreground' },
                                  `Attachments: ${String(input.executionReceipt.contract.attachmentSummary.totalCount)}`
                              ),
                              ...(input.executionReceipt.contract.browserContextSummary
                                  ? [
                                        createElement(
                                            'p',
                                            { key: 'browser', className: 'text-muted-foreground' },
                                            `Browser context: ${String(input.executionReceipt.contract.browserContextSummary.commentCount)} comments · ${String(input.executionReceipt.contract.browserContextSummary.selectedElementCount)} elements · ${String(input.executionReceipt.contract.browserContextSummary.designerDraftCount)} designer drafts`
                                        ),
                                    ]
                                  : []),
                              createElement(
                                  'p',
                                  { key: 'contributors', className: 'text-muted-foreground' },
                                  `Prepared context contributors: ${String(input.executionReceipt.contract.preparedContext.activeContributorCount)}`
                              ),
                              createElement(
                                  'p',
                                  { key: 'tools', className: 'text-muted-foreground' },
                                  `Tools invoked: ${String(input.executionReceipt.toolsInvoked.length)}`
                              ),
                              ...receiptDynamicContributors.slice(0, 3).map((contributor) =>
                                  createElement(
                                      'p',
                                      {
                                          key: `dynamic-${contributor.id}`,
                                          className: 'text-muted-foreground',
                                      },
                                      `Dynamic context: ${contributor.label} (${contributor.dynamicExpansion?.resolutionState ?? 'preview_only'})`
                                  )
                              ),
                          ]),
                      } satisfies WorkspaceInspectorSection,
                  ]
                : []),
            ...(input.selectedOutboxEntry
                ? [
                      {
                          id: 'selected-outbox-entry',
                          label: 'Queued run review',
                          description: 'Current queued entry steering, run-contract status, and review signals.',
                          content: createElement('div', { className: 'space-y-2 text-xs' }, [
                              createElement(
                                  'p',
                                  { key: 'state', className: 'font-medium' },
                                  `State: ${input.selectedOutboxEntry.state.replaceAll('_', ' ')}`
                              ),
                              createElement(
                                  'p',
                                  { key: 'target', className: 'text-muted-foreground' },
                                  `Target: ${input.selectedOutboxEntry.steeringSnapshot.providerId} / ${input.selectedOutboxEntry.steeringSnapshot.modelId}`
                              ),
                              createElement(
                                  'p',
                                  { key: 'attachments', className: 'text-muted-foreground' },
                                  `Attachments: ${String(input.selectedOutboxEntry.attachmentIds.length)}`
                              ),
                              ...(input.selectedOutboxEntry.browserContextSummary
                                  ? [
                                        createElement(
                                            'p',
                                            { key: 'browser', className: 'text-muted-foreground' },
                                            `Browser context: ${String(input.selectedOutboxEntry.browserContextSummary.commentCount)} comments · ${String(input.selectedOutboxEntry.browserContextSummary.selectedElementCount)} elements · ${String(input.selectedOutboxEntry.browserContextSummary.designerDraftCount)} designer drafts`
                                        ),
                                    ]
                                  : []),
                              createElement(
                                  'p',
                                  { key: 'contributors', className: 'text-muted-foreground' },
                                  `Prepared context contributors: ${String(input.selectedOutboxEntry.latestRunContract?.preparedContext.activeContributorCount ?? 0)}`
                              ),
                              ...(input.selectedOutboxEntry.pausedReason
                                  ? [
                                        createElement(
                                            'p',
                                            { key: 'paused', className: 'text-amber-700 dark:text-amber-300' },
                                            input.selectedOutboxEntry.pausedReason
                                        ),
                                    ]
                                  : []),
                              ...(input.selectedOutboxEntry.latestRunContract?.diffFromLastCompatible?.items
                                  .slice(0, 3)
                                  .map((item, index) =>
                                      createElement(
                                          'p',
                                          { key: `diff-${String(index)}`, className: 'text-muted-foreground' },
                                          `${item.field}: ${item.reason}`
                                      )
                                  ) ?? []),
                              ...selectedOutboxDynamicContributors.slice(0, 3).map((contributor) =>
                                  createElement(
                                      'p',
                                      {
                                          key: `dynamic-${contributor.id}`,
                                          className: 'text-muted-foreground',
                                      },
                                      `Dynamic context: ${contributor.label} (${contributor.dynamicExpansion?.resolutionState ?? 'preview_only'})`
                                  )
                              ),
                          ]),
                      } satisfies WorkspaceInspectorSection,
                  ]
                : []),
            {
                id: 'pending-permissions',
                label: 'Pending permissions',
                description: 'Approvals stay in the inspector until an action needs them.',
                badge: pendingPermissionCount > 0 ? `${String(pendingPermissionCount)} waiting` : 'None waiting',
                tone: pendingPermissionCount > 0 ? 'attention' : 'default',
                content: createElement(PendingPermissionsPanel, {
                    requests: input.pendingPermissions,
                    ...(input.permissionWorkspaces ? { workspaceByFingerprint: input.permissionWorkspaces } : {}),
                    busy: input.isResolvingPermission,
                    onResolve: input.onResolvePermission,
                }),
            },
            ...(input.contextAssetsPanel
                ? [
                      {
                          id: 'context-assets',
                          label: 'Context assets',
                          description: 'Preset-aware manual rules and explicit skill context for this session.',
                          content: input.contextAssetsPanel,
                      } satisfies WorkspaceInspectorSection,
                  ]
                : []),
            ...(input.memoryPanel
                ? [
                      {
                          id: 'memory',
                          label: 'Memory',
                          description: 'Projected memory files, reviewable edits, and scope-aware memory status.',
                          content: input.memoryPanel,
                      } satisfies WorkspaceInspectorSection,
                  ]
                : []),
            ...(input.diffCheckpointPanel
                ? [
                      {
                          id: 'checkpoints',
                          label: 'Checkpoints',
                          description: 'Checkpoint and diff recovery data for the current session.',
                          content: input.diffCheckpointPanel,
                      } satisfies WorkspaceInspectorSection,
                  ]
                : []),
        ],
    };
}

export function buildWorkspaceShellProjection(input: SessionWorkspacePanelProps): WorkspaceShellProjection {
    return {
        header: buildWorkspaceHeaderModel(input),
        inspector: buildWorkspaceInspectorModel(input),
    };
}

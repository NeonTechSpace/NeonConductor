import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import type { ExecutionTargetExplanationModel } from '@/web/components/conversation/shell/workspace/runTargetSelection';
import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
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
    DiffOverview,
    EntityId,
    ResolvedContextState,
    RulesetDefinition,
    RuntimeReasoningEffort,
    SkillfileDefinition,
    TopLevelTab,
} from '@/shared/contracts';

import { createElement } from 'react';
import type { ReactNode } from 'react';

import { PendingPermissionsPanel } from '@/web/components/conversation/panels/pendingPermissionsPanel';
import { RunChangeSummaryPanel } from '@/web/components/conversation/panels/runChangeSummaryPanel';
import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';
import type {
    WorkspaceHeaderModel,
    WorkspaceInspectorModel,
    WorkspaceInspectorSection,
    WorkspaceShellProjection,
} from '@/web/components/conversation/sessions/workspaceShellModel';

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

export type WorkspaceScope =
    | {
          kind: 'detached';
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
    attachedRules: RulesetDefinition[];
    missingAttachedRuleKeys: string[];
    attachedSkills: SkillfileDefinition[];
    missingAttachedSkillKeys: string[];
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
    onAddImageFiles: (files: FileList | File[]) => void;
    onRemovePendingImage: (clientId: string) => void;
    onRetryPendingImage: (clientId: string) => void;
    onSubmitPrompt: (prompt: string) => void;
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
}

export function buildWorkspaceHeaderModel(input: SessionWorkspacePanelProps): WorkspaceHeaderModel {
    const selectedSession = input.sessions.find((session) => session.id === input.selectedSessionId) ?? input.sessions[0];
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
        canCreateSession: input.canCreateSession,
        isCreatingSession: input.isCreatingSession,
    };
}

export function buildWorkspaceInspectorModel(input: SessionWorkspacePanelProps): WorkspaceInspectorModel {
    const header = buildWorkspaceHeaderModel(input);
    const pendingPermissionCount = header.pendingPermissionCount;

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
                    ...(input.selectedTargetExplanation
                        ? { targetExplanation: input.selectedTargetExplanation }
                        : {}),
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

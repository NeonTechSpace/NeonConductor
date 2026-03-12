import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import type { ModelCompatibilityState, ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import type {
    MessagePartRecord,
    MessageRecord,
    PermissionRecord,
    ProviderUsageSummary,
    RunRecord,
    SessionSummaryRecord,
} from '@/app/backend/persistence/types';

import type { DiffOverview, ResolvedContextState, RuntimeReasoningEffort, TopLevelTab } from '@/shared/contracts';

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

export type WorkspaceScope =
    | {
          kind: 'detached';
      }
    | {
          kind: 'workspace';
          label: string;
          absolutePath: string;
          executionEnvironmentMode: 'local' | 'new_worktree';
          executionBranch?: string;
          baseBranch?: string;
      }
    | {
          kind: 'worktree';
          label: string;
          absolutePath: string;
          branch: string;
          baseBranch: string;
          baseWorkspaceLabel: string;
          baseWorkspacePath: string;
          worktreeId: string;
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
    attachedSkillCount: number;
}

export interface SessionWorkspacePanelProps {
    profileId: string;
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    selectedSessionId?: string;
    selectedRunId?: string;
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
    modes: Array<{ id: string; modeKey: string; label: string }>;
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
    selectedUsageSummary?: ProviderUsageSummary;
    registrySummary?: RegistrySummary;
    agentContextSummary?: AgentContextSummary;
    runDiffOverview?: DiffOverview;
    modelOptions: ModelPickerOption[];
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    modePanel?: ReactNode;
    executionEnvironmentPanel?: ReactNode;
    attachedSkillsPanel?: ReactNode;
    diffCheckpointPanel?: ReactNode;
    promptResetKey?: number;
    focusComposerRequestKey?: number;
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
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
        | void
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
    >;
    onResolvePermission: (
        requestId: PermissionRecord['id'],
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace',
        selectedApprovalResource?: string
    ) => void;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
}

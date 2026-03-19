import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
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
    selectedUsageSummary?: ProviderUsageSummary;
    registrySummary?: RegistrySummary;
    agentContextSummary?: AgentContextSummary;
    runDiffOverview?: DiffOverview;
    modelOptions: ModelPickerOption[];
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    executionEnvironmentPanel?: ReactNode;
    modeExecutionPanel?: ReactNode;
    contextAssetsPanel?: ReactNode;
    memoryPanel?: ReactNode;
    diffCheckpointPanel?: ReactNode;
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

import type { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import type { useConversationShellEditFlow } from '@/web/components/conversation/hooks/useConversationShellEditFlow';
import type { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import type { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import type { SessionWorkspacePanelProps } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';
import type { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import type { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import type { useConversationWorkspaceActions } from '@/web/components/conversation/shell/workspace/useConversationWorkspaceActions';

import type { ResolvedContextState, RuntimeReasoningEffort, TopLevelTab } from '@/shared/contracts';

interface BuildConversationWorkspacePanelPropsInput {
    profileId: string;
    profiles: Array<{ id: string; name: string }>;
    selectedProfileId: string | undefined;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    topLevelTab: TopLevelTab;
    modeKey: string;
    modes: SessionWorkspacePanelProps['modes'];
    reasoningEffort: RuntimeReasoningEffort;
    selectedModelSupportsReasoning: boolean;
    supportedReasoningEfforts?: RuntimeReasoningEffort[];
    composerModelOptions: SessionWorkspacePanelProps['modelOptions'];
    shellViewModel: ReturnType<typeof useConversationShellViewModel>;
    queries: ReturnType<typeof useConversationQueries>;
    mutations: ReturnType<typeof useConversationMutations>;
    composer: ReturnType<typeof useConversationShellComposer>;
    sessionActions: ReturnType<typeof useConversationShellSessionActions>;
    editFlow: ReturnType<typeof useConversationShellEditFlow>;
    branchFromMessage: (entry: Parameters<NonNullable<SessionWorkspacePanelProps['onBranchFromMessage']>>[0]) => void;
    workspaceActions: ReturnType<typeof useConversationWorkspaceActions>;
    workspaceSectionState: Partial<SessionWorkspacePanelProps>;
    workspacePanels: Pick<
        SessionWorkspacePanelProps,
        | 'executionEnvironmentPanel'
        | 'modeExecutionPanel'
        | 'contextAssetsPanel'
        | 'memoryPanel'
        | 'diffCheckpointPanel'
    >;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    canAttachImages: boolean;
    imageAttachmentBlockedReason?: string;
    routingBadge?: string;
    selectedModelCompatibilityState?: SessionWorkspacePanelProps['selectedModelCompatibilityState'];
    selectedModelCompatibilityReason?: string;
    contextState?: ResolvedContextState;
    hasSelectedSession: boolean;
    maxImageAttachmentsPerMessage: number;
    onProfileChange: (profileId: string) => void;
    onModeChange: (modeKey: string) => void;
    onReasoningEffortChange: (effort: RuntimeReasoningEffort) => void;
    onSelectRun: (runId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onCompactContext: NonNullable<SessionWorkspacePanelProps['onCompactContext']>;
    focusComposerRequestKey: number;
}

export function buildConversationWorkspacePanelProps(
    input: BuildConversationWorkspacePanelPropsInput
): SessionWorkspacePanelProps {
    return {
        profileId: input.profileId,
        profiles: input.profiles,
        ...(input.selectedProfileId ? { selectedProfileId: input.selectedProfileId } : {}),
        sessions: input.shellViewModel.sessionRunSelection.sessions,
        runs: input.shellViewModel.sessionRunSelection.runs,
        messages: input.shellViewModel.sessionRunSelection.messages,
        partsByMessageId: input.shellViewModel.sessionRunSelection.partsByMessageId,
        ...(input.selectedSessionId ? { selectedSessionId: input.selectedSessionId } : {}),
        ...(input.selectedRunId ? { selectedRunId: input.selectedRunId } : {}),
        ...(input.shellViewModel.selectedThread?.workspaceFingerprint
            ? { selectedWorkspaceFingerprint: input.shellViewModel.selectedThread.workspaceFingerprint }
            : {}),
        ...(input.shellViewModel.effectiveSelectedSandboxId
            ? { selectedSandboxId: input.shellViewModel.effectiveSelectedSandboxId }
            : {}),
        ...(input.composer.optimisticUserMessage
            ? { optimisticUserMessage: input.composer.optimisticUserMessage }
            : {}),
        executionPreset: input.queries.shellBootstrapQuery.data?.executionPreset ?? 'standard',
        workspaceScope: input.shellViewModel.workspaceScope,
        pendingPermissions: input.shellViewModel.pendingPermissions,
        permissionWorkspaces: input.shellViewModel.permissionWorkspaces,
        pendingImages: input.composer.pendingImages,
        isCreatingSession: input.mutations.createSessionMutation.isPending,
        isStartingRun: input.mutations.startRunMutation.isPending || input.mutations.planStartMutation.isPending,
        isResolvingPermission: input.mutations.resolvePermissionMutation.isPending,
        canCreateSession: Boolean(input.shellViewModel.selectedThread),
        selectedProviderId: input.selectedProviderId,
        selectedModelId: input.selectedModelId,
        topLevelTab: input.topLevelTab,
        activeModeKey: input.modeKey,
        modes: input.modes,
        reasoningEffort: input.reasoningEffort,
        selectedModelSupportsReasoning: input.selectedModelSupportsReasoning,
        ...(input.supportedReasoningEfforts !== undefined
            ? { supportedReasoningEfforts: input.supportedReasoningEfforts }
            : {}),
        maxImageAttachmentsPerMessage: input.maxImageAttachmentsPerMessage,
        canAttachImages: input.canAttachImages,
        ...(input.imageAttachmentBlockedReason
            ? { imageAttachmentBlockedReason: input.imageAttachmentBlockedReason }
            : {}),
        ...(input.routingBadge !== undefined ? { routingBadge: input.routingBadge } : {}),
        ...input.workspaceSectionState,
        promptResetKey: input.composer.promptResetKey,
        modelOptions: input.composerModelOptions,
        ...(input.selectedModelCompatibilityState
            ? { selectedModelCompatibilityState: input.selectedModelCompatibilityState }
            : {}),
        ...(input.selectedModelCompatibilityReason
            ? { selectedModelCompatibilityReason: input.selectedModelCompatibilityReason }
            : {}),
        runErrorMessage: input.composer.runSubmitError,
        attachedRules: input.shellViewModel.attachedRules,
        missingAttachedRuleKeys: input.shellViewModel.missingAttachedRuleKeys,
        attachedSkills: input.shellViewModel.attachedSkills,
        missingAttachedSkillKeys: input.shellViewModel.missingAttachedSkillKeys,
        controlsDisabled: false,
        submitDisabled: !input.selectedSessionId,
        ...(input.contextState ? { contextState: input.contextState } : {}),
        canCompactContext:
            input.topLevelTab !== 'orchestrator' &&
            input.hasSelectedSession &&
            Boolean(input.contextState?.compactable),
        isCompactingContext: input.mutations.compactSessionMutation.isPending,
        onSelectSession: input.sessionActions.onSelectSession,
        onSelectRun: input.onSelectRun,
        onProfileChange: input.onProfileChange,
        onProviderChange: input.onProviderChange,
        onModelChange: input.onModelChange,
        onReasoningEffortChange: input.onReasoningEffortChange,
        onModeChange: input.onModeChange,
        onCreateSession: input.sessionActions.onCreateSession,
        onPromptEdited: input.composer.onPromptEdited,
        onAddImageFiles: input.composer.onAddImageFiles,
        onRemovePendingImage: input.composer.onRemovePendingImage,
        onRetryPendingImage: input.composer.onRetryPendingImage,
        onSubmitPrompt: input.composer.onSubmitPrompt,
        onCompactContext: input.onCompactContext,
        onResolvePermission: (requestId, resolution, selectedApprovalResource) => {
            void input.workspaceActions.resolvePermission(
                selectedApprovalResource
                    ? { requestId, resolution, selectedApprovalResource }
                    : { requestId, resolution }
            );
        },
        onEditMessage: input.editFlow.onEditMessage,
        onBranchFromMessage: input.branchFromMessage,
        executionEnvironmentPanel: input.workspacePanels.executionEnvironmentPanel,
        modeExecutionPanel: input.workspacePanels.modeExecutionPanel,
        contextAssetsPanel: input.workspacePanels.contextAssetsPanel,
        memoryPanel: input.workspacePanels.memoryPanel,
        diffCheckpointPanel: input.workspacePanels.diffCheckpointPanel,
        focusComposerRequestKey: input.focusComposerRequestKey,
    };
}

import type { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import type { useConversationShellEditFlow } from '@/web/components/conversation/hooks/useConversationShellEditFlow';
import type { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import type { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { ContextAssetsPanel } from '@/web/components/conversation/panels/contextAssetsPanel';
import { DiffCheckpointPanel } from '@/web/components/conversation/panels/diffCheckpointPanel';
import { ExecutionEnvironmentPanel } from '@/web/components/conversation/panels/executionEnvironmentPanel';
import { MemoryPanel } from '@/web/components/conversation/panels/memoryPanel';
import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import {
    buildWorkspaceShellProjection,
    type SessionWorkspacePanelProps,
} from '@/web/components/conversation/sessions/workspace/workspacePanelModel';
import type { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import { buildConversationPlanOrchestrator } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';
import type { PlanningDepth } from '@/web/components/conversation/shell/planningDepth';
import type { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import type { useConversationWorkspaceActions } from '@/web/components/conversation/shell/workspace/useConversationWorkspaceActions';

import type {
    BrowserContextPacket,
    ComposerAttachmentInput,
    EntityId,
    OrchestratorExecutionStrategy,
    ResolvedContextState,
    RuntimeRunOptions,
    RuntimeReasoningEffort,
    TopLevelTab,
} from '@/shared/contracts';

interface BuildConversationWorkspaceProjectionInput {
    profileId: string;
    profiles: Array<{ id: string; name: string }>;
    selectedProfileId: string | undefined;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    topLevelTab: TopLevelTab;
    modeKey: string;
    isPlanningComposerMode: boolean;
    isOrchestrationWorkflowMode: boolean;
    planningDepthSelection: PlanningDepth;
    modes: SessionWorkspacePanelProps['modes'];
    reasoningEffort: RuntimeReasoningEffort;
    runtimeOptions: RuntimeRunOptions;
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
    planOrchestrator: ReturnType<typeof buildConversationPlanOrchestrator>;
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
    executionStrategy: OrchestratorExecutionStrategy;
    onExecutionStrategyChange: (executionStrategy: OrchestratorExecutionStrategy) => void;
    onSelectChildThread: (threadId: EntityId<'thr'>) => void;
    onOpenToolArtifact: NonNullable<SessionWorkspacePanelProps['onOpenToolArtifact']>;
    onPromoteMessage: NonNullable<SessionWorkspacePanelProps['onPromoteMessage']>;
    setPlanningDepthSelection: (nextPlanningDepth: PlanningDepth) => void;
}

export function buildConversationWorkspaceProjection(
    input: BuildConversationWorkspaceProjectionInput
): SessionWorkspacePanelProps {
    const selectedThread = input.shellViewModel.selectedThread;
    const canConfigureExecutionStrategy =
        input.topLevelTab === 'orchestrator' &&
        selectedThread?.topLevelTab === 'orchestrator' &&
        !selectedThread.delegatedFromOrchestratorRunId &&
        selectedThread.id === selectedThread.rootThreadId;

    const executionEnvironmentPanel = (
        <ExecutionEnvironmentPanel
            topLevelTab={input.topLevelTab}
            selectedThread={selectedThread}
            workspaceScope={input.shellViewModel.workspaceScope}
            sandboxes={input.shellViewModel.visibleManagedSandboxes}
            busy={
                input.mutations.configureThreadSandboxMutation.isPending ||
                input.mutations.refreshSandboxMutation.isPending ||
                input.mutations.removeSandboxMutation.isPending ||
                input.mutations.removeOrphanedSandboxesMutation.isPending
            }
            {...(input.workspaceActions.feedbackMessage
                ? {
                      feedbackMessage: input.workspaceActions.feedbackMessage,
                      feedbackTone: input.workspaceActions.feedbackTone,
                  }
                : {})}
            onConfigureThread={(executionInput) => {
                if (!selectedThread || !isEntityId(selectedThread.id, 'thr')) {
                    return;
                }
                if (executionInput.mode === 'sandbox') {
                    if (!isEntityId(executionInput.sandboxId, 'sb')) {
                        return;
                    }
                    void input.workspaceActions.configureThreadExecution({
                        threadId: selectedThread.id,
                        executionInput: {
                            mode: executionInput.mode,
                            sandboxId: executionInput.sandboxId,
                        },
                    });
                    return;
                }
                void input.workspaceActions.configureThreadExecution({
                    threadId: selectedThread.id,
                    executionInput: {
                        mode: executionInput.mode,
                    },
                });
            }}
            onRefreshSandbox={(sandboxId) => {
                if (!isEntityId(sandboxId, 'sb')) {
                    return;
                }
                void input.workspaceActions.refreshSandbox(sandboxId);
            }}
            onRemoveSandbox={(sandboxId) => {
                if (!isEntityId(sandboxId, 'sb')) {
                    return;
                }
                void input.workspaceActions.removeSandbox(sandboxId);
            }}
            onRemoveOrphaned={() => {
                void input.workspaceActions.removeOrphanedSandboxes(selectedThread?.workspaceFingerprint);
            }}
        />
    );

    const modeExecutionPanel =
        input.isPlanningComposerMode || input.isOrchestrationWorkflowMode ? (
            <ModeExecutionPanel
                topLevelTab={input.topLevelTab}
                showPlanSurface={input.isPlanningComposerMode}
                showOrchestratorSurface={input.isOrchestrationWorkflowMode}
                planningDepthSelection={input.planningDepthSelection}
                isLoadingPlan={input.queries.activePlanQuery.isPending}
                actionController={input.planOrchestrator.actionController}
                selectedExecutionStrategy={input.executionStrategy}
                canConfigureExecutionStrategy={canConfigureExecutionStrategy}
                {...(input.planOrchestrator.activePlan ? { activePlan: input.planOrchestrator.activePlan } : {})}
                {...(input.planOrchestrator.orchestratorView
                    ? { orchestratorView: input.planOrchestrator.orchestratorView }
                    : {})}
                onExecutionStrategyChange={input.onExecutionStrategyChange}
                onPlanningDepthSelectionChange={input.setPlanningDepthSelection}
                onSelectChildThread={input.onSelectChildThread}
                onCreateVariant={input.planOrchestrator.actionController.onCreateVariant}
                onActivateVariant={input.planOrchestrator.actionController.onActivateVariant}
                onResumeFromRevision={input.planOrchestrator.actionController.onResumeFromRevision}
                onResolveFollowUp={input.planOrchestrator.actionController.onResolveFollowUp}
            />
        ) : undefined;

    const contextAssetsPanel =
        input.topLevelTab !== 'chat' && isEntityId(input.selectedSessionId, 'sess') ? (
            <ContextAssetsPanel
                profileId={input.profileId}
                sessionId={input.selectedSessionId}
                topLevelTab={input.topLevelTab}
                modeKey={input.modeKey}
                {...(selectedThread?.workspaceFingerprint
                    ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                    : {})}
                {...(input.shellViewModel.effectiveSelectedSandboxId
                    ? { sandboxId: input.shellViewModel.effectiveSelectedSandboxId }
                    : {})}
                attachedRules={input.shellViewModel.attachedRules}
                missingAttachedRuleKeys={input.shellViewModel.missingAttachedRuleKeys}
                attachedSkills={input.shellViewModel.attachedSkills}
                missingAttachedSkillKeys={input.shellViewModel.missingAttachedSkillKeys}
            />
        ) : undefined;

    const memoryPanel = selectedThread ? (
        <MemoryPanel
            profileId={input.profileId}
            topLevelTab={input.topLevelTab}
            modeKey={input.modeKey}
            {...(selectedThread.workspaceFingerprint
                ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                : {})}
            {...(input.shellViewModel.effectiveSelectedSandboxId
                ? { sandboxId: input.shellViewModel.effectiveSelectedSandboxId }
                : {})}
            {...(isEntityId(selectedThread.id, 'thr') ? { threadId: selectedThread.id } : {})}
            {...(isEntityId(input.selectedRunId, 'run') ? { runId: input.selectedRunId } : {})}
            {...(input.contextState ? { retrievedMemory: input.contextState.retrievedMemory } : {})}
        />
    ) : undefined;

    const diffCheckpointPanel =
        input.topLevelTab !== 'chat' ? (
            <DiffCheckpointPanel
                profileId={input.profileId}
                {...(isEntityId(input.selectedRunId, 'run') ? { selectedRunId: input.selectedRunId } : {})}
                {...(isEntityId(input.selectedSessionId, 'sess') ? { selectedSessionId: input.selectedSessionId } : {})}
                diffs={input.queries.runDiffsQuery.data?.diffs ?? []}
                checkpoints={input.queries.checkpointsQuery.data?.checkpoints ?? []}
                {...(input.queries.checkpointsQuery.data?.storage
                    ? { checkpointStorage: input.queries.checkpointsQuery.data.storage }
                    : {})}
                disabled={input.mutations.startRunMutation.isPending || input.mutations.planStartMutation.isPending}
            />
        ) : undefined;

    const panelProps: SessionWorkspacePanelProps = {
        profileId: input.profileId,
        profiles: input.profiles,
        ...(input.selectedProfileId ? { selectedProfileId: input.selectedProfileId } : {}),
        sessions: input.shellViewModel.sessionRunSelection.sessions,
        runs: input.shellViewModel.sessionRunSelection.runs,
        messages: input.shellViewModel.sessionRunSelection.messages,
        partsByMessageId: input.shellViewModel.sessionRunSelection.partsByMessageId,
        ...(input.selectedSessionId ? { selectedSessionId: input.selectedSessionId } : {}),
        ...(input.selectedRunId ? { selectedRunId: input.selectedRunId } : {}),
        ...(selectedThread?.workspaceFingerprint
            ? { selectedWorkspaceFingerprint: selectedThread.workspaceFingerprint }
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
        pendingTextFiles: input.composer.pendingTextFiles,
        readyComposerAttachments: [
            ...input.composer.pendingImages.flatMap((image) =>
                image.status === 'ready' && image.attachment ? [image.attachment] : []
            ),
            ...input.composer.pendingTextFiles.flatMap((file) =>
                file.status === 'ready' && file.attachment ? [file.attachment] : []
            ),
        ],
        hasBlockingPendingAttachments:
            input.composer.pendingImages.some((image) => image.status !== 'ready') ||
            input.composer.pendingTextFiles.some((file) => file.status === 'reading'),
        isCreatingSession: input.mutations.createSessionMutation.isPending,
        isStartingRun: input.mutations.startRunMutation.isPending || input.mutations.planStartMutation.isPending,
        isResolvingPermission: input.mutations.resolvePermissionMutation.isPending,
        canCreateSession: Boolean(selectedThread),
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
        ...(input.shellViewModel.selectedProviderStatus
            ? {
                  selectedProviderStatus: {
                      label: input.shellViewModel.selectedProviderStatus.label,
                      authState: input.shellViewModel.selectedProviderStatus.authState,
                      authMethod: input.shellViewModel.selectedProviderStatus.authMethod,
                  },
              }
            : {}),
        ...(input.shellViewModel.selectedModelLabel
            ? { selectedModelLabel: input.shellViewModel.selectedModelLabel }
            : {}),
        ...(input.shellViewModel.selectedTargetExplanation
            ? { selectedTargetExplanation: input.shellViewModel.selectedTargetExplanation }
            : {}),
        ...(input.shellViewModel.selectedUsageSummary
            ? { selectedUsageSummary: input.shellViewModel.selectedUsageSummary }
            : {}),
        ...(input.topLevelTab === 'agent' && input.shellViewModel.registryResolvedQuery.data
            ? {
                  registrySummary: {
                      modes: input.shellViewModel.registryResolvedQuery.data.resolved.modes.filter(
                          (resolvedMode) => resolvedMode.topLevelTab === 'agent'
                      ).length,
                      rulesets: input.shellViewModel.registryResolvedQuery.data.resolved.rulesets.length,
                      skillfiles: input.shellViewModel.registryResolvedQuery.data.resolved.skillfiles.length,
                  },
              }
            : {}),
        ...(input.topLevelTab === 'agent' && input.shellViewModel.activeModeLabel
            ? {
                  agentContextSummary: {
                      modeLabel: input.shellViewModel.activeModeLabel,
                      rulesetCount: input.shellViewModel.registryResolvedQuery.data?.resolved.rulesets.length ?? 0,
                      attachedRuleCount: input.shellViewModel.attachedRules.length,
                      attachedSkillCount: input.shellViewModel.attachedSkills.length,
                  },
              }
            : {}),
        ...(input.queries.runDiffsQuery.data?.overview
            ? { runDiffOverview: input.queries.runDiffsQuery.data.overview }
            : {}),
        modelOptions: input.composerModelOptions,
        runErrorMessage: input.composer.runSubmitError,
        ...(input.contextState ? { contextState: input.contextState } : {}),
        outboxEntries: input.queries.outboxQuery.data?.entries ?? [],
        ...(input.queries.executionReceiptQuery.data?.found
            ? { executionReceipt: input.queries.executionReceiptQuery.data.receipt }
            : {}),
        attachedRules: input.shellViewModel.attachedRules,
        missingAttachedRuleKeys: input.shellViewModel.missingAttachedRuleKeys,
        attachedSkills: input.shellViewModel.attachedSkills,
        missingAttachedSkillKeys: input.shellViewModel.missingAttachedSkillKeys,
        showRunContractPreview: !input.isPlanningComposerMode,
        runtimeOptions: input.runtimeOptions,
        canCompactContext:
            input.topLevelTab !== 'orchestrator' &&
            input.hasSelectedSession &&
            Boolean(input.contextState?.compactable),
        isCompactingContext: input.mutations.compactSessionMutation.isPending,
        executionEnvironmentPanel,
        ...(modeExecutionPanel ? { modeExecutionPanel } : {}),
        ...(contextAssetsPanel ? { contextAssetsPanel } : {}),
        ...(memoryPanel ? { memoryPanel } : {}),
        ...(diffCheckpointPanel ? { diffCheckpointPanel } : {}),
        promptResetKey: input.composer.promptResetKey,
        focusComposerRequestKey: input.focusComposerRequestKey,
        controlsDisabled: false,
        submitDisabled: !input.selectedSessionId,
        onSelectSession: input.sessionActions.onSelectSession,
        onSelectRun: input.onSelectRun,
        onProfileChange: input.onProfileChange,
        onProviderChange: input.onProviderChange,
        onModelChange: input.onModelChange,
        onReasoningEffortChange: input.onReasoningEffortChange,
        onModeChange: input.onModeChange,
        onCreateSession: input.sessionActions.onCreateSession,
        onPromptEdited: input.composer.onPromptEdited,
        onAddFiles: input.composer.onAddFiles,
        onRemovePendingImage: input.composer.onRemovePendingImage,
        onRemovePendingTextFile: input.composer.onRemovePendingTextFile,
        onRetryPendingImage: input.composer.onRetryPendingImage,
        ...(!input.isPlanningComposerMode ? { onQueuePrompt: input.composer.onQueuePrompt } : {}),
        onSubmitPrompt: input.composer.onSubmitPrompt,
        onMoveOutboxEntry: (entryId, direction) => {
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                return;
            }
            void input.mutations.moveOutboxEntryMutation
                .mutateAsync({
                    profileId: input.profileId,
                    sessionId: input.selectedSessionId,
                    entryId,
                    direction,
                })
                .then(() => input.queries.outboxQuery.refetch());
        },
        onResumeOutboxEntry: (entryId) => {
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                return;
            }
            void input.mutations.resumeOutboxEntryMutation
                .mutateAsync({
                    profileId: input.profileId,
                    sessionId: input.selectedSessionId,
                    entryId,
                })
                .then(async () => {
                    await Promise.all([input.queries.outboxQuery.refetch(), input.queries.runsQuery.refetch()]);
                });
        },
        onCancelOutboxEntry: (entryId) => {
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                return;
            }
            void input.mutations.cancelOutboxEntryMutation
                .mutateAsync({
                    profileId: input.profileId,
                    sessionId: input.selectedSessionId,
                    entryId,
                })
                .then(() => input.queries.outboxQuery.refetch());
        },
        onUpdateOutboxEntry: async (updateInput: {
            entryId: EntityId<'outbox'>;
            prompt: string;
            attachments: ComposerAttachmentInput[];
            browserContext?: BrowserContextPacket | null;
        }) => {
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                return;
            }
            await input.mutations.updateOutboxEntryMutation.mutateAsync({
                profileId: input.profileId,
                sessionId: input.selectedSessionId,
                entryId: updateInput.entryId,
                prompt: updateInput.prompt,
                attachments: updateInput.attachments,
                ...(updateInput.browserContext !== undefined ? { browserContext: updateInput.browserContext } : {}),
            });
            await input.queries.outboxQuery.refetch();
        },
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
        onOpenToolArtifact: input.onOpenToolArtifact,
        onPromoteMessage: input.onPromoteMessage,
    };

    return {
        ...panelProps,
        workspaceShell: {
            ...buildWorkspaceShellProjection(panelProps),
            ...(input.topLevelTab === 'orchestrator'
                ? {
                      orchestrator: {
                          isRootOrchestratorThread: canConfigureExecutionStrategy,
                          canConfigureExecutionStrategy,
                          selectedExecutionStrategy: input.executionStrategy,
                          childLaneSelections:
                              input.planOrchestrator.orchestratorView?.steps.flatMap((step) =>
                                  step.childThreadId
                                      ? [
                                            {
                                                threadId: step.childThreadId,
                                                ...(step.childSessionId ? { sessionId: step.childSessionId } : {}),
                                                ...(step.activeRunId
                                                    ? { runId: step.activeRunId }
                                                    : step.runId
                                                      ? { runId: step.runId }
                                                      : {}),
                                            },
                                        ]
                                      : []
                              ) ?? [],
                      },
                  }
                : {}),
        },
    };
}

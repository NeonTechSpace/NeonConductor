import { skipToken } from '@tanstack/react-query';
import { useEffectEvent } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { useConversationShellBranchWorkflowFlow } from '@/web/components/conversation/hooks/useConversationShellBranchWorkflowFlow';
import { useConversationShellEditFlow } from '@/web/components/conversation/hooks/useConversationShellEditFlow';
import { useConversationShellRoutingBadge } from '@/web/components/conversation/hooks/useConversationShellRoutingBadge';
import { buildConversationDialogProps } from '@/web/components/conversation/shell/buildConversationDialogProps';
import { buildConversationSidebarPaneProps } from '@/web/components/conversation/shell/buildConversationSidebarPaneProps';
import { buildConversationWorkspaceSectionProps } from '@/web/components/conversation/shell/buildConversationWorkspaceSectionProps';
import { buildConversationPlanOrchestrator } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';
import { buildConversationWorkspaceProjection } from '@/web/components/conversation/shell/composition/buildConversationWorkspaceProjection';
import { setOrchestratorLatestCache } from '@/web/components/conversation/shell/planCache';
import type { UseConversationShellViewControllersInput } from '@/web/components/conversation/shell/useConversationShellViewControllers.types';
import { useToolArtifactViewerController } from '@/web/components/conversation/shell/useToolArtifactViewerController';
import { createConversationThread } from '@/web/components/conversation/shell/workspace/createConversationThread';
import { isEntityId, isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import { useConversationWorkspaceActions } from '@/web/components/conversation/shell/workspace/useConversationWorkspaceActions';
import type { ThreadEntrySubmitResult } from '@/web/components/conversation/sidebar/sidebarTypes';

import type { RunRecord, SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { EntityId, RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import { DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE } from '@/shared/contracts';

export function useConversationShellViewControllers(input: UseConversationShellViewControllersInput) {
    const {
        profileId,
        profiles,
        selectedProfileId,
        topLevelTab,
        modeKey,
        modes,
        selectedWorkspaceFingerprint,
        onModeChange,
        onTopLevelTabChange,
        onSelectedWorkspaceFingerprintChange,
        onProfileChange,
        isSidebarCollapsed,
        onToggleSidebarCollapsed,
        tabSwitchNotice,
        setTabSwitchNotice,
        focusComposerRequestKey,
        setFocusComposerRequestKey,
        setRequestedReasoningEffort,
        setMainViewDraftTarget,
        queries,
        mutations,
        uiState,
        utils,
        streamState,
        streamErrorMessage,
        shellViewModel,
        selectionState,
        runTargetState,
        selectedSessionId,
        selectedRunId,
        hasSelectedSession,
        runtimeOptions,
        contextStateQueryInput,
        contextStateQuery,
        composerMediaSettings,
        composer,
        sessionActions,
        executionStrategy,
        handleExecutionStrategyChange,
        selectedComposerProviderId,
        selectedComposerModelId,
        selectedModelSupportsReasoning,
        supportedReasoningEfforts,
        effectiveReasoningEffort,
        composerModelOptions,
        canAttachImages,
        imageAttachmentBlockedReason,
        selectedModelCompatibilityState,
        selectedModelCompatibilityReason,
        applySessionWorkspaceUpdate,
        applyPlanWorkspaceUpdate,
    } = input;

    const editFlow = useConversationShellEditFlow({
        profileId,
        topLevelTab,
        modeKey,
        selectedSessionId,
        selectedThread: shellViewModel.selectedThread,
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        runtimeOptions,
        editSession: mutations.editSessionMutation.mutateAsync,
        setEditPreference: input.setEditPreference,
        uiState,
        onTopLevelTabChange,
        onClearError: composer.clearRunSubmitError,
        onError: composer.setRunSubmitError,
        onPromptReset: () => {
            composer.resetComposer();
        },
        onComposerFocusRequest: () => {
            setFocusComposerRequestKey((current: number) => current + 1);
        },
        onSessionEdited: ({
            session,
            run,
            thread,
        }: {
            session: SessionSummaryRecord;
            run?: RunRecord;
            thread?: ThreadListRecord;
        }) => {
            applySessionWorkspaceUpdate({
                session,
                ...(run ? { run } : {}),
                ...(thread ? { thread } : {}),
            });
        },
    });
    const branchWorkflowFlow = useConversationShellBranchWorkflowFlow({
        profileId,
        topLevelTab,
        modeKey,
        selectedSessionId,
        selectedThread: shellViewModel.selectedThread,
        uiState,
        branchFromMessage: mutations.branchFromMessageMutation.mutateAsync,
        branchFromMessageWithWorkflow: mutations.branchFromMessageWithWorkflowMutation.mutateAsync,
        onTopLevelTabChange,
        onClearError: composer.clearRunSubmitError,
        onError: composer.setRunSubmitError,
        onPromptReset: () => {
            composer.resetComposer();
        },
        onComposerFocusRequest: () => {
            setFocusComposerRequestKey((current: number) => current + 1);
        },
        onSessionEdited: ({ session, thread }: { session: SessionSummaryRecord; thread?: ThreadListRecord }) => {
            applySessionWorkspaceUpdate({
                session,
                ...(thread ? { thread } : {}),
            });
        },
    });
    const sidebarStatusMessage = queries.listBucketsQuery.isPending
        ? 'Loading conversation groups...'
        : queries.listTagsQuery.isPending
          ? 'Loading tags...'
          : queries.listThreadsQuery.isPending
            ? 'Loading threads...'
            : queries.sessionsQuery.isPending
              ? 'Loading sessions...'
              : (queries.listBucketsQuery.error?.message ??
                queries.listTagsQuery.error?.message ??
                queries.listThreadsQuery.error?.message ??
                queries.sessionsQuery.error?.message);
    const sidebarStatusTone: 'error' | 'info' | undefined =
        (queries.listBucketsQuery.error ??
        queries.listTagsQuery.error ??
        queries.listThreadsQuery.error ??
        queries.sessionsQuery.error)
            ? 'error'
            : sidebarStatusMessage
              ? 'info'
              : undefined;

    const routingBadge = useConversationShellRoutingBadge({
        profileId,
        providerId: runTargetState.selectedProviderIdForComposer,
        modelId: runTargetState.selectedModelIdForComposer,
    });
    const planOrchestrator = buildConversationPlanOrchestrator({
        profileId,
        applyPlanWorkspaceUpdate,
        applyOrchestratorWorkspaceUpdate: (latest) => {
            if (!isEntityId(selectedSessionId, 'sess')) {
                return;
            }
            setOrchestratorLatestCache({
                utils,
                profileId,
                sessionId: selectedSessionId,
                latest,
            });
        },
        onError: composer.setRunSubmitError,
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        runtimeOptions,
        workspaceFingerprint: shellViewModel.selectedThread?.workspaceFingerprint,
        activePlan: queries.activePlanQuery.data?.found ? queries.activePlanQuery.data.plan : undefined,
        orchestratorView: queries.orchestratorLatestQuery.data?.found
            ? queries.orchestratorLatestQuery.data
            : undefined,
        selectedExecutionStrategy: executionStrategy,
        planStartMutation: mutations.planStartMutation,
        planAnswerMutation: mutations.planAnswerMutation,
        planReviseMutation: mutations.planReviseMutation,
        planGenerateDraftMutation: mutations.planGenerateDraftMutation,
        planCancelMutation: mutations.planCancelMutation,
        planApproveMutation: mutations.planApproveMutation,
        planImplementMutation: mutations.planImplementMutation,
        orchestratorAbortMutation: mutations.orchestratorAbortMutation,
    });
    const workspaceActions = useConversationWorkspaceActions({
        profileId,
        listThreadsInput: queries.listThreadsInput,
        mutations,
        onResolvePermission: composer.clearRunSubmitError,
    });
    const toolArtifactViewer = useToolArtifactViewerController({
        profileId,
        selectedSessionId,
    });
    const handleCreateThread = useEffectEvent(
        async (threadCreationInput: {
            workspaceFingerprint: string;
            workspaceAbsolutePath: string;
            title: string;
            topLevelTab: TopLevelTab;
            providerId?: RuntimeProviderId;
            modelId?: string;
        }): Promise<ThreadEntrySubmitResult> => {
            return await createConversationThread(
                {
                    profileId,
                    topLevelTab,
                    utils,
                    listThreadsInput: queries.listThreadsInput,
                    uiState,
                    composer,
                    mutations,
                    sessionActions,
                    onTopLevelTabChange,
                    onSelectedWorkspaceFingerprintChange,
                    onApplySessionWorkspaceUpdate: ({ session, thread }) => {
                        applySessionWorkspaceUpdate({
                            session,
                            ...(thread ? { thread } : {}),
                        });
                    },
                    onSetTabSwitchNotice: setTabSwitchNotice,
                    onFocusComposerRequest: () => {
                        setFocusComposerRequestKey((current: number) => current + 1);
                    },
                },
                threadCreationInput
            );
        }
    );
    const workspacePanel = buildConversationWorkspaceProjection({
        profileId,
        profiles,
        selectedProfileId,
        selectedSessionId,
        selectedRunId,
        topLevelTab,
        modeKey,
        modes,
        reasoningEffort: effectiveReasoningEffort,
        selectedModelSupportsReasoning,
        ...(supportedReasoningEfforts !== undefined ? { supportedReasoningEfforts } : {}),
        composerModelOptions,
        shellViewModel,
        queries,
        mutations,
        composer,
        sessionActions,
        editFlow,
        branchFromMessage: branchWorkflowFlow.onBranchFromMessage,
        workspaceActions,
        planOrchestrator,
        selectedProviderId: selectedComposerProviderId,
        selectedModelId: selectedComposerModelId,
        canAttachImages,
        ...(imageAttachmentBlockedReason ? { imageAttachmentBlockedReason } : {}),
        ...(routingBadge !== undefined ? { routingBadge } : {}),
        ...(selectedModelCompatibilityState ? { selectedModelCompatibilityState } : {}),
        ...(selectedModelCompatibilityReason ? { selectedModelCompatibilityReason } : {}),
        ...(contextStateQuery.data ? { contextState: contextStateQuery.data } : {}),
        hasSelectedSession,
        maxImageAttachmentsPerMessage:
            composerMediaSettings?.maxImageAttachmentsPerMessage ?? DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
        onProfileChange,
        onModeChange,
        onReasoningEffortChange: setRequestedReasoningEffort,
        onSelectRun: uiState.setSelectedRunId,
        onProviderChange: (providerId: string) => {
            if (!isProviderId(providerId)) {
                return;
            }
            const nextModelId =
                composerModelOptions.find(
                    (option) => option.providerId === providerId && option.compatibilityState === 'compatible'
                )?.id ?? composerModelOptions.find((option) => option.providerId === providerId)?.id;
            if (!selectedSessionId) {
                setMainViewDraftTarget({
                    providerId,
                    ...(nextModelId ? { modelId: nextModelId } : {}),
                });
                return;
            }
            sessionActions.onProviderChange(providerId, nextModelId);
        },
        onModelChange: (modelId: string) => {
            if (!selectedSessionId) {
                const nextProviderId = runTargetState.selectedProviderIdForComposer;
                setMainViewDraftTarget({
                    ...(nextProviderId ? { providerId: nextProviderId } : {}),
                    modelId,
                });
                return;
            }
            if (!runTargetState.selectedProviderIdForComposer) {
                return;
            }
            sessionActions.onModelChange(runTargetState.selectedProviderIdForComposer, modelId);
        },
        onCompactContext: async () => {
            const currentSessionId = selectedSessionId;
            if (!hasSelectedSession || !currentSessionId || contextStateQueryInput === skipToken) {
                return {
                    tone: 'error' as const,
                    message: 'Context compaction is unavailable because no session is selected.',
                };
            }

            try {
                const result = await mutations.compactSessionMutation.mutateAsync({
                    profileId,
                    sessionId: currentSessionId,
                    providerId: contextStateQueryInput.providerId,
                    modelId: contextStateQueryInput.modelId,
                    topLevelTab,
                    modeKey,
                    ...(shellViewModel.selectedThread?.workspaceFingerprint
                        ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
                        : {}),
                });
                setResolvedContextStateCache({
                    utils,
                    queryInput: contextStateQueryInput,
                    state: result.resolvedState,
                });
                return {
                    tone: 'success' as const,
                    message: 'Context compacted for the current session.',
                };
            } catch (error: unknown) {
                return {
                    tone: 'error' as const,
                    message: error instanceof Error ? error.message : 'Context compaction failed.',
                };
            }
        },
        focusComposerRequestKey,
        executionStrategy,
        onExecutionStrategyChange: handleExecutionStrategyChange,
        onSelectChildThread: (threadId: EntityId<'thr'>) => {
            onTopLevelTabChange('agent');
            uiState.setSelectedThreadId(threadId);
            uiState.setSelectedSessionId(undefined);
            uiState.setSelectedRunId(undefined);
        },
        onOpenToolArtifact: toolArtifactViewer.openToolArtifact,
    });

    return {
        sidebarPaneProps: buildConversationSidebarPaneProps({
            profileId,
            topLevelTab,
            selectedWorkspaceFingerprint,
            isSidebarCollapsed,
            onToggleSidebarCollapsed,
            queries,
            mutations,
            uiState,
            selectionState,
            selectedSessionId,
            selectedRunId,
            onTopLevelTabChange,
            onSelectedWorkspaceFingerprintChange,
            setTabSwitchNotice,
            handleCreateThread,
            sidebarStatusMessage,
            sidebarStatusTone,
        }),
        workspaceSectionProps: buildConversationWorkspaceSectionProps({
            shellViewModel,
            queries,
            streamState,
            streamErrorMessage,
            tabSwitchNotice,
            topLevelTab,
            isSidebarCollapsed,
            onToggleSidebarCollapsed,
            onTopLevelTabChange,
            panel: workspacePanel,
        }),
        ...buildConversationDialogProps({
            messageEditDialogProps: {
                ...editFlow.dialogProps,
                busy: mutations.editSessionMutation.isPending || mutations.setEditPreferenceMutation.isPending,
            },
            branchWorkflowDialogProps: {
                ...branchWorkflowFlow.dialogProps,
                busy: mutations.branchFromMessageWithWorkflowMutation.isPending,
            },
            toolArtifactViewerDialogProps: toolArtifactViewer.dialogProps,
        }),
    } as const;
}

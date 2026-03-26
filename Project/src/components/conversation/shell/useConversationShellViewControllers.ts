import { skipToken } from '@tanstack/react-query';
import { useEffectEvent } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { useConversationShellBranchWorkflowFlow } from '@/web/components/conversation/hooks/useConversationShellBranchWorkflowFlow';
import { useConversationShellEditFlow } from '@/web/components/conversation/hooks/useConversationShellEditFlow';
import { useConversationShellRoutingBadge } from '@/web/components/conversation/hooks/useConversationShellRoutingBadge';
import { buildConversationPlanOrchestrator } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';
import { buildConversationWorkspacePanelProps } from '@/web/components/conversation/shell/composition/buildConversationWorkspacePanelProps';
import { buildConversationWorkspacePanels } from '@/web/components/conversation/shell/composition/buildConversationWorkspacePanels';
import { buildConversationWorkspaceSectionState } from '@/web/components/conversation/shell/composition/buildConversationWorkspaceSectionState';
import { setOrchestratorLatestCache } from '@/web/components/conversation/shell/planCache';
import { useConversationShellSync } from '@/web/components/conversation/shell/useConversationShellSync';
import { createConversationThread } from '@/web/components/conversation/shell/workspace/createConversationThread';
import { isEntityId, isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import { useConversationWorkspaceActions } from '@/web/components/conversation/shell/workspace/useConversationWorkspaceActions';

import type { ResolvedContextState } from '@/app/backend/runtime/contracts/types/context';
import type { RunRecord, SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import { DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE } from '@/shared/contracts';
import type { UseConversationShellViewControllersInput } from './useConversationShellViewControllers.types';

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
        onBootChromeReadyChange,
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
        contextStateQueryEnabled,
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
        onSessionEdited: ({
            session,
            thread,
        }: {
            session: SessionSummaryRecord;
            thread?: ThreadListRecord;
        }) => {
            applySessionWorkspaceUpdate({
                session,
                ...(thread ? { thread } : {}),
            });
        },
    });
    useConversationShellSync({
        profileId,
        modeKey,
        topLevelTab,
        selectedSessionId,
        selectedRunId,
        hasSelectedSession,
        streamState,
        contextStateQueryEnabled,
        contextStateQueryInput,
        uiState,
        queries,
        selectionState,
        runTargetState,
        utils,
        onSelectedWorkspaceFingerprintChange,
        onBootChromeReadyChange,
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
    const handleCreateThread = useEffectEvent(async (threadCreationInput: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }): Promise<void> => {
        await createConversationThread(
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
    });
    const workspaceSectionState = buildConversationWorkspaceSectionState({
        topLevelTab,
        modeKey,
        shellViewModel,
        queries,
        runTargetState,
    });
    const workspacePanels = buildConversationWorkspacePanels({
        profileId,
        topLevelTab,
        selectedSessionId,
        selectedRunId,
        modeKey,
        shellViewModel,
        queries,
        mutations,
        planOrchestrator,
        workspaceActions,
        onSelectThreadId: uiState.setSelectedThreadId,
        onSelectSessionId: uiState.setSelectedSessionId,
        onSelectRunId: uiState.setSelectedRunId,
        onTopLevelTabChange,
        executionStrategy,
        onExecutionStrategyChange: handleExecutionStrategyChange,
        ...(contextStateQuery.data ? { contextState: contextStateQuery.data } : {}),
    });

    return {
        sidebarPaneProps: {
            profileId,
            topLevelTab,
            isCollapsed: isSidebarCollapsed,
            onToggleCollapsed: onToggleSidebarCollapsed,
            workspaceRoots: queries.shellBootstrapQuery.data?.workspaceRoots ?? [],
            ...(selectedWorkspaceFingerprint ? { preferredWorkspaceFingerprint: selectedWorkspaceFingerprint } : {}),
            buckets: queries.listBucketsQuery.data?.buckets ?? [],
            threads: selectionState.visibleThreads,
            sessions: queries.sessionsQuery.data?.sessions ?? [],
            tags: queries.listTagsQuery.data?.tags ?? [],
            threadTagIdsByThread: selectionState.threadTagIdsByThread,
            selectedThreadId: selectionState.selectedThread?.id,
            selectedSessionId,
            selectedTagIds: uiState.selectedTagIds,
            scopeFilter: uiState.scopeFilter,
            workspaceFilter: uiState.workspaceFilter,
            sort: uiState.sort ?? 'latest',
            showAllModes: uiState.showAllModes,
            groupView: uiState.groupView,
            isAddingTag: mutations.upsertTagMutation.isPending || mutations.setThreadTagsMutation.isPending,
            isDeletingWorkspaceThreads: mutations.deleteWorkspaceThreadsMutation.isPending,
            isCreatingThread: mutations.createThreadMutation.isPending || mutations.createSessionMutation.isPending,
            ...(sidebarStatusMessage ? { statusMessage: sidebarStatusMessage } : {}),
            ...(sidebarStatusTone ? { statusTone: sidebarStatusTone } : {}),
            onTopLevelTabChange,
            onSetTabSwitchNotice: setTabSwitchNotice,
            onSelectThreadId: uiState.setSelectedThreadId,
            onSelectSessionId: uiState.setSelectedSessionId,
            onSelectRunId: uiState.setSelectedRunId,
            onSelectTagIds: uiState.setSelectedTagIds,
            onScopeFilterChange: uiState.setScopeFilter,
            onWorkspaceFilterChange: uiState.setWorkspaceFilter,
            onSortChange: uiState.setSort,
            onShowAllModesChange: uiState.setShowAllModes,
            onGroupViewChange: uiState.setGroupView,
            onCreateThread: handleCreateThread,
            onSelectWorkspaceFingerprint: (workspaceFingerprint: string | undefined) => {
                onSelectedWorkspaceFingerprintChange?.(workspaceFingerprint);
                uiState.setSelectedThreadId(undefined);
                uiState.setSelectedSessionId(undefined);
                uiState.setSelectedRunId(undefined);
            },
            upsertTag: mutations.upsertTagMutation.mutateAsync,
            setThreadTags: mutations.setThreadTagsMutation.mutateAsync,
            setThreadFavorite: mutations.setThreadFavoriteMutation.mutateAsync,
            deleteWorkspaceThreads: mutations.deleteWorkspaceThreadsMutation.mutateAsync,
        },
        workspaceSectionProps: {
            header: {
                selectedThread: shellViewModel.selectedThread,
                streamState,
                ...(streamErrorMessage !== undefined ? { streamErrorMessage } : {}),
                lastSequence: queries.shellBootstrapQuery.data?.lastSequence ?? 0,
                tabSwitchNotice,
                topLevelTab,
                isSidebarCollapsed,
            },
            panel: buildConversationWorkspacePanelProps({
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
                workspaceSectionState,
                workspacePanels,
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
                    composerMediaSettings?.maxImageAttachmentsPerMessage ??
                    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
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
                onCompactContext: () => {
                    const currentSessionId = selectedSessionId;
                    if (!hasSelectedSession || !currentSessionId || contextStateQueryInput === skipToken) {
                        return Promise.resolve({
                            tone: 'error' as const,
                            message: 'Context compaction is unavailable because no session is selected.',
                        });
                    }

                    return mutations.compactSessionMutation
                        .mutateAsync({
                            profileId,
                            sessionId: currentSessionId,
                            providerId: contextStateQueryInput.providerId,
                            modelId: contextStateQueryInput.modelId,
                            topLevelTab,
                            modeKey,
                            ...(shellViewModel.selectedThread?.workspaceFingerprint
                                ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
                                : {}),
                        })
                        .then((result: { resolvedState: ResolvedContextState }) => {
                            setResolvedContextStateCache({
                                utils,
                                queryInput: contextStateQueryInput,
                                state: result.resolvedState,
                            });
                            return {
                                tone: 'success' as const,
                                message: 'Context compacted for the current session.',
                            };
                        })
                        .catch((error: unknown) => ({
                            tone: 'error' as const,
                            message: error instanceof Error ? error.message : 'Context compaction failed.',
                        }));
                },
                focusComposerRequestKey,
            }),
            onToggleSidebar: onToggleSidebarCollapsed,
            onTopLevelTabChange,
        },
        messageEditDialogProps: {
            ...editFlow.dialogProps,
            busy: mutations.editSessionMutation.isPending || mutations.setEditPreferenceMutation.isPending,
        },
        branchWorkflowDialogProps: {
            ...branchWorkflowFlow.dialogProps,
            busy: mutations.branchFromMessageWithWorkflowMutation.isPending,
        },
    } as const;
}

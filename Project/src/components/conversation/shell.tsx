import { useEffect, useEffectEvent, useState } from 'react';

import { useConversationShellMutations } from '@/web/components/conversation/conversationShellMutations';
import { buildConversationShellPlanOrchestrator } from '@/web/components/conversation/conversationShellPlanOrchestrator';
import { useConversationShellQueries } from '@/web/components/conversation/conversationShellQueries';
import { useConversationShellRefetch } from '@/web/components/conversation/conversationShellRefetch';
import { useConversationShellRunTarget } from '@/web/components/conversation/conversationShellRunTarget';
import { ConversationShellSidebarPane } from '@/web/components/conversation/conversationShellSidebarPane';
import { useConversationShellSync } from '@/web/components/conversation/conversationShellSync';
import { ConversationShellWorkspaceSection } from '@/web/components/conversation/conversationShellWorkspaceSection';
import { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import { useConversationShellEditFlow } from '@/web/components/conversation/hooks/useConversationShellEditFlow';
import { useConversationShellRoutingBadge } from '@/web/components/conversation/hooks/useConversationShellRoutingBadge';
import { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { useThreadSidebarState } from '@/web/components/conversation/hooks/useThreadSidebarState';
import { AttachedSkillsPanel } from '@/web/components/conversation/panels/attachedSkillsPanel';
import { DiffCheckpointPanel } from '@/web/components/conversation/panels/diffCheckpointPanel';
import { ExecutionEnvironmentPanel } from '@/web/components/conversation/panels/executionEnvironmentPanel';
import { MessageEditDialog } from '@/web/components/conversation/panels/messageEditDialog';
import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import { DEFAULT_RUN_OPTIONS, isEntityId, isProviderId } from '@/web/components/conversation/shellHelpers';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';

import type { TopLevelTab } from '@/app/backend/runtime/contracts';

interface ConversationShellProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onSelectedWorkspaceFingerprintChange?: (workspaceFingerprint: string | undefined) => void;
}

export function ConversationShell({
    profileId,
    topLevelTab,
    modeKey,
    onTopLevelTabChange,
    onSelectedWorkspaceFingerprintChange,
}: ConversationShellProps) {
    const [tabSwitchNotice, setTabSwitchNotice] = useState<string | undefined>(undefined);
    const uiState = useConversationUiState(profileId);
    const queries = useConversationShellQueries({
        profileId,
        uiState,
        selectedSessionId: uiState.selectedSessionId,
        selectedRunId: uiState.selectedRunId,
        topLevelTab,
    });
    const mutations = useConversationShellMutations();
    const refetch = useConversationShellRefetch({ queries });
    const streamState = useRuntimeEventStreamStore((state) => state.connectionState);
    const selectedSessionId = uiState.selectedSessionId;
    const selectedRunId = uiState.selectedRunId;

    const sessionActions = useConversationShellSessionActions({
        profileId,
        selectedThreadId: uiState.selectedThreadId,
        selectedSessionId,
        createSession: mutations.createSessionMutation.mutateAsync,
        onClearError: () => {
            composer.clearRunSubmitError();
        },
        onError: (message) => {
            composer.setRunSubmitError(message);
        },
        onSelectSessionId: uiState.setSelectedSessionId,
        onSelectRunId: uiState.setSelectedRunId,
        refetchSessionIndex: () => {
            void refetch.refetchSessionIndex();
        },
    });

    const sidebarState = useThreadSidebarState({
        threads: queries.listThreadsQuery.data?.threads ?? [],
        threadTags: queries.shellBootstrapQuery.data?.threadTags ?? [],
        selectedTagId: uiState.selectedTagId,
        selectedThreadId: uiState.selectedThreadId,
        onSelectedThreadInvalid: () => {
            uiState.setSelectedThreadId(undefined);
        },
        onSelectFallbackThread: (threadId) => {
            uiState.setSelectedThreadId(threadId);
        },
    });

    const runTargetState = useConversationShellRunTarget({
        providers: queries.shellBootstrapQuery.data?.providers ?? [],
        providerModels: queries.shellBootstrapQuery.data?.providerModels ?? [],
        defaults: queries.shellBootstrapQuery.data?.defaults,
        runs: [],
        ...(sessionActions.sessionOverride ? { sessionOverride: sessionActions.sessionOverride } : {}),
    });
    const shellViewModel = useConversationShellViewModel({
        profileId,
        topLevelTab,
        modeKey,
        queries,
        uiState,
        sidebarState,
        runTargetState,
    });
    const runTargetStateWithRuns = useConversationShellRunTarget({
        providers: queries.shellBootstrapQuery.data?.providers ?? [],
        providerModels: queries.shellBootstrapQuery.data?.providerModels ?? [],
        defaults: queries.shellBootstrapQuery.data?.defaults,
        runs: shellViewModel.sessionRunSelection.runs,
        ...(sessionActions.sessionOverride ? { sessionOverride: sessionActions.sessionOverride } : {}),
    });

    const composer = useConversationShellComposer({
        profileId,
        selectedSessionId,
        isPlanningMode: modeKey === 'plan' && (topLevelTab === 'agent' || topLevelTab === 'orchestrator'),
        topLevelTab,
        modeKey,
        workspaceFingerprint: shellViewModel.selectedThread?.workspaceFingerprint,
        ...(shellViewModel.effectiveSelectedWorktreeId
            ? { worktreeId: shellViewModel.effectiveSelectedWorktreeId }
            : {}),
        resolvedRunTarget: runTargetStateWithRuns.resolvedRunTarget,
        providerById: runTargetStateWithRuns.providerById,
        runtimeOptions: DEFAULT_RUN_OPTIONS,
        isStartingRun: mutations.startRunMutation.isPending,
        startPlan: mutations.planStartMutation.mutateAsync,
        startRun: mutations.startRunMutation.mutateAsync,
        refetchActivePlan: () => {
            void queries.activePlanQuery.refetch();
        },
        refetchSessionWorkspace: () => {
            void refetch.refetchSessionWorkspace();
        },
    });
    const editFlow = useConversationShellEditFlow({
        profileId,
        topLevelTab,
        modeKey,
        selectedSessionId,
        selectedThread: shellViewModel.selectedThread,
        resolvedRunTarget: runTargetStateWithRuns.resolvedRunTarget,
        editSession: mutations.editSessionMutation.mutateAsync,
        setEditPreference: mutations.setEditPreferenceMutation.mutateAsync,
        uiState,
        onTopLevelTabChange,
        onClearError: composer.clearRunSubmitError,
        onError: composer.setRunSubmitError,
        onPromptReset: () => {
            composer.resetComposer();
        },
        refetchSessionWorkspace: () => {
            void refetch.refetchSessionWorkspace();
        },
    });
    const resetForProfile = useEffectEvent(() => {
        setTabSwitchNotice(undefined);
        composer.resetComposer();
        sessionActions.resetSessionActions();
        editFlow.resetEditFlow();
    });

    useConversationShellSync({
        profileId,
        uiState,
        threads: queries.listThreadsQuery.data,
        tags: queries.listTagsQuery.data?.tags,
        buckets: queries.listBucketsQuery.data?.buckets,
        onProfileReset: resetForProfile,
    });

    useEffect(() => {
        onSelectedWorkspaceFingerprintChange?.(shellViewModel.selectedThread?.workspaceFingerprint);
    }, [onSelectedWorkspaceFingerprintChange, shellViewModel.selectedThread?.workspaceFingerprint]);

    const routingBadge = useConversationShellRoutingBadge({
        profileId,
        providerId: runTargetStateWithRuns.selectedProviderIdForComposer,
        modelId: runTargetStateWithRuns.selectedModelIdForComposer,
    });
    const selectedProviderStatus = runTargetStateWithRuns.selectedProviderIdForComposer
        ? runTargetStateWithRuns.providerById.get(runTargetStateWithRuns.selectedProviderIdForComposer)
        : undefined;
    const selectedModelLabel =
        runTargetStateWithRuns.selectedProviderIdForComposer && runTargetStateWithRuns.selectedModelIdForComposer
            ? runTargetStateWithRuns.modelsByProvider
                  .get(runTargetStateWithRuns.selectedProviderIdForComposer)
                  ?.find((model) => model.id === runTargetStateWithRuns.selectedModelIdForComposer)?.label
            : undefined;
    const selectedUsageSummary = queries.usageSummaryQuery.data?.summaries.find(
        (summary) => summary.providerId === runTargetStateWithRuns.selectedProviderIdForComposer
    );
    const planOrchestrator = buildConversationShellPlanOrchestrator({
        profileId,
        activePlanRefetch: queries.activePlanQuery.refetch,
        orchestratorLatestRefetch: queries.orchestratorLatestQuery.refetch,
        sessionRunsRefetch: queries.runsQuery.refetch,
        onError: composer.setRunSubmitError,
        resolvedRunTarget: runTargetStateWithRuns.resolvedRunTarget,
        workspaceFingerprint: shellViewModel.selectedThread?.workspaceFingerprint,
        activePlan: queries.activePlanQuery.data?.found ? queries.activePlanQuery.data.plan : undefined,
        orchestratorView: queries.orchestratorLatestQuery.data?.found ? queries.orchestratorLatestQuery.data : undefined,
        planStartMutation: mutations.planStartMutation,
        planAnswerMutation: mutations.planAnswerMutation,
        planReviseMutation: mutations.planReviseMutation,
        planApproveMutation: mutations.planApproveMutation,
        planImplementMutation: mutations.planImplementMutation,
        orchestratorAbortMutation: mutations.orchestratorAbortMutation,
    });

    return (
        <main className='bg-background flex min-h-0 flex-1 overflow-hidden'>
            <ConversationShellSidebarPane
                profileId={profileId}
                topLevelTab={topLevelTab}
                buckets={queries.listBucketsQuery.data?.buckets ?? []}
                threads={sidebarState.visibleThreads}
                tags={queries.listTagsQuery.data?.tags ?? []}
                threadTagIdsByThread={sidebarState.threadTagIdsByThread}
                selectedThreadId={uiState.selectedThreadId}
                selectedTagId={uiState.selectedTagId}
                scopeFilter={uiState.scopeFilter}
                workspaceFilter={uiState.workspaceFilter}
                sort={uiState.sort ?? 'latest'}
                showAllModes={uiState.showAllModes}
                groupView={uiState.groupView}
                isCreatingThread={mutations.createThreadMutation.isPending}
                isAddingTag={mutations.upsertTagMutation.isPending || mutations.setThreadTagsMutation.isPending}
                onTopLevelTabChange={onTopLevelTabChange}
                onSetTabSwitchNotice={setTabSwitchNotice}
                onSelectThreadId={uiState.setSelectedThreadId}
                onSelectSessionId={uiState.setSelectedSessionId}
                onSelectRunId={uiState.setSelectedRunId}
                onSelectTagId={uiState.setSelectedTagId}
                onScopeFilterChange={uiState.setScopeFilter}
                onWorkspaceFilterChange={uiState.setWorkspaceFilter}
                onSortChange={uiState.setSort}
                onShowAllModesChange={uiState.setShowAllModes}
                onGroupViewChange={uiState.setGroupView}
                createThread={mutations.createThreadMutation.mutateAsync}
                upsertTag={mutations.upsertTagMutation.mutateAsync}
                setThreadTags={mutations.setThreadTagsMutation.mutateAsync}
                refetchBuckets={queries.listBucketsQuery.refetch}
                refetchThreads={queries.listThreadsQuery.refetch}
                refetchTags={queries.listTagsQuery.refetch}
                refetchShellBootstrap={queries.shellBootstrapQuery.refetch}
            />

            <ConversationShellWorkspaceSection
                selectedThread={shellViewModel.selectedThread}
                selectedSessionId={selectedSessionId}
                selectedRunId={selectedRunId}
                streamState={streamState}
                lastSequence={queries.shellBootstrapQuery.data?.lastSequence ?? 0}
                tabSwitchNotice={tabSwitchNotice}
                sessions={shellViewModel.sessionRunSelection.sessions}
                runs={shellViewModel.sessionRunSelection.runs}
                messages={shellViewModel.sessionRunSelection.messages}
                partsByMessageId={shellViewModel.sessionRunSelection.partsByMessageId}
                executionPreset={queries.shellBootstrapQuery.data?.executionPreset ?? 'standard'}
                workspaceScope={shellViewModel.workspaceScope}
                pendingPermissions={shellViewModel.pendingPermissions}
                permissionWorkspaces={shellViewModel.permissionWorkspaces}
                prompt={composer.prompt}
                isCreatingSession={mutations.createSessionMutation.isPending}
                isStartingRun={mutations.startRunMutation.isPending || mutations.planStartMutation.isPending}
                isResolvingPermission={mutations.resolvePermissionMutation.isPending}
                canCreateSession={Boolean(uiState.selectedThreadId)}
                selectedProviderId={runTargetStateWithRuns.selectedProviderIdForComposer}
                selectedModelId={runTargetStateWithRuns.selectedModelIdForComposer}
                routingBadge={routingBadge}
                {...(selectedProviderStatus
                    ? {
                          selectedProviderStatus: {
                              label: selectedProviderStatus.label,
                              authState: selectedProviderStatus.authState,
                              authMethod: selectedProviderStatus.authMethod,
                          },
                      }
                    : {})}
                {...(selectedModelLabel ? { selectedModelLabel } : {})}
                {...(selectedUsageSummary ? { selectedUsageSummary } : {})}
                {...(topLevelTab === 'agent' && shellViewModel.registryResolvedQuery.data
                    ? {
                          registrySummary: {
                              modes: shellViewModel.registryResolvedQuery.data.resolved.modes.filter(
                                  (resolvedMode) => resolvedMode.topLevelTab === 'agent'
                              ).length,
                              rulesets: shellViewModel.registryResolvedQuery.data.resolved.rulesets.length,
                              skillfiles: shellViewModel.registryResolvedQuery.data.resolved.skillfiles.length,
                          },
                      }
                    : {})}
                {...(topLevelTab === 'agent' && shellViewModel.activeModeLabel
                    ? {
                          agentContextSummary: {
                              modeLabel: shellViewModel.activeModeLabel,
                              rulesetCount: shellViewModel.registryResolvedQuery.data?.resolved.rulesets.length ?? 0,
                              attachedSkillCount: shellViewModel.attachedSkills.length,
                          },
                      }
                    : {})}
                providerOptions={runTargetStateWithRuns.providerOptions}
                modelOptions={runTargetStateWithRuns.modelOptions}
                runErrorMessage={composer.runSubmitError}
                onSelectSession={sessionActions.onSelectSession}
                onSelectRun={uiState.setSelectedRunId}
                onProviderChange={(providerId) => {
                    if (!isProviderId(providerId)) {
                        return;
                    }
                    sessionActions.onProviderChange(
                        providerId,
                        runTargetStateWithRuns.modelsByProvider.get(providerId)?.at(0)?.id
                    );
                }}
                onModelChange={(modelId) => {
                    sessionActions.onModelChange(runTargetStateWithRuns.selectedProviderIdForComposer, modelId);
                }}
                onCreateSession={sessionActions.onCreateSession}
                onPromptChange={composer.onPromptChange}
                onSubmitPrompt={composer.onSubmitPrompt}
                onResolvePermission={(requestId, resolution, selectedApprovalResource) => {
                    void mutations.resolvePermissionMutation
                        .mutateAsync({
                            profileId,
                            requestId,
                            resolution,
                            ...(selectedApprovalResource ? { selectedApprovalResource } : {}),
                        })
                        .then(() => queries.pendingPermissionsQuery.refetch());
                }}
                onEditMessage={editFlow.onEditMessage}
                onBranchFromMessage={editFlow.onBranchFromMessage}
                modePanel={
                    <ModeExecutionPanel
                        topLevelTab={topLevelTab}
                        modeKey={modeKey}
                        isLoadingPlan={queries.activePlanQuery.isLoading}
                        isPlanMutating={planOrchestrator.isPlanMutating}
                        isOrchestratorMutating={planOrchestrator.isOrchestratorMutating}
                        onAnswerQuestion={planOrchestrator.onAnswerQuestion}
                        onRevisePlan={planOrchestrator.onRevisePlan}
                        onApprovePlan={planOrchestrator.onApprovePlan}
                        onImplementPlan={planOrchestrator.onImplementPlan}
                        onAbortOrchestrator={planOrchestrator.onAbortOrchestrator}
                        {...(planOrchestrator.activePlan ? { activePlan: planOrchestrator.activePlan } : {})}
                        {...(planOrchestrator.orchestratorView
                            ? { orchestratorView: planOrchestrator.orchestratorView }
                            : {})}
                    />
                }
                executionEnvironmentPanel={
                    <ExecutionEnvironmentPanel
                        topLevelTab={topLevelTab}
                        selectedThread={shellViewModel.selectedThread}
                        workspaceScope={shellViewModel.workspaceScope}
                        worktrees={shellViewModel.visibleManagedWorktrees}
                        busy={
                            mutations.configureThreadWorktreeMutation.isPending ||
                            mutations.refreshWorktreeMutation.isPending ||
                            mutations.removeWorktreeMutation.isPending ||
                            mutations.removeOrphanedWorktreesMutation.isPending
                        }
                        onConfigureThread={(executionInput) => {
                            if (!shellViewModel.selectedThread || !isEntityId(shellViewModel.selectedThread.id, 'thr')) {
                                return;
                            }
                            if (executionInput.mode === 'worktree' && !isEntityId(executionInput.worktreeId, 'wt')) {
                                return;
                            }
                            const selectedWorktreeId =
                                executionInput.mode === 'worktree' && isEntityId(executionInput.worktreeId, 'wt')
                                    ? executionInput.worktreeId
                                    : undefined;
                            void mutations.configureThreadWorktreeMutation
                                .mutateAsync({
                                    profileId,
                                    threadId: shellViewModel.selectedThread.id,
                                    mode: executionInput.mode,
                                    ...(executionInput.executionBranch
                                        ? { executionBranch: executionInput.executionBranch }
                                        : {}),
                                    ...(executionInput.baseBranch ? { baseBranch: executionInput.baseBranch } : {}),
                                    ...(selectedWorktreeId ? { worktreeId: selectedWorktreeId } : {}),
                                })
                                .then(() => {
                                    void Promise.all([
                                        queries.listThreadsQuery.refetch(),
                                        queries.shellBootstrapQuery.refetch(),
                                        queries.sessionsQuery.refetch(),
                                    ]);
                                });
                        }}
                        onRefreshWorktree={(worktreeId) => {
                            if (!isEntityId(worktreeId, 'wt')) {
                                return;
                            }
                            void mutations.refreshWorktreeMutation
                                .mutateAsync({ profileId, worktreeId })
                                .then(() => queries.shellBootstrapQuery.refetch());
                        }}
                        onRemoveWorktree={(worktreeId) => {
                            if (!isEntityId(worktreeId, 'wt')) {
                                return;
                            }
                            void mutations.removeWorktreeMutation
                                .mutateAsync({ profileId, worktreeId, removeFiles: true })
                                .then(() => {
                                    void Promise.all([
                                        queries.shellBootstrapQuery.refetch(),
                                        queries.listThreadsQuery.refetch(),
                                        queries.sessionsQuery.refetch(),
                                    ]);
                                });
                        }}
                        onRemoveOrphaned={() => {
                            void mutations.removeOrphanedWorktreesMutation
                                .mutateAsync({
                                    profileId,
                                    ...(shellViewModel.selectedThread?.workspaceFingerprint
                                        ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
                                        : {}),
                                })
                                .then(() => {
                                    void queries.shellBootstrapQuery.refetch();
                                });
                        }}
                    />
                }
                attachedSkillsPanel={
                    topLevelTab === 'agent' && isEntityId(selectedSessionId, 'sess') ? (
                        <AttachedSkillsPanel
                            profileId={profileId}
                            sessionId={selectedSessionId}
                            {...(shellViewModel.selectedThread?.workspaceFingerprint
                                ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
                                : {})}
                            {...(shellViewModel.effectiveSelectedWorktreeId
                                ? { worktreeId: shellViewModel.effectiveSelectedWorktreeId }
                                : {})}
                            attachedSkills={shellViewModel.attachedSkills}
                            missingAssetKeys={shellViewModel.missingAttachedSkillKeys}
                        />
                    ) : undefined
                }
                diffCheckpointPanel={
                    topLevelTab !== 'chat' ? (
                        <DiffCheckpointPanel
                            profileId={profileId}
                            {...(isEntityId(selectedRunId, 'run') ? { selectedRunId } : {})}
                            {...(isEntityId(selectedSessionId, 'sess') ? { selectedSessionId } : {})}
                            diffs={queries.runDiffsQuery.data?.diffs ?? []}
                            checkpoints={queries.checkpointsQuery.data?.checkpoints ?? []}
                            disabled={mutations.startRunMutation.isPending || mutations.planStartMutation.isPending}
                        />
                    ) : undefined
                }
            />

            <MessageEditDialog
                {...editFlow.dialogProps}
                busy={mutations.editSessionMutation.isPending || mutations.setEditPreferenceMutation.isPending}
            />
        </main>
    );
}

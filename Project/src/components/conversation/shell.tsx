import { useEffect, useEffectEvent, useState } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import { useConversationShellEditFlow } from '@/web/components/conversation/hooks/useConversationShellEditFlow';
import { useConversationShellRoutingBadge } from '@/web/components/conversation/hooks/useConversationShellRoutingBadge';
import { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { useThreadSidebarState } from '@/web/components/conversation/hooks/useThreadSidebarState';
import { MessageEditDialog } from '@/web/components/conversation/panels/messageEditDialog';
import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import { buildConversationPlanOrchestrator } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';
import { buildConversationWorkspacePanels } from '@/web/components/conversation/shell/composition/buildConversationWorkspacePanels';
import { buildConversationWorkspaceSectionState } from '@/web/components/conversation/shell/composition/buildConversationWorkspaceSectionState';
import { ConversationWorkspaceSection } from '@/web/components/conversation/shell/composition/conversationWorkspaceSection';
import { applyConversationSessionCacheUpdate } from '@/web/components/conversation/shell/conversationShellCache';
import { setActivePlanCache, setOrchestratorLatestCache } from '@/web/components/conversation/shell/planCache';
import { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import { buildConversationUiSyncPatch } from '@/web/components/conversation/shell/queries/useConversationSync';
import {
    buildRuntimeRunOptions,
    DEFAULT_REASONING_EFFORT,
    isEntityId,
    isProviderId,
    modeRequiresNativeTools,
} from '@/web/components/conversation/shell/workspace/helpers';
import { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';
import { useConversationWorkspaceActions } from '@/web/components/conversation/shell/workspace/useConversationWorkspaceActions';
import { ConversationSidebarPane } from '@/web/components/conversation/sidebar/conversationSidebarPane';
import type { ConversationShellBootChromeReadiness } from '@/web/components/runtime/bootReadiness';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { trpc } from '@/web/trpc/client';

import type { RunRecord, SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { PlanRecordView, RuntimeReasoningEffort, TopLevelTab } from '@/shared/contracts';
import {
    DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/shared/contracts';

interface ConversationShellProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    modes: Array<{ id: string; modeKey: string; label: string }>;
    onModeChange: (modeKey: string) => void;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onSelectedWorkspaceFingerprintChange?: (workspaceFingerprint: string | undefined) => void;
    onBootChromeReadyChange?: (readiness: ConversationShellBootChromeReadiness) => void;
}

export function ConversationShell({
    profileId,
    topLevelTab,
    modeKey,
    modes,
    onModeChange,
    onTopLevelTabChange,
    onSelectedWorkspaceFingerprintChange,
    onBootChromeReadyChange,
}: ConversationShellProps) {
    const [tabSwitchNotice, setTabSwitchNotice] = useState<string | undefined>(undefined);
    const [contextFeedbackMessage, setContextFeedbackMessage] = useState<string | undefined>(undefined);
    const [contextFeedbackTone, setContextFeedbackTone] = useState<'success' | 'error' | 'info'>('info');
    const [focusComposerRequestKey, setFocusComposerRequestKey] = useState(0);
    const [requestedReasoningEffort, setRequestedReasoningEffort] =
        useState<RuntimeReasoningEffort>(DEFAULT_REASONING_EFFORT);
    const uiState = useConversationUiState(profileId);
    const utils = trpc.useUtils();
    const queries = useConversationQueries({
        profileId,
        uiState,
        selectedSessionId: uiState.selectedSessionId,
        selectedRunId: uiState.selectedRunId,
        topLevelTab,
    });
    const mutations = useConversationMutations();
    type PlanStartResult = Awaited<ReturnType<typeof mutations.planStartMutation.mutateAsync>>;
    type RunStartResult = Awaited<ReturnType<typeof mutations.startRunMutation.mutateAsync>>;
    type AcceptedRunStartResult = Extract<RunStartResult, { accepted: true }>;
    const setEditPreference = async (input: { profileId: string; value: 'truncate' | 'branch' }): Promise<void> => {
        await mutations.setEditPreferenceMutation.mutateAsync(input);
    };
    const streamState = useRuntimeEventStreamStore((state) => state.connectionState);
    const streamErrorMessage = useRuntimeEventStreamStore((state) => state.lastError);
    const requestedSessionId = uiState.selectedSessionId;
    const applySessionWorkspaceUpdate = useEffectEvent(
        (input: {
            session: SessionSummaryRecord;
            run?: RunRecord;
            thread?: ThreadListRecord;
            initialMessagesForRun?: AcceptedRunStartResult['initialMessages'];
        }) => {
            if (!isEntityId(input.session.id, 'sess')) {
                return;
            }

            applyConversationSessionCacheUpdate({
                utils,
                profileId,
                listThreadsInput: queries.listThreadsInput,
                session: input.session,
                ...(input.run ? { run: input.run } : {}),
                ...(input.thread ? { thread: input.thread } : {}),
                ...(input.run && input.initialMessagesForRun
                    ? {
                          initialMessagesForRun: {
                              runId: input.run.id,
                              messages: input.initialMessagesForRun.messages,
                              messageParts: input.initialMessagesForRun.messageParts,
                          },
                      }
                    : {}),
            });
        }
    );
    const applyPlanWorkspaceUpdate = useEffectEvent(
        (result: { found: false } | { found: true; plan: PlanRecordView }) => {
            if (!isEntityId(selectedSessionId, 'sess')) {
                return;
            }

            setActivePlanCache({
                utils,
                profileId,
                sessionId: selectedSessionId,
                topLevelTab,
                planResult: result,
            });
        }
    );

    const sessionActions = useConversationShellSessionActions({
        profileId,
        selectedThreadId: uiState.selectedThreadId,
        selectedSessionId: requestedSessionId,
        createSession: mutations.createSessionMutation.mutateAsync,
        onClearError: () => {
            composer.clearRunSubmitError();
        },
        onError: (message) => {
            composer.setRunSubmitError(message);
        },
        onSelectSessionId: uiState.setSelectedSessionId,
        onSelectRunId: uiState.setSelectedRunId,
        onSessionCreated: ({ sessionId, session, thread }) => {
            utils.session.listRuns.setData(
                {
                    profileId,
                    sessionId,
                },
                {
                    runs: [],
                }
            );
            applySessionWorkspaceUpdate({
                session,
                ...(thread ? { thread } : {}),
            });
        },
    });
    const sidebarState = useThreadSidebarState({
        threads: queries.listThreadsQuery.data?.threads ?? [],
        threadTags: queries.shellBootstrapQuery.data?.threadTags ?? [],
        selectedTagIds: uiState.selectedTagIds,
        selectedThreadId: uiState.selectedThreadId,
        onSelectedThreadInvalid: () => {
            uiState.setSelectedThreadId(undefined);
        },
        onSelectFallbackThread: (threadId) => {
            uiState.setSelectedThreadId(threadId);
        },
    });
    const initialRunTargetState = useConversationRunTarget({
        providers: queries.shellBootstrapQuery.data?.providers ?? [],
        providerModels: queries.shellBootstrapQuery.data?.providerModels ?? [],
        defaults: queries.shellBootstrapQuery.data?.defaults,
        runs: [],
        requiresTools: modeRequiresNativeTools({ topLevelTab, modeKey }),
        ...(sessionActions.sessionOverride ? { sessionOverride: sessionActions.sessionOverride } : {}),
    });
    const shellViewModel = useConversationShellViewModel({
        profileId,
        topLevelTab,
        modeKey,
        queries,
        uiState,
        sidebarState,
        runTargetState: initialRunTargetState,
    });
    const runTargetState = useConversationRunTarget({
        providers: queries.shellBootstrapQuery.data?.providers ?? [],
        providerModels: queries.shellBootstrapQuery.data?.providerModels ?? [],
        defaults: queries.shellBootstrapQuery.data?.defaults,
        runs: shellViewModel.sessionRunSelection.runs,
        requiresTools: modeRequiresNativeTools({ topLevelTab, modeKey }),
        ...(sessionActions.sessionOverride ? { sessionOverride: sessionActions.sessionOverride } : {}),
    });
    const selectedSessionId = shellViewModel.sessionRunSelection.selection.resolvedSessionId;
    const selectedRunId = shellViewModel.sessionRunSelection.selection.resolvedRunId;
    const fallbackContextSessionId = 'sess_missing';
    const hasSelectedSession = isEntityId(selectedSessionId, 'sess');
    const contextSessionId = hasSelectedSession ? selectedSessionId : fallbackContextSessionId;
    const contextProviderId = runTargetState.selectedProviderIdForComposer ?? 'openai';
    const contextModelId = runTargetState.selectedModelIdForComposer ?? 'openai/gpt-5';
    const contextStateQueryInput = {
        profileId,
        sessionId: contextSessionId,
        providerId: contextProviderId,
        modelId: contextModelId,
        topLevelTab,
        modeKey,
        ...(shellViewModel.selectedThread?.workspaceFingerprint
            ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
            : {}),
    };
    const isPlanningComposerMode = modeKey === 'plan' && (topLevelTab === 'agent' || topLevelTab === 'orchestrator');
    const selectedModelSupportsReasoning = Boolean(runTargetState.selectedModelForComposer?.supportsReasoning);
    const supportedReasoningEfforts =
        runTargetState.selectedProviderIdForComposer === 'kilo'
            ? (runTargetState.selectedModelForComposer?.reasoningEfforts?.filter(
                  (effort): effort is Exclude<RuntimeReasoningEffort, 'none'> => effort !== 'none'
              ) ?? [])
            : undefined;
    const canAdjustReasoningEffort =
        selectedModelSupportsReasoning &&
        (supportedReasoningEfforts === undefined || supportedReasoningEfforts.length > 0);
    const effectiveReasoningEffort =
        selectedModelSupportsReasoning &&
        canAdjustReasoningEffort &&
        (supportedReasoningEfforts === undefined ||
            requestedReasoningEffort === 'none' ||
            supportedReasoningEfforts.includes(requestedReasoningEffort))
            ? requestedReasoningEffort
            : 'none';
    const runtimeOptions = buildRuntimeRunOptions({
        supportsReasoning: selectedModelSupportsReasoning,
        reasoningEffort: effectiveReasoningEffort,
    });
    const canAttachImages =
        topLevelTab !== 'orchestrator' &&
        !isPlanningComposerMode &&
        Boolean(runTargetState.selectedModelForComposer?.supportsVision);
    const imageAttachmentBlockedReason = isPlanningComposerMode
        ? 'Image attachments are only available for executable runs.'
        : runTargetState.selectedModelForComposer?.supportsVision
          ? undefined
          : 'Select a vision-capable model to attach images.';
    const contextStateQuery = trpc.context.getResolvedState.useQuery(contextStateQueryInput, {
        enabled:
            hasSelectedSession &&
            topLevelTab !== 'orchestrator' &&
            Boolean(runTargetState.selectedProviderIdForComposer) &&
            Boolean(runTargetState.selectedModelIdForComposer),
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const composerMediaSettingsQuery = trpc.composer.getSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const composerMediaSettings = composerMediaSettingsQuery.data?.settings;
    const composer = useConversationShellComposer({
        profileId,
        selectedSessionId,
        isPlanningMode: isPlanningComposerMode,
        topLevelTab,
        modeKey,
        workspaceFingerprint: shellViewModel.selectedThread?.workspaceFingerprint,
        ...(shellViewModel.effectiveSelectedWorktreeId
            ? { worktreeId: shellViewModel.effectiveSelectedWorktreeId }
            : {}),
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        providerById: runTargetState.providerById,
        runtimeOptions,
        isStartingRun: mutations.startRunMutation.isPending,
        canAttachImages,
        maxImageAttachmentsPerMessage:
            composerMediaSettings?.maxImageAttachmentsPerMessage ?? DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
        imageCompressionConcurrency:
            composerMediaSettings?.imageCompressionConcurrency ?? DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
        ...(imageAttachmentBlockedReason ? { imageAttachmentBlockedReason } : {}),
        startPlan: mutations.planStartMutation.mutateAsync,
        startRun: mutations.startRunMutation.mutateAsync,
        onPlanStarted: (result: PlanStartResult) => {
            applyPlanWorkspaceUpdate({
                found: true,
                plan: result.plan,
            });
        },
        onRunStarted: (acceptedRun: AcceptedRunStartResult) => {
            uiState.setSelectedRunId(acceptedRun.run.id);
            applySessionWorkspaceUpdate({
                session: acceptedRun.session,
                run: acceptedRun.run,
                initialMessagesForRun: acceptedRun.initialMessages,
                ...(acceptedRun.thread ? { thread: acceptedRun.thread } : {}),
            });
            setResolvedContextStateCache({
                utils,
                queryInput: contextStateQueryInput,
                state: acceptedRun.resolvedContextState,
            });
        },
    });
    const editFlow = useConversationShellEditFlow({
        profileId,
        topLevelTab,
        modeKey,
        selectedSessionId,
        selectedThread: shellViewModel.selectedThread,
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        runtimeOptions,
        editSession: mutations.editSessionMutation.mutateAsync,
        branchFromMessage: mutations.branchFromMessageMutation.mutateAsync,
        setEditPreference,
        uiState,
        onTopLevelTabChange,
        onClearError: composer.clearRunSubmitError,
        onError: composer.setRunSubmitError,
        onPromptReset: () => {
            composer.resetComposer();
        },
        onComposerFocusRequest: () => {
            setFocusComposerRequestKey((current) => current + 1);
        },
        onSessionEdited: ({ session, run, thread }) => {
            applySessionWorkspaceUpdate({
                session,
                ...(run ? { run } : {}),
                ...(thread ? { thread } : {}),
            });
        },
    });
    const reconcileConversationSelection = useEffectEvent(() => {
        const selection = shellViewModel.sessionRunSelection.selection;
        if (selection.shouldUpdateSessionSelection) {
            uiState.setSelectedSessionId(selection.resolvedSessionId);
        }
        if (selection.shouldUpdateRunSelection) {
            uiState.setSelectedRunId(selection.resolvedRunId);
        }
    });
    const reconcileConversationUiState = useEffectEvent(() => {
        const patch = buildConversationUiSyncPatch({
            uiState,
            threads: queries.listThreadsQuery.data,
            tags: queries.listTagsQuery.data?.tags,
            buckets: queries.listBucketsQuery.data?.buckets,
        });
        if (!patch) {
            return;
        }

        if (patch.sort !== undefined) {
            uiState.setSort(patch.sort);
        }
        if (patch.showAllModes !== undefined) {
            uiState.setShowAllModes(patch.showAllModes);
        }
        if (patch.groupView !== undefined) {
            uiState.setGroupView(patch.groupView);
        }
        if (patch.selectedTagIds !== undefined) {
            uiState.setSelectedTagIds(patch.selectedTagIds);
        }
        if (patch.workspaceFilter === undefined && uiState.workspaceFilter) {
            uiState.setWorkspaceFilter(undefined);
        }
    });

    useEffect(() => {
        reconcileConversationSelection();
    }, [reconcileConversationSelection, shellViewModel.sessionRunSelection.selection]);

    useEffect(() => {
        reconcileConversationUiState();
    }, [
        queries.listBucketsQuery.data?.buckets,
        queries.listTagsQuery.data?.tags,
        queries.listThreadsQuery.data,
        reconcileConversationUiState,
        uiState.groupView,
        uiState.selectedTagIds,
        uiState.showAllModes,
        uiState.sort,
        uiState.workspaceFilter,
    ]);

    useEffect(() => {
        onSelectedWorkspaceFingerprintChange?.(shellViewModel.selectedThread?.workspaceFingerprint);
    }, [onSelectedWorkspaceFingerprintChange, shellViewModel.selectedThread?.workspaceFingerprint]);

    useEffect(() => {
        if (!isEntityId(uiState.selectedThreadId, 'thr')) {
            return;
        }

        const nextSession = (queries.sessionsQuery.data?.sessions ?? [])
            .filter((session) => session.threadId === uiState.selectedThreadId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .at(0);
        if (!nextSession) {
            return;
        }

        void utils.session.listRuns.prefetch({
            profileId,
            sessionId: nextSession.id,
        });
    }, [profileId, queries.sessionsQuery.data?.sessions, uiState.selectedThreadId, utils.session.listRuns]);

    useEffect(() => {
        if (!hasSelectedSession) {
            return;
        }

        void utils.session.listRuns.prefetch({
            profileId,
            sessionId: selectedSessionId,
        });

        void utils.session.listMessages.prefetch({
            profileId,
            sessionId: selectedSessionId,
        });

        const preferredRunId = isEntityId(selectedRunId, 'run')
            ? selectedRunId
            : shellViewModel.sessionRunSelection.runs.at(0)?.id;
        if (preferredRunId) {
            void utils.diff.listByRun.prefetch({
                profileId,
                runId: preferredRunId,
            });
        }

        if (topLevelTab !== 'chat') {
            void utils.checkpoint.list.prefetch({
                profileId,
                sessionId: selectedSessionId,
            });
        }
    }, [
        hasSelectedSession,
        profileId,
        selectedSessionId,
        shellViewModel.sessionRunSelection.runs,
        topLevelTab,
        selectedRunId,
        utils.checkpoint.list,
        utils.diff.listByRun,
        utils.session.listMessages,
        utils.session.listRuns,
    ]);

    useEffect(() => {
        if (topLevelTab === 'chat' || !shellViewModel.selectedThread?.workspaceFingerprint) {
            return;
        }

        void utils.worktree.list.prefetch({
            profileId,
            workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint,
        });
    }, [profileId, shellViewModel.selectedThread?.workspaceFingerprint, topLevelTab, utils.worktree.list]);

    const refetchSelectedConversationState = useEffectEvent(() => {
        if (!hasSelectedSession) {
            return;
        }

        const activeRunId = isEntityId(selectedRunId, 'run')
            ? selectedRunId
            : shellViewModel.sessionRunSelection.runs.at(0)?.id;

        void utils.session.status.fetch({
            profileId,
            sessionId: selectedSessionId,
        });
        void utils.session.listRuns.fetch({
            profileId,
            sessionId: selectedSessionId,
        });
        void utils.session.listMessages.fetch({
            profileId,
            sessionId: selectedSessionId,
        });

        if (activeRunId) {
            void utils.diff.listByRun.fetch({
                profileId,
                runId: activeRunId,
            });
        }
    });

    useEffect(() => {
        if (streamState !== 'error' || !hasSelectedSession) {
            return;
        }

        refetchSelectedConversationState();
        const intervalHandle = window.setInterval(() => {
            refetchSelectedConversationState();
        }, 1500);

        return () => {
            window.clearInterval(intervalHandle);
        };
    }, [hasSelectedSession, refetchSelectedConversationState, streamState]);

    useEffect(() => {
        onBootChromeReadyChange?.({
            shellBootstrapSettled: !queries.shellBootstrapQuery.isPending,
            ...(queries.shellBootstrapQuery.error?.message
                ? { shellBootstrapErrorMessage: queries.shellBootstrapQuery.error.message }
                : {}),
        });

        return () => {
            onBootChromeReadyChange?.({
                shellBootstrapSettled: false,
            });
        };
    }, [onBootChromeReadyChange, queries.shellBootstrapQuery.error?.message, queries.shellBootstrapQuery.isPending]);

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
    const sidebarStatusTone =
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
    });

    return (
        <main className='bg-background flex h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
            <ConversationSidebarPane
                profileId={profileId}
                topLevelTab={topLevelTab}
                buckets={queries.listBucketsQuery.data?.buckets ?? []}
                threads={sidebarState.visibleThreads}
                sessions={queries.sessionsQuery.data?.sessions ?? []}
                tags={queries.listTagsQuery.data?.tags ?? []}
                threadTagIdsByThread={sidebarState.threadTagIdsByThread}
                selectedThreadId={uiState.selectedThreadId}
                selectedSessionId={selectedSessionId}
                selectedTagIds={uiState.selectedTagIds}
                scopeFilter={uiState.scopeFilter}
                workspaceFilter={uiState.workspaceFilter}
                sort={uiState.sort ?? 'latest'}
                showAllModes={uiState.showAllModes}
                groupView={uiState.groupView}
                isCreatingThread={mutations.createThreadMutation.isPending || mutations.createSessionMutation.isPending}
                isAddingTag={mutations.upsertTagMutation.isPending || mutations.setThreadTagsMutation.isPending}
                isDeletingWorkspaceThreads={mutations.deleteWorkspaceThreadsMutation.isPending}
                {...(sidebarStatusMessage
                    ? {
                          statusMessage: sidebarStatusMessage,
                          ...(sidebarStatusTone ? { statusTone: sidebarStatusTone } : {}),
                      }
                    : {})}
                onTopLevelTabChange={onTopLevelTabChange}
                onSetTabSwitchNotice={setTabSwitchNotice}
                onSelectThreadId={uiState.setSelectedThreadId}
                onSelectSessionId={uiState.setSelectedSessionId}
                onSelectRunId={uiState.setSelectedRunId}
                onSelectTagIds={uiState.setSelectedTagIds}
                onScopeFilterChange={uiState.setScopeFilter}
                onWorkspaceFilterChange={uiState.setWorkspaceFilter}
                onSortChange={uiState.setSort}
                onShowAllModesChange={uiState.setShowAllModes}
                onGroupViewChange={uiState.setGroupView}
                createThread={mutations.createThreadMutation.mutateAsync}
                createSession={mutations.createSessionMutation.mutateAsync}
                upsertTag={mutations.upsertTagMutation.mutateAsync}
                setThreadTags={mutations.setThreadTagsMutation.mutateAsync}
                setThreadFavorite={mutations.setThreadFavoriteMutation.mutateAsync}
                deleteWorkspaceThreads={mutations.deleteWorkspaceThreadsMutation.mutateAsync}
            />

            <ConversationWorkspaceSection
                profileId={profileId}
                selectedThread={shellViewModel.selectedThread}
                selectedSessionId={selectedSessionId}
                selectedRunId={selectedRunId}
                streamState={streamState}
                streamErrorMessage={streamErrorMessage}
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
                pendingImages={composer.pendingImages}
                isCreatingSession={mutations.createSessionMutation.isPending}
                isStartingRun={mutations.startRunMutation.isPending || mutations.planStartMutation.isPending}
                isResolvingPermission={mutations.resolvePermissionMutation.isPending}
                canCreateSession={Boolean(uiState.selectedThreadId)}
                selectedProviderId={runTargetState.selectedProviderIdForComposer}
                selectedModelId={runTargetState.selectedModelIdForComposer}
                topLevelTab={topLevelTab}
                activeModeKey={modeKey}
                modes={modes}
                reasoningEffort={effectiveReasoningEffort}
                selectedModelSupportsReasoning={selectedModelSupportsReasoning}
                {...(supportedReasoningEfforts !== undefined ? { supportedReasoningEfforts } : {})}
                maxImageAttachmentsPerMessage={
                    composerMediaSettings?.maxImageAttachmentsPerMessage ??
                    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE
                }
                canAttachImages={canAttachImages}
                {...(imageAttachmentBlockedReason ? { imageAttachmentBlockedReason } : {})}
                routingBadge={routingBadge}
                {...workspaceSectionState}
                modelOptions={runTargetState.modelOptions}
                runErrorMessage={composer.runSubmitError}
                {...(contextStateQuery.data ? { contextState: contextStateQuery.data } : {})}
                {...(contextFeedbackMessage
                    ? {
                          contextFeedbackMessage,
                          contextFeedbackTone,
                      }
                    : {})}
                canCompactContext={
                    topLevelTab !== 'orchestrator' && hasSelectedSession && Boolean(contextStateQuery.data?.compactable)
                }
                isCompactingContext={mutations.compactSessionMutation.isPending}
                onSelectSession={sessionActions.onSelectSession}
                onSelectRun={uiState.setSelectedRunId}
                onProviderChange={(providerId) => {
                    if (!isProviderId(providerId)) {
                        return;
                    }
                    sessionActions.onProviderChange(
                        providerId,
                        runTargetState.modelsByProvider.get(providerId)?.at(0)?.id
                    );
                }}
                onModelChange={(modelId) => {
                    sessionActions.onModelChange(runTargetState.selectedProviderIdForComposer, modelId);
                }}
                onReasoningEffortChange={setRequestedReasoningEffort}
                onModeChange={onModeChange}
                onCreateSession={sessionActions.onCreateSession}
                onPromptChange={composer.onPromptChange}
                onAddImageFiles={composer.onAddImageFiles}
                onRemovePendingImage={composer.onRemovePendingImage}
                onRetryPendingImage={composer.onRetryPendingImage}
                onSubmitPrompt={composer.onSubmitPrompt}
                onCompactContext={() => {
                    if (!hasSelectedSession) {
                        return;
                    }

                    setContextFeedbackMessage(undefined);
                    void mutations.compactSessionMutation
                        .mutateAsync({
                            profileId,
                            sessionId: contextSessionId,
                            providerId: contextProviderId,
                            modelId: contextModelId,
                            topLevelTab,
                            modeKey,
                            ...(shellViewModel.selectedThread?.workspaceFingerprint
                                ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
                                : {}),
                        })
                        .then((result) => {
                            setResolvedContextStateCache({
                                utils,
                                queryInput: contextStateQueryInput,
                                state: result.resolvedState,
                            });
                            setContextFeedbackTone('success');
                            setContextFeedbackMessage('Context compacted for the current session.');
                        })
                        .catch((error: unknown) => {
                            setContextFeedbackTone('error');
                            setContextFeedbackMessage(
                                error instanceof Error ? error.message : 'Context compaction failed.'
                            );
                        });
                }}
                onResolvePermission={(requestId, resolution, selectedApprovalResource) => {
                    void workspaceActions.resolvePermission(
                        selectedApprovalResource
                            ? { requestId, resolution, selectedApprovalResource }
                            : { requestId, resolution }
                    );
                }}
                onEditMessage={editFlow.onEditMessage}
                onBranchFromMessage={editFlow.onBranchFromMessage}
                modePanel={workspacePanels.modePanel}
                executionEnvironmentPanel={workspacePanels.executionEnvironmentPanel}
                attachedSkillsPanel={workspacePanels.attachedSkillsPanel}
                diffCheckpointPanel={workspacePanels.diffCheckpointPanel}
                focusComposerRequestKey={focusComposerRequestKey}
            />

            <MessageEditDialog
                {...editFlow.dialogProps}
                busy={mutations.editSessionMutation.isPending || mutations.setEditPreferenceMutation.isPending}
            />
        </main>
    );
}

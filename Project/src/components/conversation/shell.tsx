import { useEffect, useState } from 'react';

import { useConversationShellMutations } from '@/web/components/conversation/conversationShellMutations';
import { buildConversationShellPlanOrchestrator } from '@/web/components/conversation/conversationShellPlanOrchestrator';
import { useConversationShellQueries } from '@/web/components/conversation/conversationShellQueries';
import { useConversationShellRunTarget } from '@/web/components/conversation/conversationShellRunTarget';
import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { useSessionRunSelection } from '@/web/components/conversation/hooks/useSessionRunSelection';
import { useThreadSidebarState } from '@/web/components/conversation/hooks/useThreadSidebarState';
import type { MessageTimelineEntry } from '@/web/components/conversation/messageTimelineModel';
import { MessageEditDialog } from '@/web/components/conversation/panels/messageEditDialog';
import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import { SessionWorkspacePanel } from '@/web/components/conversation/sessionWorkspacePanel';
import { DEFAULT_RUN_OPTIONS, isEntityId, isProviderId } from '@/web/components/conversation/shellHelpers';
import { submitPrompt as submitPromptFromComposer } from '@/web/components/conversation/shellPromptSubmit';
import { ConversationSidebar } from '@/web/components/conversation/sidebar';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { useRuntimeSnapshot } from '@/web/lib/runtime/useRuntimeSnapshot';
import { trpc } from '@/web/trpc/client';

import type { EntityId, RuntimeProviderId, TopLevelTab } from '@/app/backend/runtime/contracts';

interface ConversationShellProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
}

interface PendingMessageEdit {
    messageId: EntityId<'msg'>;
    initialText: string;
    forcedMode?: 'branch';
}

function toEditFailureMessage(reason: string): string {
    if (reason === 'message_not_found') {
        return 'Could not find the selected message for editing.';
    }
    if (reason === 'message_not_editable') {
        return 'Only user text messages can be edited.';
    }
    if (reason === 'session_not_found') {
        return 'The selected session no longer exists.';
    }
    if (reason === 'run_not_found') {
        return 'The target run for this message was not found.';
    }
    if (reason === 'no_turns') {
        return 'No turns are available to edit in this session.';
    }
    if (reason === 'auto_start_required') {
        return 'Message edits currently require starting a replacement run.';
    }
    if (reason === 'run_start_rejected') {
        return 'The edited run could not be started.';
    }
    if (reason === 'thread_tab_mismatch') {
        return 'Edit is not allowed from this tab because the thread belongs to another mode.';
    }
    return `Edit failed: ${reason}`;
}

export function ConversationShell({ profileId, topLevelTab, modeKey, onTopLevelTabChange }: ConversationShellProps) {
    const [prompt, setPrompt] = useState('');
    const [runSubmitError, setRunSubmitError] = useState<string | undefined>(undefined);
    const [tabSwitchNotice, setTabSwitchNotice] = useState<string | undefined>(undefined);
    const [pendingMessageEdit, setPendingMessageEdit] = useState<PendingMessageEdit | undefined>(undefined);
    const [sessionTargetBySessionId, setSessionTargetBySessionId] = useState<
        Record<string, { providerId?: RuntimeProviderId; modelId?: string }>
    >({});
    const uiState = useConversationUiState(profileId);

    const runtimeSnapshot = useRuntimeSnapshot(profileId);
    const queries = useConversationShellQueries({
        profileId,
        uiState,
        selectedSessionId: uiState.selectedSessionId,
        topLevelTab,
    });
    const mutations = useConversationShellMutations();

    useEffect(() => {
        setPrompt('');
        setRunSubmitError(undefined);
        setTabSwitchNotice(undefined);
        setSessionTargetBySessionId({});
    }, [profileId]);

    useEffect(() => {
        if (uiState.sort || !queries.listThreadsQuery.data?.sort) {
            return;
        }

        uiState.setSort(queries.listThreadsQuery.data.sort);
    }, [queries.listThreadsQuery.data?.sort, uiState]);

    useEffect(() => {
        if (queries.listThreadsQuery.data?.showAllModes === undefined) {
            return;
        }
        if (uiState.showAllModes === queries.listThreadsQuery.data.showAllModes) {
            return;
        }
        uiState.setShowAllModes(queries.listThreadsQuery.data.showAllModes);
    }, [queries.listThreadsQuery.data?.showAllModes, uiState]);

    useEffect(() => {
        const nextGroupView = queries.listThreadsQuery.data?.groupView;
        if (!nextGroupView) {
            return;
        }
        if (uiState.groupView === nextGroupView) {
            return;
        }
        uiState.setGroupView(nextGroupView);
    }, [queries.listThreadsQuery.data?.groupView, uiState]);

    useEffect(() => {
        const selectedTagId = uiState.selectedTagId;
        if (!selectedTagId) {
            return;
        }

        const tagExists = (queries.listTagsQuery.data?.tags ?? []).some((tag) => tag.id === selectedTagId);
        if (!tagExists) {
            uiState.setSelectedTagId(undefined);
        }
    }, [queries.listTagsQuery.data?.tags, uiState]);

    useEffect(() => {
        const workspaceFilter = uiState.workspaceFilter;
        if (!workspaceFilter) {
            return;
        }

        const workspaceExists = (queries.listBucketsQuery.data?.buckets ?? [])
            .filter((bucket) => bucket.scope === 'workspace')
            .some((bucket) => bucket.workspaceFingerprint === workspaceFilter);
        if (!workspaceExists) {
            uiState.setWorkspaceFilter(undefined);
        }
    }, [queries.listBucketsQuery.data?.buckets, uiState]);

    const streamState = useRuntimeEventStreamStore((state) => state.connectionState);

    const sidebarState = useThreadSidebarState({
        threads: queries.listThreadsQuery.data?.threads ?? [],
        threadTags: runtimeSnapshot.data?.threadTags ?? [],
        selectedTagId: uiState.selectedTagId,
        selectedThreadId: uiState.selectedThreadId,
        onSelectedThreadInvalid: () => {
            uiState.setSelectedThreadId(undefined);
        },
        onSelectFallbackThread: (threadId) => {
            uiState.setSelectedThreadId(threadId);
        },
    });

    const selectedThread = uiState.selectedThreadId
        ? sidebarState.visibleThreads.find((thread) => thread.id === uiState.selectedThreadId)
        : undefined;

    const sessionRunSelection = useSessionRunSelection({
        allSessions: runtimeSnapshot.data?.sessions ?? [],
        allRuns: runtimeSnapshot.data?.runs ?? [],
        allMessages: runtimeSnapshot.data?.messages ?? [],
        allMessageParts: runtimeSnapshot.data?.messageParts ?? [],
        selectedThreadId: uiState.selectedThreadId,
        selectedSessionId: uiState.selectedSessionId,
        selectedRunId: uiState.selectedRunId,
        onSelectedSessionInvalid: () => {
            uiState.setSelectedSessionId(undefined);
        },
        onSelectFallbackSession: (sessionId) => {
            uiState.setSelectedSessionId(sessionId);
        },
        onSelectedRunInvalid: () => {
            uiState.setSelectedRunId(undefined);
        },
        onSelectFallbackRun: (runId) => {
            uiState.setSelectedRunId(runId);
        },
    });

    const selectedThreadId = uiState.selectedThreadId;
    const selectedSessionId = uiState.selectedSessionId;
    const selectedRunId = uiState.selectedRunId;
    const selectedTagId = uiState.selectedTagId;
    const workspaceFilter = uiState.workspaceFilter;
    const sessionOverride = selectedSessionId ? sessionTargetBySessionId[selectedSessionId] : undefined;
    const runTargetState = useConversationShellRunTarget({
        providers: runtimeSnapshot.data?.providers ?? [],
        providerModels: runtimeSnapshot.data?.providerModels ?? [],
        defaults: runtimeSnapshot.data?.defaults,
        runs: sessionRunSelection.runs,
        ...(sessionOverride ? { sessionOverride } : {}),
    });
    const isPlanningMode = modeKey === 'plan' && (topLevelTab === 'agent' || topLevelTab === 'orchestrator');
    const kiloRoutingPreferenceQuery = trpc.provider.getModelRoutingPreference.useQuery(
        {
            profileId,
            providerId: 'kilo',
            modelId: runTargetState.selectedModelIdForComposer ?? '',
        },
        {
            enabled:
                runTargetState.selectedProviderIdForComposer === 'kilo' &&
                Boolean(runTargetState.selectedModelIdForComposer),
            refetchOnWindowFocus: false,
        }
    );
    const editPreferenceQuery = trpc.conversation.getEditPreference.useQuery(
        {
            profileId,
        },
        {
            refetchOnWindowFocus: false,
        }
    );
    const editPreference: 'ask' | 'truncate' | 'branch' =
        editPreferenceQuery.data?.value === 'truncate' || editPreferenceQuery.data?.value === 'branch'
            ? editPreferenceQuery.data.value
            : 'ask';
    const routingBadge =
        runTargetState.selectedProviderIdForComposer !== 'kilo'
            ? undefined
            : kiloRoutingPreferenceQuery.data?.preference.routingMode === 'pinned'
              ? `Routing: Pinned (${kiloRoutingPreferenceQuery.data.preference.pinnedProviderId ?? 'unknown'})`
              : `Routing: Dynamic (${
                    kiloRoutingPreferenceQuery.data?.preference.sort === 'price'
                        ? 'Lowest Price'
                        : kiloRoutingPreferenceQuery.data?.preference.sort === 'throughput'
                          ? 'Highest Throughput'
                          : kiloRoutingPreferenceQuery.data?.preference.sort === 'latency'
                            ? 'Lowest Latency'
                            : 'Default'
                })`;

    const planOrchestrator = buildConversationShellPlanOrchestrator({
        profileId,
        runtimeSnapshotRefetch: runtimeSnapshot.refetch,
        activePlanRefetch: queries.activePlanQuery.refetch,
        orchestratorLatestRefetch: queries.orchestratorLatestQuery.refetch,
        onError: setRunSubmitError,
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        workspaceFingerprint: selectedThread?.workspaceFingerprint,
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

    return (
        <main className='bg-background flex min-h-0 flex-1 overflow-hidden'>
            <ConversationSidebar
                buckets={queries.listBucketsQuery.data?.buckets ?? []}
                threads={sidebarState.visibleThreads}
                tags={queries.listTagsQuery.data?.tags ?? []}
                threadTagIdsByThread={sidebarState.threadTagIdsByThread}
                topLevelTab={topLevelTab}
                {...(selectedThreadId ? { selectedThreadId } : {})}
                {...(selectedTagId ? { selectedTagId } : {})}
                scopeFilter={uiState.scopeFilter}
                {...(workspaceFilter ? { workspaceFilter } : {})}
                sort={uiState.sort ?? 'latest'}
                showAllModes={uiState.showAllModes}
                groupView={uiState.groupView}
                isCreatingThread={mutations.createThreadMutation.isPending}
                isAddingTag={mutations.upsertTagMutation.isPending || mutations.setThreadTagsMutation.isPending}
                onSelectThread={(threadId) => {
                    const targetThread = sidebarState.visibleThreads.find((thread) => thread.id === threadId);
                    if (targetThread && targetThread.topLevelTab !== topLevelTab) {
                        onTopLevelTabChange(targetThread.topLevelTab);
                        setTabSwitchNotice(`Switched to ${targetThread.topLevelTab} to open this thread.`);
                        window.setTimeout(() => {
                            setTabSwitchNotice(undefined);
                        }, 2200);
                    } else {
                        setTabSwitchNotice(undefined);
                    }
                    uiState.setSelectedThreadId(threadId);
                }}
                onToggleTagFilter={(tagId) => {
                    uiState.setSelectedTagId((current) => (current === tagId ? undefined : tagId));
                }}
                onScopeFilterChange={(nextScope) => {
                    uiState.setScopeFilter(nextScope);
                    if (nextScope !== 'workspace') {
                        uiState.setWorkspaceFilter(undefined);
                    }
                }}
                onWorkspaceFilterChange={uiState.setWorkspaceFilter}
                onSortChange={(nextSort) => {
                    uiState.setSort(nextSort);
                }}
                onShowAllModesChange={(nextShowAllModes) => {
                    uiState.setShowAllModes(nextShowAllModes);
                }}
                onGroupViewChange={(nextGroupView) => {
                    uiState.setGroupView(nextGroupView);
                }}
                onCreateThread={async (input) => {
                    const result = await mutations.createThreadMutation.mutateAsync({
                        profileId,
                        topLevelTab,
                        ...input,
                    });
                    uiState.setSelectedThreadId(result.thread.id);
                    void queries.listBucketsQuery.refetch();
                    void queries.listThreadsQuery.refetch();
                    void runtimeSnapshot.refetch();
                }}
                onAddTagToThread={async (threadId, label) => {
                    if (!isEntityId(threadId, 'thr')) {
                        return;
                    }

                    const upserted = await mutations.upsertTagMutation.mutateAsync({
                        profileId,
                        label,
                    });
                    const existing = sidebarState.threadTagIdsByThread.get(threadId) ?? [];
                    const nextTagIds = [...new Set([...existing, upserted.tag.id])];
                    const validTagIds = nextTagIds.filter((tagId): tagId is EntityId<'tag'> =>
                        isEntityId(tagId, 'tag')
                    );
                    if (validTagIds.length !== nextTagIds.length) {
                        return;
                    }

                    await mutations.setThreadTagsMutation.mutateAsync({
                        profileId,
                        threadId,
                        tagIds: validTagIds,
                    });
                    void queries.listTagsQuery.refetch();
                    void runtimeSnapshot.refetch();
                }}
            />

            <section className='flex min-h-0 flex-1 flex-col'>
                <header className='border-border flex items-center justify-between border-b px-4 py-3'>
                    <div className='min-w-0'>
                        <p className='truncate text-sm font-semibold'>
                            {selectedThread?.title ?? 'No Thread Selected'}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Stream: {streamState} · Events: {runtimeSnapshot.data?.lastSequence ?? 0}
                        </p>
                        {tabSwitchNotice ? <p className='text-primary text-xs'>{tabSwitchNotice}</p> : null}
                    </div>
                </header>

                <SessionWorkspacePanel
                    sessions={sessionRunSelection.sessions}
                    runs={sessionRunSelection.runs}
                    messages={sessionRunSelection.messages}
                    partsByMessageId={sessionRunSelection.partsByMessageId}
                    {...(selectedSessionId ? { selectedSessionId } : {})}
                    {...(selectedRunId ? { selectedRunId } : {})}
                    prompt={prompt}
                    isCreatingSession={mutations.createSessionMutation.isPending}
                    isStartingRun={mutations.startRunMutation.isPending || mutations.planStartMutation.isPending}
                    canCreateSession={Boolean(selectedThreadId)}
                    selectedProviderId={runTargetState.selectedProviderIdForComposer}
                    selectedModelId={runTargetState.selectedModelIdForComposer}
                    {...(routingBadge !== undefined ? { routingBadge } : {})}
                    providerOptions={runTargetState.providerOptions}
                    modelOptions={runTargetState.modelOptions}
                    runErrorMessage={runSubmitError}
                    onSelectSession={(sessionId) => {
                        setRunSubmitError(undefined);
                        uiState.setSelectedSessionId(sessionId);
                    }}
                    onSelectRun={(runId) => {
                        uiState.setSelectedRunId(runId);
                    }}
                    onProviderChange={(providerId) => {
                        if (!selectedSessionId || !isProviderId(providerId)) {
                            return;
                        }

                        const firstModelId = runTargetState.modelsByProvider.get(providerId)?.at(0)?.id;
                        setSessionTargetBySessionId((current) => ({
                            ...current,
                            [selectedSessionId]: {
                                providerId,
                                ...(firstModelId ? { modelId: firstModelId } : {}),
                            },
                        }));
                        setRunSubmitError(undefined);
                    }}
                    onModelChange={(modelId) => {
                        const providerId = runTargetState.selectedProviderIdForComposer;
                        if (!selectedSessionId || !providerId || modelId.trim().length === 0) {
                            return;
                        }

                        setSessionTargetBySessionId((current) => ({
                            ...current,
                            [selectedSessionId]: {
                                providerId,
                                modelId,
                            },
                        }));
                        setRunSubmitError(undefined);
                    }}
                    onCreateSession={() => {
                        if (!isEntityId(selectedThreadId, 'thr')) {
                            return;
                        }

                        void mutations.createSessionMutation
                            .mutateAsync({
                                profileId,
                                threadId: selectedThreadId,
                                kind: 'local',
                            })
                            .then((result) => {
                                uiState.setSelectedSessionId(result.session.id);
                                setRunSubmitError(undefined);
                                void runtimeSnapshot.refetch();
                            });
                    }}
                    onPromptChange={(nextPrompt) => {
                        setRunSubmitError(undefined);
                        setPrompt(nextPrompt);
                    }}
                    onSubmitPrompt={() => {
                        void submitPromptFromComposer({
                            prompt,
                            isStartingRun: mutations.startRunMutation.isPending,
                            selectedSessionId,
                            isPlanningMode,
                            profileId,
                            topLevelTab,
                            modeKey,
                            workspaceFingerprint: selectedThread?.workspaceFingerprint,
                            resolvedRunTarget: runTargetState.resolvedRunTarget,
                            runtimeOptions: DEFAULT_RUN_OPTIONS,
                            providerById: runTargetState.providerById,
                            startPlan: mutations.planStartMutation.mutateAsync,
                            startRun: mutations.startRunMutation.mutateAsync,
                            onPromptCleared: () => {
                                setRunSubmitError(undefined);
                                setPrompt('');
                            },
                            onPlanRefetch: () => {
                                void queries.activePlanQuery.refetch();
                            },
                            onRuntimeRefetch: () => {
                                void runtimeSnapshot.refetch();
                            },
                            onError: (message) => {
                                setRunSubmitError(message);
                            },
                        });
                    }}
                    onEditMessage={(entry: MessageTimelineEntry) => {
                        if (!isEntityId(entry.id, 'msg')) {
                            return;
                        }
                        const editableText = entry.editableText?.trim();
                        if (!editableText) {
                            return;
                        }
                        setPendingMessageEdit({
                            messageId: entry.id,
                            initialText: editableText,
                        });
                    }}
                    onBranchFromMessage={(entry: MessageTimelineEntry) => {
                        if (!isEntityId(entry.id, 'msg')) {
                            return;
                        }
                        const editableText = entry.editableText?.trim();
                        if (!editableText) {
                            return;
                        }
                        setPendingMessageEdit({
                            messageId: entry.id,
                            initialText: editableText,
                            forcedMode: 'branch',
                        });
                    }}
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
                />
            </section>
            <MessageEditDialog
                open={Boolean(pendingMessageEdit)}
                initialText={pendingMessageEdit?.initialText ?? ''}
                preferredResolution={editPreference}
                {...(pendingMessageEdit?.forcedMode ? { forcedMode: pendingMessageEdit.forcedMode } : {})}
                busy={mutations.editSessionMutation.isPending || mutations.setEditPreferenceMutation.isPending}
                onCancel={() => {
                    setPendingMessageEdit(undefined);
                }}
                onSave={(input) => {
                    if (!pendingMessageEdit) {
                        return;
                    }
                    if (!isEntityId(selectedSessionId, 'sess')) {
                        setRunSubmitError('Select a session before editing a message.');
                        return;
                    }

                    setRunSubmitError(undefined);
                    void mutations.editSessionMutation
                        .mutateAsync({
                            profileId,
                            sessionId: selectedSessionId,
                            topLevelTab,
                            modeKey,
                            messageId: pendingMessageEdit.messageId,
                            replacementText: input.replacementText,
                            editMode: input.editMode,
                            autoStartRun: true,
                            runtimeOptions: DEFAULT_RUN_OPTIONS,
                            ...(runTargetState.resolvedRunTarget
                                ? { providerId: runTargetState.resolvedRunTarget.providerId }
                                : {}),
                            ...(runTargetState.resolvedRunTarget
                                ? { modelId: runTargetState.resolvedRunTarget.modelId }
                                : {}),
                            ...(selectedThread?.workspaceFingerprint
                                ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                                : {}),
                        })
                        .then(async (result) => {
                            if (!result.edited) {
                                setRunSubmitError(toEditFailureMessage(result.reason));
                                return;
                            }

                            if (input.rememberChoice && editPreference === 'ask') {
                                await mutations.setEditPreferenceMutation.mutateAsync({
                                    profileId,
                                    value: input.editMode,
                                });
                                void editPreferenceQuery.refetch();
                            }

                            if (result.threadId && isEntityId(result.threadId, 'thr')) {
                                uiState.setSelectedThreadId(result.threadId);
                            }
                            if (result.topLevelTab && result.topLevelTab !== topLevelTab) {
                                onTopLevelTabChange(result.topLevelTab);
                            }
                            uiState.setSelectedSessionId(result.sessionId);
                            if (result.runId) {
                                uiState.setSelectedRunId(result.runId);
                            } else {
                                uiState.setSelectedRunId(undefined);
                            }
                            setPendingMessageEdit(undefined);
                            setPrompt('');
                            void runtimeSnapshot.refetch();
                            void queries.listThreadsQuery.refetch();
                        })
                        .catch((error: unknown) => {
                            const message = error instanceof Error ? error.message : String(error);
                            setRunSubmitError(`Edit failed: ${message}`);
                        });
                }}
            />
        </main>
    );
}

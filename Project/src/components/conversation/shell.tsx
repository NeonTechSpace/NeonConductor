import { useEffect, useMemo, useState } from 'react';

import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import { useSessionRunSelection } from '@/web/components/conversation/hooks/useSessionRunSelection';
import { useThreadSidebarState } from '@/web/components/conversation/hooks/useThreadSidebarState';
import { SessionWorkspacePanel } from '@/web/components/conversation/sessionWorkspacePanel';
import { ConversationSidebar } from '@/web/components/conversation/sidebar';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { useRuntimeSnapshot } from '@/web/lib/runtime/useRuntimeSnapshot';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';
import type { EntityId, EntityIdPrefix, RuntimeProviderId, RuntimeRunOptions, TopLevelTab } from '@/app/backend/runtime/contracts';

const DEFAULT_RUN_OPTIONS: RuntimeRunOptions = {
    reasoning: {
        effort: 'medium',
        summary: 'auto',
        includeEncrypted: false,
    },
    cache: {
        strategy: 'auto',
    },
    transport: {
        openai: 'auto',
    },
};

interface RunTargetSelection {
    providerId: RuntimeProviderId;
    modelId: string;
}

function isEntityId<P extends EntityIdPrefix>(value: string | undefined, prefix: P): value is EntityId<P> {
    return typeof value === 'string' && value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

function isProviderId(value: string | undefined): value is RuntimeProviderId {
    return value === 'kilo' || value === 'openai';
}

function isProviderRunnable(authState: string, authMethod: string): boolean {
    if (authMethod === 'none') {
        return false;
    }

    if (authMethod === 'api_key') {
        return authState === 'configured' || authState === 'authenticated';
    }

    return authState === 'authenticated';
}

function modelExists(modelsByProvider: Map<RuntimeProviderId, ProviderModelRecord[]>, providerId: RuntimeProviderId, modelId: string): boolean {
    return (modelsByProvider.get(providerId) ?? []).some((model) => model.id === modelId);
}

function resolveLatestRunTarget(
    runs: RunRecord[],
    modelsByProvider: Map<RuntimeProviderId, ProviderModelRecord[]>
): RunTargetSelection | undefined {
    for (const run of runs) {
        if (!isProviderId(run.providerId) || typeof run.modelId !== 'string') {
            continue;
        }

        if (!modelExists(modelsByProvider, run.providerId, run.modelId)) {
            continue;
        }

        return {
            providerId: run.providerId,
            modelId: run.modelId,
        };
    }

    return undefined;
}

function toActionableRunError(message: string, providerLabel: string): string {
    const normalized = message.toLowerCase();
    if (
        normalized.includes('not authenticated') ||
        normalized.includes('auth state') ||
        normalized.includes('missing from secret store')
    ) {
        return `${providerLabel} is not authenticated. Open Settings > Providers and connect it before running.`;
    }

    if (normalized.includes('planning-only')) {
        return message;
    }

    return `Run failed: ${message}`;
}

interface ConversationShellProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
}

export function ConversationShell({ profileId, topLevelTab, modeKey }: ConversationShellProps) {
    const [prompt, setPrompt] = useState('');
    const [runSubmitError, setRunSubmitError] = useState<string | undefined>(undefined);
    const [sessionTargetBySessionId, setSessionTargetBySessionId] = useState<
        Record<string, { providerId?: RuntimeProviderId; modelId?: string }>
    >({});
    const uiState = useConversationUiState(profileId);

    const runtimeSnapshot = useRuntimeSnapshot(profileId);
    const listBucketsQuery = trpc.conversation.listBuckets.useQuery({ profileId }, { refetchOnWindowFocus: false });
    const listTagsQuery = trpc.conversation.listTags.useQuery({ profileId }, { refetchOnWindowFocus: false });
    const listThreadsQuery = trpc.conversation.listThreads.useQuery(
        {
            profileId,
            ...(uiState.scopeFilter !== 'all' ? { scope: uiState.scopeFilter } : {}),
            ...(uiState.workspaceFilter ? { workspaceFingerprint: uiState.workspaceFilter } : {}),
            ...(uiState.sort ? { sort: uiState.sort } : {}),
        },
        { refetchOnWindowFocus: false }
    );

    const createThreadMutation = trpc.conversation.createThread.useMutation();
    const upsertTagMutation = trpc.conversation.upsertTag.useMutation();
    const setThreadTagsMutation = trpc.conversation.setThreadTags.useMutation();
    const createSessionMutation = trpc.session.create.useMutation();
    const startRunMutation = trpc.session.startRun.useMutation();
    const planStartMutation = trpc.plan.start.useMutation();
    const planAnswerMutation = trpc.plan.answerQuestion.useMutation();
    const planReviseMutation = trpc.plan.revise.useMutation();
    const planApproveMutation = trpc.plan.approve.useMutation();
    const planImplementMutation = trpc.plan.implement.useMutation();
    const orchestratorAbortMutation = trpc.orchestrator.abort.useMutation();

    useEffect(() => {
        setPrompt('');
        setRunSubmitError(undefined);
        setSessionTargetBySessionId({});
    }, [profileId]);

    useEffect(() => {
        if (uiState.sort || !listThreadsQuery.data?.sort) {
            return;
        }

        uiState.setSort(listThreadsQuery.data.sort);
    }, [listThreadsQuery.data?.sort, uiState]);

    useEffect(() => {
        const selectedTagId = uiState.selectedTagId;
        if (!selectedTagId) {
            return;
        }

        const tagExists = (listTagsQuery.data?.tags ?? []).some((tag) => tag.id === selectedTagId);
        if (!tagExists) {
            uiState.setSelectedTagId(undefined);
        }
    }, [listTagsQuery.data?.tags, uiState]);

    useEffect(() => {
        const workspaceFilter = uiState.workspaceFilter;
        if (!workspaceFilter) {
            return;
        }

        const workspaceExists = (listBucketsQuery.data?.buckets ?? [])
            .filter((bucket) => bucket.scope === 'workspace')
            .some((bucket) => bucket.workspaceFingerprint === workspaceFilter);
        if (!workspaceExists) {
            uiState.setWorkspaceFilter(undefined);
        }
    }, [listBucketsQuery.data?.buckets, uiState]);

    const lastSequence = useRuntimeEventStreamStore((state) => state.lastSequence);
    const streamState = useRuntimeEventStreamStore((state) => state.connectionState);

    useEffect(() => {
        if (lastSequence <= 0) {
            return;
        }

        const timer = window.setTimeout(() => {
            void listBucketsQuery.refetch();
            void listTagsQuery.refetch();
            void listThreadsQuery.refetch();
        }, 120);

        return () => {
            window.clearTimeout(timer);
        };
    }, [lastSequence, listBucketsQuery, listTagsQuery, listThreadsQuery]);

    const sidebarState = useThreadSidebarState({
        threads: listThreadsQuery.data?.threads ?? [],
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

    const providers = runtimeSnapshot.data?.providers ?? [];
    const providerModels = runtimeSnapshot.data?.providerModels ?? [];

    const providerById = useMemo(() => {
        return new Map(providers.map((provider) => [provider.id, provider]));
    }, [providers]);

    const modelsByProvider = useMemo(() => {
        const map = new Map<RuntimeProviderId, ProviderModelRecord[]>();
        for (const model of providerModels) {
            const existing = map.get(model.providerId) ?? [];
            existing.push(model);
            map.set(model.providerId, existing);
        }

        return map;
    }, [providerModels]);

    const selectedThreadId = uiState.selectedThreadId;
    const selectedSessionId = uiState.selectedSessionId;
    const selectedRunId = uiState.selectedRunId;
    const selectedTagId = uiState.selectedTagId;
    const workspaceFilter = uiState.workspaceFilter;
    const fallbackSessionId = 'sess_missing';
    const selectedSessionIdForQueries = isEntityId(selectedSessionId, 'sess') ? selectedSessionId : fallbackSessionId;
    const isPlanningMode = modeKey === 'plan' && (topLevelTab === 'agent' || topLevelTab === 'orchestrator');

    const activePlanQuery = trpc.plan.getActive.useQuery(
        {
            profileId,
            sessionId: selectedSessionIdForQueries,
            topLevelTab,
        },
        {
            enabled: Boolean(selectedSessionId) && (topLevelTab === 'agent' || topLevelTab === 'orchestrator'),
            refetchOnWindowFocus: false,
        }
    );

    const orchestratorLatestQuery = trpc.orchestrator.latestBySession.useQuery(
        {
            profileId,
            sessionId: selectedSessionIdForQueries,
        },
        {
            enabled: Boolean(selectedSessionId) && topLevelTab === 'orchestrator',
            refetchOnWindowFocus: false,
        }
    );

    const sessionOverride = selectedSessionId ? sessionTargetBySessionId[selectedSessionId] : undefined;

    const resolvedRunTarget = useMemo<RunTargetSelection | undefined>(() => {
        if (sessionOverride?.providerId && sessionOverride.modelId) {
            if (modelExists(modelsByProvider, sessionOverride.providerId, sessionOverride.modelId)) {
                return {
                    providerId: sessionOverride.providerId,
                    modelId: sessionOverride.modelId,
                };
            }
        }

        const fromLatestRun = resolveLatestRunTarget(sessionRunSelection.runs, modelsByProvider);
        if (fromLatestRun) {
            return fromLatestRun;
        }

        const defaults = runtimeSnapshot.data?.defaults;
        if (defaults && isProviderId(defaults.providerId) && modelExists(modelsByProvider, defaults.providerId, defaults.modelId)) {
            return {
                providerId: defaults.providerId,
                modelId: defaults.modelId,
            };
        }

        for (const provider of providers) {
            const models = modelsByProvider.get(provider.id) ?? [];
            if (models.length === 0) {
                continue;
            }

            if (isProviderRunnable(provider.authState, provider.authMethod)) {
                const firstModel = models[0];
                if (!firstModel) {
                    continue;
                }
                return {
                    providerId: provider.id,
                    modelId: firstModel.id,
                };
            }
        }

        for (const provider of providers) {
            const models = modelsByProvider.get(provider.id) ?? [];
            if (models.length === 0) {
                continue;
            }

            const firstModel = models[0];
            if (!firstModel) {
                continue;
            }
            return {
                providerId: provider.id,
                modelId: firstModel.id,
            };
        }

        return undefined;
    }, [modelsByProvider, providers, runtimeSnapshot.data?.defaults, sessionOverride, sessionRunSelection.runs]);

    const selectedProviderIdForComposer = sessionOverride?.providerId ?? resolvedRunTarget?.providerId;
    const selectedModelIdForComposer = sessionOverride?.modelId ?? resolvedRunTarget?.modelId;

    const providerOptions = useMemo(() => {
        return providers
            .filter((provider) => (modelsByProvider.get(provider.id) ?? []).length > 0)
            .map((provider) => ({
                id: provider.id,
                label: provider.label,
                authState: provider.authState,
            }));
    }, [modelsByProvider, providers]);

    const modelOptions = useMemo(() => {
        if (!selectedProviderIdForComposer) {
            return [];
        }

        return (modelsByProvider.get(selectedProviderIdForComposer) ?? []).map((model) => ({
            id: model.id,
            label: model.label,
            ...(model.price !== undefined ? { price: model.price } : {}),
            ...(model.latency !== undefined ? { latency: model.latency } : {}),
            ...(model.tps !== undefined ? { tps: model.tps } : {}),
        }));
    }, [modelsByProvider, selectedProviderIdForComposer]);

    return (
        <main className='bg-background flex min-h-0 flex-1 overflow-hidden'>
            <ConversationSidebar
                buckets={listBucketsQuery.data?.buckets ?? []}
                threads={sidebarState.visibleThreads}
                tags={listTagsQuery.data?.tags ?? []}
                threadTagIdsByThread={sidebarState.threadTagIdsByThread}
                {...(selectedThreadId ? { selectedThreadId } : {})}
                {...(selectedTagId ? { selectedTagId } : {})}
                scopeFilter={uiState.scopeFilter}
                {...(workspaceFilter ? { workspaceFilter } : {})}
                sort={uiState.sort ?? 'latest'}
                isCreatingThread={createThreadMutation.isPending}
                isAddingTag={upsertTagMutation.isPending || setThreadTagsMutation.isPending}
                onSelectThread={(threadId) => {
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
                onCreateThread={async (input) => {
                    const result = await createThreadMutation.mutateAsync({
                        profileId,
                        ...input,
                    });
                    uiState.setSelectedThreadId(result.thread.id);
                    void listBucketsQuery.refetch();
                    void listThreadsQuery.refetch();
                    void runtimeSnapshot.refetch();
                }}
                onAddTagToThread={async (threadId, label) => {
                    if (!isEntityId(threadId, 'thr')) {
                        return;
                    }

                    const upserted = await upsertTagMutation.mutateAsync({
                        profileId,
                        label,
                    });
                    const existing = sidebarState.threadTagIdsByThread.get(threadId) ?? [];
                    const nextTagIds = [...new Set([...existing, upserted.tag.id])];
                    const validTagIds = nextTagIds.filter((tagId): tagId is EntityId<'tag'> => isEntityId(tagId, 'tag'));
                    if (validTagIds.length !== nextTagIds.length) {
                        return;
                    }

                    await setThreadTagsMutation.mutateAsync({
                        profileId,
                        threadId,
                        tagIds: validTagIds,
                    });
                    void listTagsQuery.refetch();
                    void runtimeSnapshot.refetch();
                }}
            />

            <section className='flex min-h-0 flex-1 flex-col'>
                <header className='border-border flex items-center justify-between border-b px-4 py-3'>
                    <div className='min-w-0'>
                        <p className='truncate text-sm font-semibold'>{selectedThread?.title ?? 'No Thread Selected'}</p>
                        <p className='text-muted-foreground text-xs'>
                            Stream: {streamState} · Events: {runtimeSnapshot.data?.lastSequence ?? 0}
                        </p>
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
                    isCreatingSession={createSessionMutation.isPending}
                    isStartingRun={startRunMutation.isPending || planStartMutation.isPending}
                    canCreateSession={Boolean(selectedThreadId)}
                    selectedProviderId={selectedProviderIdForComposer}
                    selectedModelId={selectedModelIdForComposer}
                    providerOptions={providerOptions}
                    modelOptions={modelOptions}
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

                        const firstModelId = modelsByProvider.get(providerId)?.at(0)?.id;
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
                        if (!selectedSessionId || !selectedProviderIdForComposer || modelId.trim().length === 0) {
                            return;
                        }

                        setSessionTargetBySessionId((current) => ({
                            ...current,
                            [selectedSessionId]: {
                                providerId: selectedProviderIdForComposer,
                                modelId,
                            },
                        }));
                        setRunSubmitError(undefined);
                    }}
                    onCreateSession={() => {
                        if (!isEntityId(selectedThreadId, 'thr')) {
                            return;
                        }

                        void createSessionMutation
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
                        if (prompt.trim().length === 0 || startRunMutation.isPending) {
                            return;
                        }

                        if (!isEntityId(selectedSessionId, 'sess')) {
                            return;
                        }

                        if (isPlanningMode) {
                            void planStartMutation
                                .mutateAsync({
                                    profileId,
                                    sessionId: selectedSessionId,
                                    topLevelTab,
                                    modeKey,
                                    prompt: prompt.trim(),
                                    ...(selectedThread?.workspaceFingerprint
                                        ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                                        : {}),
                                })
                                .then(() => {
                                    setPrompt('');
                                    setRunSubmitError(undefined);
                                    void activePlanQuery.refetch();
                                })
                                .catch((error: unknown) => {
                                    const message = error instanceof Error ? error.message : String(error);
                                    setRunSubmitError(`Plan start failed: ${message}`);
                                });
                            return;
                        }

                        if (!resolvedRunTarget) {
                            setRunSubmitError('No runnable provider/model found. Open Settings > Providers to configure one.');
                            return;
                        }

                        const selectedProvider = providerById.get(resolvedRunTarget.providerId);
                        if (
                            selectedProvider &&
                            !isProviderRunnable(selectedProvider.authState, selectedProvider.authMethod)
                        ) {
                            setRunSubmitError(
                                `${selectedProvider.label} is not authenticated. Open Settings > Providers to connect it before running.`
                            );
                            return;
                        }

                        void startRunMutation
                            .mutateAsync({
                                profileId,
                                sessionId: selectedSessionId,
                                prompt: prompt.trim(),
                                topLevelTab,
                                modeKey,
                                providerId: resolvedRunTarget.providerId,
                                modelId: resolvedRunTarget.modelId,
                                ...(selectedThread?.workspaceFingerprint
                                    ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                                    : {}),
                                runtimeOptions: DEFAULT_RUN_OPTIONS,
                            })
                            .then(() => {
                                setRunSubmitError(undefined);
                                setPrompt('');
                                void runtimeSnapshot.refetch();
                            })
                            .catch((error: unknown) => {
                                const message = error instanceof Error ? error.message : String(error);
                                const providerLabel = selectedProvider?.label ?? resolvedRunTarget.providerId;
                                setRunSubmitError(toActionableRunError(message, providerLabel));
                            });
                    }}
                    modePanel={
                        <ModeExecutionPanel
                            topLevelTab={topLevelTab}
                            modeKey={modeKey}
                            isLoadingPlan={activePlanQuery.isLoading}
                            isPlanMutating={
                                planStartMutation.isPending ||
                                planAnswerMutation.isPending ||
                                planReviseMutation.isPending ||
                                planApproveMutation.isPending ||
                                planImplementMutation.isPending
                            }
                            isOrchestratorMutating={orchestratorAbortMutation.isPending}
                            onAnswerQuestion={(planId, questionId, answer) => {
                                void planAnswerMutation
                                    .mutateAsync({
                                        profileId,
                                        planId,
                                        questionId,
                                        answer,
                                    })
                                    .then(() => {
                                        void activePlanQuery.refetch();
                                    });
                            }}
                            onRevisePlan={(planId, summaryMarkdown, items) => {
                                void planReviseMutation
                                    .mutateAsync({
                                        profileId,
                                        planId,
                                        summaryMarkdown,
                                        items: items.map((description) => ({ description })),
                                    })
                                    .then(() => {
                                        void activePlanQuery.refetch();
                                    });
                            }}
                            onApprovePlan={(planId) => {
                                void planApproveMutation
                                    .mutateAsync({
                                        profileId,
                                        planId,
                                    })
                                    .then(() => {
                                        void activePlanQuery.refetch();
                                    })
                                    .catch((error: unknown) => {
                                        const message = error instanceof Error ? error.message : String(error);
                                        setRunSubmitError(`Plan approval failed: ${message}`);
                                    });
                            }}
                            onImplementPlan={(planId) => {
                                void planImplementMutation
                                    .mutateAsync({
                                        profileId,
                                        planId,
                                        runtimeOptions: DEFAULT_RUN_OPTIONS,
                                        ...(resolvedRunTarget ? { providerId: resolvedRunTarget.providerId } : {}),
                                        ...(resolvedRunTarget ? { modelId: resolvedRunTarget.modelId } : {}),
                                        ...(selectedThread?.workspaceFingerprint
                                            ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                                            : {}),
                                    })
                                    .then(() => {
                                        void activePlanQuery.refetch();
                                        void orchestratorLatestQuery.refetch();
                                        void runtimeSnapshot.refetch();
                                    })
                                    .catch((error: unknown) => {
                                        const message = error instanceof Error ? error.message : String(error);
                                        setRunSubmitError(`Plan implementation failed: ${message}`);
                                    });
                            }}
                            onAbortOrchestrator={(orchestratorRunId) => {
                                void orchestratorAbortMutation
                                    .mutateAsync({
                                        profileId,
                                        orchestratorRunId,
                                    })
                                    .then(() => {
                                        void orchestratorLatestQuery.refetch();
                                    });
                            }}
                            {...(activePlanQuery.data?.found ? { activePlan: activePlanQuery.data.plan } : {})}
                            {...(orchestratorLatestQuery.data?.found
                                ? { orchestratorView: orchestratorLatestQuery.data }
                                : {})}
                        />
                    }
                />
            </section>
        </main>
    );
}

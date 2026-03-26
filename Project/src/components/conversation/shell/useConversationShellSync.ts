import { skipToken } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef } from 'react';

import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import type { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import { buildConversationUiSyncPatch } from '@/web/components/conversation/shell/queries/useConversationSync';
import type { useConversationShellSelectionState } from '@/web/components/conversation/shell/useConversationShellSelectionState';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import type { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';
import type { ConversationShellBootChromeReadiness } from '@/web/components/runtime/bootReadiness';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';


interface UseConversationShellSyncInput {
    profileId: string;
    modeKey: string;
    topLevelTab: TopLevelTab;
    selectedRunId: string | undefined;
    selectedSessionId: string | undefined;
    hasSelectedSession: boolean;
    streamState: string;
    contextStateQueryEnabled: boolean;
    contextStateQueryInput:
        | Parameters<ReturnType<typeof trpc.useUtils>['context']['getResolvedState']['fetch']>[0]
        | typeof skipToken;
    uiState: ConversationUiState;
    queries: ReturnType<typeof useConversationQueries>;
    selectionState: ReturnType<typeof useConversationShellSelectionState>;
    runTargetState: ReturnType<typeof useConversationRunTarget>;
    utils: ReturnType<typeof trpc.useUtils>;
    onSelectedWorkspaceFingerprintChange: ((workspaceFingerprint: string | undefined) => void) | undefined;
    onBootChromeReadyChange: ((readiness: ConversationShellBootChromeReadiness) => void) | undefined;
}

export function useConversationShellSync(input: UseConversationShellSyncInput): void {
    const lastContextRefreshSignatureRef = useRef<string | undefined>(undefined);
    const selectedSessionId = isEntityId(input.selectedSessionId, 'sess') ? input.selectedSessionId : undefined;

    const reconcileConversationSelection = useEffectEvent(() => {
        const patch = input.selectionState.selectionSyncPatch;
        if (!patch) {
            return;
        }

        if ('selectedThreadId' in patch) {
            input.uiState.setSelectedThreadId(patch.selectedThreadId);
        }
        if ('selectedSessionId' in patch) {
            input.uiState.setSelectedSessionId(patch.selectedSessionId);
        }
        if ('selectedRunId' in patch) {
            input.uiState.setSelectedRunId(patch.selectedRunId);
        }
    });

    const reconcileConversationUiState = useEffectEvent(() => {
        const patch = buildConversationUiSyncPatch({
            uiState: input.uiState,
            threads: input.queries.listThreadsQuery.data,
            tags: input.queries.listTagsQuery.data?.tags,
            buckets: input.queries.listBucketsQuery.data?.buckets,
        });
        if (!patch) {
            return;
        }

        if (patch.sort !== undefined) {
            input.uiState.setSort(patch.sort);
        }
        if (patch.showAllModes !== undefined) {
            input.uiState.setShowAllModes(patch.showAllModes);
        }
        if (patch.groupView !== undefined) {
            input.uiState.setGroupView(patch.groupView);
        }
        if (patch.selectedTagIds !== undefined) {
            input.uiState.setSelectedTagIds(patch.selectedTagIds);
        }
        if (patch.workspaceFilter === undefined && input.uiState.workspaceFilter) {
            input.uiState.setWorkspaceFilter(undefined);
        }
    });

    useEffect(() => {
        reconcileConversationSelection();
    }, [reconcileConversationSelection, input.selectionState.selectionSyncPatch]);

    useEffect(() => {
        reconcileConversationUiState();
    }, [
        input.queries.listBucketsQuery.data?.buckets,
        input.queries.listTagsQuery.data?.tags,
        input.queries.listThreadsQuery.data,
        reconcileConversationUiState,
        input.uiState.groupView,
        input.uiState.selectedTagIds,
        input.uiState.showAllModes,
        input.uiState.sort,
        input.uiState.workspaceFilter,
    ]);

    useEffect(() => {
        input.onSelectedWorkspaceFingerprintChange?.(input.selectionState.selectedThread?.workspaceFingerprint);
    }, [input.onSelectedWorkspaceFingerprintChange, input.selectionState.selectedThread?.workspaceFingerprint]);

    useEffect(() => {
        if (!input.selectionState.selectedThread?.id) {
            return;
        }

        const nextSession = (input.queries.sessionsQuery.data?.sessions ?? [])
            .filter((session) => session.threadId === input.selectionState.selectedThread?.id)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .at(0);
        if (!nextSession) {
            return;
        }

        void input.utils.session.listRuns.prefetch({
            profileId: input.profileId,
            sessionId: nextSession.id,
        });
    }, [
        input.profileId,
        input.queries.sessionsQuery.data?.sessions,
        input.selectionState.selectedThread?.id,
        input.utils.session.listRuns,
    ]);

    useEffect(() => {
        if (!selectedSessionId) {
            return;
        }

        void input.utils.session.listRuns.prefetch({
            profileId: input.profileId,
            sessionId: selectedSessionId,
        });

        void input.utils.session.listMessages.prefetch({
            profileId: input.profileId,
            sessionId: selectedSessionId,
        });

        const preferredRunId = isEntityId(input.selectedRunId, 'run')
            ? input.selectedRunId
            : input.selectionState.sessionRunSelection.runs.at(0)?.id;
        if (preferredRunId) {
            void input.utils.diff.listByRun.prefetch({
                profileId: input.profileId,
                runId: preferredRunId,
            });
        }

        if (input.topLevelTab !== 'chat') {
            void input.utils.checkpoint.list.prefetch({
                profileId: input.profileId,
                sessionId: selectedSessionId,
            });
        }
    }, [
        input.profileId,
        selectedSessionId,
        input.selectionState.sessionRunSelection.runs,
        input.topLevelTab,
        input.selectedRunId,
        input.utils.checkpoint.list,
        input.utils.diff.listByRun,
        input.utils.session.listMessages,
        input.utils.session.listRuns,
    ]);

    useEffect(() => {
        if (input.topLevelTab === 'chat' || !input.selectionState.selectedThread?.workspaceFingerprint) {
            return;
        }

        void input.utils.sandbox.list.prefetch({
            profileId: input.profileId,
            workspaceFingerprint: input.selectionState.selectedThread.workspaceFingerprint,
        });
    }, [
        input.profileId,
        input.selectionState.selectedThread?.workspaceFingerprint,
        input.topLevelTab,
        input.utils.sandbox.list,
    ]);

    const refetchSelectedConversationState = useEffectEvent(() => {
        if (!selectedSessionId) {
            return;
        }

        const activeRunId = isEntityId(input.selectedRunId, 'run')
            ? input.selectedRunId
            : input.selectionState.sessionRunSelection.runs.at(0)?.id;

        void input.utils.session.status.fetch({
            profileId: input.profileId,
            sessionId: selectedSessionId,
        });
        void input.utils.session.listRuns.fetch({
            profileId: input.profileId,
            sessionId: selectedSessionId,
        });
        void input.utils.session.listMessages.fetch({
            profileId: input.profileId,
            sessionId: selectedSessionId,
        });
        if (input.contextStateQueryInput !== skipToken) {
            void input.utils.context.getResolvedState.fetch(input.contextStateQueryInput);
        }

        if (activeRunId) {
            void input.utils.diff.listByRun.fetch({
                profileId: input.profileId,
                runId: activeRunId,
            });
        }
    });

    const runContextRefreshSignature = [
        input.selectedSessionId,
        input.selectedRunId,
        input.runTargetState.selectedProviderIdForComposer ?? 'openai',
        input.runTargetState.selectedModelIdForComposer ?? 'openai/gpt-5',
        input.topLevelTab,
        input.modeKey,
        input.queries.runsQuery.data?.runs.length ?? 0,
        input.queries.runsQuery.data?.runs.reduce(
            (latestTimestamp, run) => (run.updatedAt > latestTimestamp ? run.updatedAt : latestTimestamp),
            ''
        ),
        input.queries.messagesQuery.data?.messages.length ?? 0,
        input.queries.messagesQuery.data?.messages.reduce(
            (latestTimestamp, message) => (message.updatedAt > latestTimestamp ? message.updatedAt : latestTimestamp),
            ''
        ),
    ].join('|');

    useEffect(() => {
        if (!input.hasSelectedSession || !input.contextStateQueryEnabled) {
            lastContextRefreshSignatureRef.current = undefined;
            return;
        }

        if (lastContextRefreshSignatureRef.current === undefined) {
            lastContextRefreshSignatureRef.current = runContextRefreshSignature;
            return;
        }

        if (lastContextRefreshSignatureRef.current === runContextRefreshSignature) {
            return;
        }

        lastContextRefreshSignatureRef.current = runContextRefreshSignature;
        if (input.contextStateQueryInput !== skipToken) {
            void input.utils.context.getResolvedState.fetch(input.contextStateQueryInput);
        }
    }, [
        input.contextStateQueryEnabled,
        input.contextStateQueryInput,
        input.hasSelectedSession,
        runContextRefreshSignature,
        input.utils.context.getResolvedState,
    ]);

    useEffect(() => {
        if (input.streamState !== 'error' || !input.hasSelectedSession) {
            return;
        }

        refetchSelectedConversationState();
        const intervalHandle = window.setInterval(() => {
            refetchSelectedConversationState();
        }, 1500);

        return () => {
            window.clearInterval(intervalHandle);
        };
    }, [input.hasSelectedSession, refetchSelectedConversationState, input.streamState]);

    useEffect(() => {
        input.onBootChromeReadyChange?.({
            shellBootstrapSettled: !input.queries.shellBootstrapQuery.isPending,
            ...(input.queries.shellBootstrapQuery.error?.message
                ? { shellBootstrapErrorMessage: input.queries.shellBootstrapQuery.error.message }
                : {}),
        });

        return () => {
            input.onBootChromeReadyChange?.({
                shellBootstrapSettled: false,
            });
        };
    }, [
        input.onBootChromeReadyChange,
        input.queries.shellBootstrapQuery.error?.message,
        input.queries.shellBootstrapQuery.isPending,
    ]);
}

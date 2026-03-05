import { useEffect } from 'react';

import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { isEntityId } from '@/web/components/conversation/shellHelpers';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/app/backend/runtime/contracts';

interface UseConversationShellQueriesInput {
    profileId: string;
    uiState: ConversationUiState;
    selectedSessionId: string | undefined;
    topLevelTab: TopLevelTab;
}

export function useConversationShellQueries(input: UseConversationShellQueriesInput) {
    const listBucketsQuery = trpc.conversation.listBuckets.useQuery(
        { profileId: input.profileId },
        { refetchOnWindowFocus: false }
    );
    const listTagsQuery = trpc.conversation.listTags.useQuery(
        { profileId: input.profileId },
        { refetchOnWindowFocus: false }
    );
    const listThreadsQuery = trpc.conversation.listThreads.useQuery(
        {
            profileId: input.profileId,
            activeTab: input.topLevelTab,
            showAllModes: input.uiState.showAllModes,
            groupView: input.uiState.groupView,
            ...(input.uiState.scopeFilter !== 'all' ? { scope: input.uiState.scopeFilter } : {}),
            ...(input.uiState.workspaceFilter ? { workspaceFingerprint: input.uiState.workspaceFilter } : {}),
            ...(input.uiState.sort ? { sort: input.uiState.sort } : {}),
        },
        { refetchOnWindowFocus: false }
    );

    const fallbackSessionId = 'sess_missing';
    const selectedSessionIdForQueries = isEntityId(input.selectedSessionId, 'sess')
        ? input.selectedSessionId
        : fallbackSessionId;

    const activePlanQuery = trpc.plan.getActive.useQuery(
        {
            profileId: input.profileId,
            sessionId: selectedSessionIdForQueries,
            topLevelTab: input.topLevelTab,
        },
        {
            enabled:
                Boolean(input.selectedSessionId) &&
                (input.topLevelTab === 'agent' || input.topLevelTab === 'orchestrator'),
            refetchOnWindowFocus: false,
        }
    );

    const orchestratorLatestQuery = trpc.orchestrator.latestBySession.useQuery(
        {
            profileId: input.profileId,
            sessionId: selectedSessionIdForQueries,
        },
        {
            enabled: Boolean(input.selectedSessionId) && input.topLevelTab === 'orchestrator',
            refetchOnWindowFocus: false,
        }
    );

    const lastSequence = useRuntimeEventStreamStore((state) => state.lastSequence);
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

    return {
        listBucketsQuery,
        listTagsQuery,
        listThreadsQuery,
        activePlanQuery,
        orchestratorLatestQuery,
    };
}

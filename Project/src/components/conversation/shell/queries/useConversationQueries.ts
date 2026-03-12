import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { BOOT_CRITICAL_QUERY_OPTIONS } from '@/web/components/runtime/startupQueryOptions';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';

interface UseConversationQueriesInput {
    profileId: string;
    uiState: ConversationUiState;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    topLevelTab: TopLevelTab;
}

export function useConversationQueries(input: UseConversationQueriesInput) {
    const listThreadsInput = {
        profileId: input.profileId,
        activeTab: input.topLevelTab,
        showAllModes: input.uiState.showAllModes,
        groupView: input.uiState.groupView,
        ...(input.uiState.scopeFilter !== 'all' ? { scope: input.uiState.scopeFilter } : {}),
        ...(input.uiState.workspaceFilter ? { workspaceFingerprint: input.uiState.workspaceFilter } : {}),
        ...(input.uiState.sort ? { sort: input.uiState.sort } : {}),
    };
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery(
        { profileId: input.profileId },
        BOOT_CRITICAL_QUERY_OPTIONS
    );
    const listBucketsQuery = trpc.conversation.listBuckets.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const listTagsQuery = trpc.conversation.listTags.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const listThreadsQuery = trpc.conversation.listThreads.useQuery(listThreadsInput, PROGRESSIVE_QUERY_OPTIONS);

    const fallbackSessionId = 'sess_missing';
    const selectedSessionIdForQueries = isEntityId(input.selectedSessionId, 'sess')
        ? input.selectedSessionId
        : fallbackSessionId;
    const selectedRunIdForQueries = isEntityId(input.selectedRunId, 'run') ? input.selectedRunId : undefined;
    const fallbackRunId = 'run_missing' as const;
    const sessionsInput = { profileId: input.profileId };
    const runsInput = {
        profileId: input.profileId,
        sessionId: selectedSessionIdForQueries,
    };
    const messagesInput = {
        profileId: input.profileId,
        sessionId: selectedSessionIdForQueries,
    };

    const sessionsQuery = trpc.session.list.useQuery(sessionsInput, PROGRESSIVE_QUERY_OPTIONS);
    const runsQuery = trpc.session.listRuns.useQuery(runsInput, {
        enabled: isEntityId(input.selectedSessionId, 'sess'),
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const messagesQuery = trpc.session.listMessages.useQuery(messagesInput, {
        enabled: isEntityId(input.selectedSessionId, 'sess'),
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const attachedSkillsQuery = trpc.session.getAttachedSkills.useQuery(
        {
            profileId: input.profileId,
            sessionId: selectedSessionIdForQueries,
        },
        {
            enabled: isEntityId(input.selectedSessionId, 'sess') && input.topLevelTab === 'agent',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const usageSummaryQuery = trpc.provider.getUsageSummary.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const runDiffsQuery = trpc.diff.listByRun.useQuery(
        {
            profileId: input.profileId,
            runId: selectedRunIdForQueries ?? fallbackRunId,
        },
        {
            enabled: isEntityId(input.selectedRunId, 'run'),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const checkpointsQuery = trpc.checkpoint.list.useQuery(
        {
            profileId: input.profileId,
            sessionId: selectedSessionIdForQueries,
        },
        {
            enabled: isEntityId(input.selectedSessionId, 'sess') && input.topLevelTab !== 'chat',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const pendingPermissionsQuery = trpc.permission.listPending.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);

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
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const orchestratorLatestQuery = trpc.orchestrator.latestBySession.useQuery(
        {
            profileId: input.profileId,
            sessionId: selectedSessionIdForQueries,
        },
        {
            enabled: Boolean(input.selectedSessionId) && input.topLevelTab === 'orchestrator',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    return {
        shellBootstrapQuery,
        listThreadsInput,
        listBucketsQuery,
        listTagsQuery,
        listThreadsQuery,
        sessionsInput,
        sessionsQuery,
        runsInput,
        runsQuery,
        messagesInput,
        messagesQuery,
        attachedSkillsQuery,
        usageSummaryQuery,
        runDiffsQuery,
        checkpointsQuery,
        pendingPermissionsQuery,
        activePlanQuery,
        orchestratorLatestQuery,
    };
}

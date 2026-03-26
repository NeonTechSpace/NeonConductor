import { skipToken } from '@tanstack/react-query';

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
    modeKey: string;
}

export function buildConversationSessionScopedQueryInput(profileId: string, selectedSessionId: string | undefined) {
    return isEntityId(selectedSessionId, 'sess')
        ? {
              profileId,
              sessionId: selectedSessionId,
          }
        : skipToken;
}

export function buildConversationRunScopedQueryInput(profileId: string, selectedRunId: string | undefined) {
    return isEntityId(selectedRunId, 'run')
        ? {
              profileId,
              runId: selectedRunId,
          }
        : skipToken;
}

export function buildConversationAttachedRegistryQueryInput(input: {
    profileId: string;
    selectedSessionId: string | undefined;
    topLevelTab: TopLevelTab;
    modeKey: string;
}) {
    return isEntityId(input.selectedSessionId, 'sess') && input.topLevelTab !== 'chat'
        ? {
              profileId: input.profileId,
              sessionId: input.selectedSessionId,
              topLevelTab: input.topLevelTab,
              modeKey: input.modeKey,
          }
        : skipToken;
}

export function buildConversationActivePlanQueryInput(input: {
    profileId: string;
    selectedSessionId: string | undefined;
    topLevelTab: TopLevelTab;
}) {
    return isEntityId(input.selectedSessionId, 'sess') &&
        (input.topLevelTab === 'agent' || input.topLevelTab === 'orchestrator')
        ? {
              profileId: input.profileId,
              sessionId: input.selectedSessionId,
              topLevelTab: input.topLevelTab,
          }
        : skipToken;
}

export function buildConversationOrchestratorLatestQueryInput(input: {
    profileId: string;
    selectedSessionId: string | undefined;
    topLevelTab: TopLevelTab;
}) {
    return isEntityId(input.selectedSessionId, 'sess') && input.topLevelTab === 'orchestrator'
        ? {
              profileId: input.profileId,
              sessionId: input.selectedSessionId,
          }
        : skipToken;
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

    const sessionsInput = { profileId: input.profileId };
    const runsInput = buildConversationSessionScopedQueryInput(input.profileId, input.selectedSessionId);
    const messagesInput = runsInput;
    const attachedRegistryInput = buildConversationAttachedRegistryQueryInput({
        profileId: input.profileId,
        selectedSessionId: input.selectedSessionId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    });
    const runDiffsInput = buildConversationRunScopedQueryInput(input.profileId, input.selectedRunId);
    const checkpointsInput = buildConversationSessionScopedQueryInput(input.profileId, input.selectedSessionId);
    const activePlanInput = buildConversationActivePlanQueryInput({
        profileId: input.profileId,
        selectedSessionId: input.selectedSessionId,
        topLevelTab: input.topLevelTab,
    });
    const orchestratorLatestInput = buildConversationOrchestratorLatestQueryInput({
        profileId: input.profileId,
        selectedSessionId: input.selectedSessionId,
        topLevelTab: input.topLevelTab,
    });

    const sessionsQuery = trpc.session.list.useQuery(sessionsInput, PROGRESSIVE_QUERY_OPTIONS);
    const runsQuery = trpc.session.listRuns.useQuery(runsInput, PROGRESSIVE_QUERY_OPTIONS);
    const messagesQuery = trpc.session.listMessages.useQuery(messagesInput, PROGRESSIVE_QUERY_OPTIONS);
    const attachedRulesQuery = trpc.session.getAttachedRules.useQuery(attachedRegistryInput, PROGRESSIVE_QUERY_OPTIONS);
    const attachedSkillsQuery = trpc.session.getAttachedSkills.useQuery(
        attachedRegistryInput,
        PROGRESSIVE_QUERY_OPTIONS
    );
    const usageSummaryQuery = trpc.provider.getUsageSummary.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const runDiffsQuery = trpc.diff.listByRun.useQuery(runDiffsInput, PROGRESSIVE_QUERY_OPTIONS);
    const checkpointsQuery = trpc.checkpoint.list.useQuery(checkpointsInput, {
        enabled: input.topLevelTab !== 'chat',
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const pendingPermissionsQuery = trpc.permission.listPending.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);

    const activePlanQuery = trpc.plan.getActive.useQuery(activePlanInput, PROGRESSIVE_QUERY_OPTIONS);

    const orchestratorLatestQuery = trpc.orchestrator.latestBySession.useQuery(
        orchestratorLatestInput,
        PROGRESSIVE_QUERY_OPTIONS
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
        attachedRulesQuery,
        attachedSkillsQuery,
        usageSummaryQuery,
        runDiffsQuery,
        checkpointsQuery,
        pendingPermissionsQuery,
        activePlanQuery,
        orchestratorLatestQuery,
    };
}

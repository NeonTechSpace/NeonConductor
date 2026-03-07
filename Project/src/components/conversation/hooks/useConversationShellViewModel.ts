import { useConversationShellQueries } from '@/web/components/conversation/conversationShellQueries';
import { useConversationShellRunTarget } from '@/web/components/conversation/conversationShellRunTarget';
import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { useSessionRunSelection } from '@/web/components/conversation/hooks/useSessionRunSelection';
import { useThreadSidebarState } from '@/web/components/conversation/hooks/useThreadSidebarState';
import { isEntityId } from '@/web/components/conversation/shellHelpers';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/app/backend/runtime/contracts';

function buildWorkspaceScope(input: {
    selectedThread: ReturnType<typeof useThreadSidebarState>['visibleThreads'][number] | undefined;
    selectedManagedWorktree:
        | NonNullable<ReturnType<typeof useConversationShellQueries>['shellBootstrapQuery']['data']>['worktrees'][number]
        | undefined;
    selectedWorkspaceRoot:
        | NonNullable<ReturnType<typeof useConversationShellQueries>['shellBootstrapQuery']['data']>['workspaceRoots'][number]
        | undefined;
}) {
    const { selectedManagedWorktree, selectedThread, selectedWorkspaceRoot } = input;
    if (!selectedThread?.workspaceFingerprint) {
        return { kind: 'detached' as const };
    }
    if (selectedManagedWorktree) {
        return {
            kind: 'worktree' as const,
            label: selectedManagedWorktree.label,
            absolutePath: selectedManagedWorktree.absolutePath,
            branch: selectedManagedWorktree.branch,
            baseBranch: selectedManagedWorktree.baseBranch,
            baseWorkspaceLabel: selectedWorkspaceRoot?.label ?? selectedThread.workspaceFingerprint,
            baseWorkspacePath: selectedWorkspaceRoot?.absolutePath ?? 'Unresolved workspace root',
            worktreeId: selectedManagedWorktree.id,
        };
    }

    return {
        kind: 'workspace' as const,
        label: selectedWorkspaceRoot?.label ?? selectedThread.workspaceFingerprint,
        absolutePath: selectedWorkspaceRoot?.absolutePath ?? 'Unresolved workspace root',
        executionEnvironmentMode:
            selectedThread.executionEnvironmentMode === 'worktree' ? 'local' : selectedThread.executionEnvironmentMode,
        ...(selectedThread.executionBranch ? { executionBranch: selectedThread.executionBranch } : {}),
        ...(selectedThread.baseBranch ? { baseBranch: selectedThread.baseBranch } : {}),
    };
}

export function useConversationShellViewModel(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    queries: ReturnType<typeof useConversationShellQueries>;
    uiState: ReturnType<typeof useConversationUiState>;
    sidebarState: ReturnType<typeof useThreadSidebarState>;
    runTargetState: ReturnType<typeof useConversationShellRunTarget>;
}) {
    const selectedThread = input.uiState.selectedThreadId
        ? input.sidebarState.visibleThreads.find((thread) => thread.id === input.uiState.selectedThreadId)
        : undefined;
    const selectedWorkspaceRoot = selectedThread?.workspaceFingerprint
        ? input.queries.shellBootstrapQuery.data?.workspaceRoots.find(
              (workspaceRoot) => workspaceRoot.fingerprint === selectedThread.workspaceFingerprint
          )
        : undefined;
    const registryResolvedQuery = trpc.registry.listResolved.useQuery(
        {
            profileId: input.profileId,
            ...(selectedThread?.workspaceFingerprint
                ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                : {}),
            ...(selectedThread?.worktreeId ? { worktreeId: selectedThread.worktreeId } : {}),
        },
        {
            enabled: input.topLevelTab === 'agent',
            refetchOnWindowFocus: false,
        }
    );
    const pendingPermissions =
        input.queries.pendingPermissionsQuery.data?.requests.filter((request) => request.profileId === input.profileId) ?? [];
    const permissionWorkspaces = Object.fromEntries(
        (input.queries.shellBootstrapQuery.data?.workspaceRoots ?? []).map((workspaceRoot) => [
            workspaceRoot.fingerprint,
            { label: workspaceRoot.label, absolutePath: workspaceRoot.absolutePath },
        ])
    );
    const visibleManagedWorktrees = selectedThread?.workspaceFingerprint
        ? (input.queries.shellBootstrapQuery.data?.worktrees ?? []).filter(
              (worktree) => worktree.workspaceFingerprint === selectedThread.workspaceFingerprint
          )
        : [];
    const sessionRunSelection = useSessionRunSelection({
        allSessions: input.queries.sessionsQuery.data?.sessions ?? [],
        allRuns: input.queries.runsQuery.data?.runs ?? [],
        allMessages: input.queries.messagesQuery.data?.messages ?? [],
        allMessageParts: input.queries.messagesQuery.data?.messageParts ?? [],
        selectedThreadId: input.uiState.selectedThreadId,
        selectedSessionId: input.uiState.selectedSessionId,
        selectedRunId: input.uiState.selectedRunId,
        onSelectedSessionInvalid: () => { input.uiState.setSelectedSessionId(undefined); },
        onSelectFallbackSession: (sessionId) => { input.uiState.setSelectedSessionId(sessionId); },
        onSelectedRunInvalid: () => { input.uiState.setSelectedRunId(undefined); },
        onSelectFallbackRun: (runId) => { input.uiState.setSelectedRunId(runId); },
    });
    const selectedSession = input.uiState.selectedSessionId
        ? sessionRunSelection.sessions.find((session) => session.id === input.uiState.selectedSessionId)
        : undefined;
    const selectedManagedWorktree =
        selectedThread?.workspaceFingerprint &&
        (selectedSession?.worktreeId ?? selectedThread.worktreeId)
            ? input.queries.shellBootstrapQuery.data?.worktrees.find(
                  (worktree) => worktree.id === (selectedSession?.worktreeId ?? selectedThread.worktreeId)
              )
            : undefined;
    const selectedThreadWorktreeId = isEntityId(selectedThread?.worktreeId, 'wt') ? selectedThread.worktreeId : undefined;
    const selectedSessionWorktreeId = isEntityId(selectedSession?.worktreeId, 'wt')
        ? selectedSession.worktreeId
        : undefined;
    const effectiveSelectedWorktreeId = selectedSessionWorktreeId ?? selectedThreadWorktreeId;
    const selectedProviderStatus = input.runTargetState.selectedProviderIdForComposer
        ? input.runTargetState.providerById.get(input.runTargetState.selectedProviderIdForComposer)
        : undefined;
    const selectedModelLabel =
        input.runTargetState.selectedProviderIdForComposer && input.runTargetState.selectedModelIdForComposer
            ? input.runTargetState.modelsByProvider
                  .get(input.runTargetState.selectedProviderIdForComposer)
                  ?.find((model) => model.id === input.runTargetState.selectedModelIdForComposer)?.label
            : undefined;
    const selectedUsageSummary = input.queries.usageSummaryQuery.data?.summaries.find(
        (summary) => summary.providerId === input.runTargetState.selectedProviderIdForComposer
    );
    const attachedSkills = input.queries.attachedSkillsQuery.data?.skillfiles ?? [];
    const missingAttachedSkillKeys = input.queries.attachedSkillsQuery.data?.missingAssetKeys ?? [];
    const activeModeLabel =
        input.topLevelTab === 'agent'
            ? registryResolvedQuery.data?.resolved.modes.find(
                  (resolvedMode) => resolvedMode.topLevelTab === 'agent' && resolvedMode.modeKey === input.modeKey
              )?.label ?? input.modeKey
            : undefined;

    return {
        selectedThread,
        registryResolvedQuery,
        pendingPermissions,
        permissionWorkspaces,
        visibleManagedWorktrees,
        sessionRunSelection,
        effectiveSelectedWorktreeId,
        selectedProviderStatus,
        selectedModelLabel,
        selectedUsageSummary,
        attachedSkills,
        missingAttachedSkillKeys,
        activeModeLabel,
        workspaceScope: buildWorkspaceScope({
            selectedThread,
            selectedManagedWorktree,
            selectedWorkspaceRoot,
        }),
    };
}

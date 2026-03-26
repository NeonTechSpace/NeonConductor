import { startTransition, useTransition } from 'react';

import { resolveTabSwitchNotice } from '@/web/components/conversation/shell/workspace/tabSwitch';
import { ConversationSidebar } from '@/web/components/conversation/sidebar/sidebar';
import type { ThreadEntrySubmitResult } from '@/web/components/conversation/sidebar/sidebarTypes';
import { trpc } from '@/web/trpc/client';

import type {
    ConversationRecord,
    ProviderModelRecord,
    TagRecord,
    ThreadListRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { EntityId, RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';


interface ConversationSidebarPaneProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    threadListQueryInput: {
        profileId: string;
        activeTab: TopLevelTab;
        showAllModes: boolean;
        groupView: 'workspace' | 'branch';
        scope?: 'workspace' | 'detached';
        workspaceFingerprint?: string;
        sort?: 'latest' | 'alphabetical';
    };
    isCollapsed: boolean;
    onToggleCollapsed: () => void;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
    }>;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    workspacePreferences: WorkspacePreferenceRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    preferredWorkspaceFingerprint?: string;
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    sessions: SessionSummaryRecord[];
    tags: TagRecord[];
    threadTags: ThreadTagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    selectedThreadId: string | undefined;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    selectedTagIds: string[];
    scopeFilter: 'all' | 'workspace' | 'detached';
    workspaceFilter: string | undefined;
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    isAddingTag: boolean;
    isDeletingWorkspaceThreads: boolean;
    isCreatingThread: boolean;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onSetTabSwitchNotice: (nextNotice: string | undefined) => void;
    onSelectThreadId: (threadId: string | undefined) => void;
    onSelectSessionId: (sessionId: string | undefined) => void;
    onSelectRunId: (runId: string | undefined) => void;
    onSelectTagIds: (tagIds: string[] | ((current: string[]) => string[])) => void;
    onScopeFilterChange: (scope: 'all' | 'workspace' | 'detached') => void;
    onWorkspaceFilterChange: (workspaceFingerprint?: string) => void;
    onSortChange: (sort: 'latest' | 'alphabetical') => void;
    onShowAllModesChange: (showAllModes: boolean) => void;
    onGroupViewChange: (groupView: 'workspace' | 'branch') => void;
    onSelectWorkspaceFingerprint: (workspaceFingerprint: string | undefined) => void;
    onCreateThread: (input: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }) => Promise<ThreadEntrySubmitResult>;
    upsertTag: (input: { profileId: string; label: string }) => Promise<{ tag: TagRecord }>;
    setThreadTags: (input: {
        profileId: string;
        threadId: EntityId<'thr'>;
        tagIds: EntityId<'tag'>[];
    }) => Promise<{ threadTags: ThreadTagRecord[] }>;
    setThreadFavorite: (input: {
        profileId: string;
        threadId: EntityId<'thr'>;
        isFavorite: boolean;
    }) => Promise<{ updated: boolean; thread?: import('@/app/backend/persistence/types').ThreadRecord }>;
    deleteWorkspaceThreads: (input: {
        profileId: string;
        workspaceFingerprint: string;
        includeFavorites?: boolean;
    }) => Promise<{
        deletedThreadIds: string[];
        deletedTagIds: string[];
        deletedConversationIds: string[];
        sessionIds: string[];
    }>;
}

export function ConversationSidebarPane({
    profileId,
    topLevelTab,
    threadListQueryInput,
    isCollapsed,
    onToggleCollapsed,
    workspaceRoots,
    providers,
    providerModels,
    workspacePreferences,
    defaults,
    preferredWorkspaceFingerprint,
    buckets,
    threads,
    sessions,
    tags,
    threadTags,
    threadTagIdsByThread,
    selectedThreadId,
    selectedSessionId,
    selectedRunId,
    selectedTagIds,
    scopeFilter,
    workspaceFilter,
    sort,
    showAllModes,
    groupView,
    isAddingTag,
    isDeletingWorkspaceThreads,
    isCreatingThread,
    statusMessage,
    statusTone,
    onTopLevelTabChange,
    onSetTabSwitchNotice,
    onSelectThreadId,
    onSelectSessionId,
    onSelectRunId,
    onSelectTagIds,
    onScopeFilterChange,
    onWorkspaceFilterChange,
    onSortChange,
    onShowAllModesChange,
    onGroupViewChange,
    onSelectWorkspaceFingerprint,
    onCreateThread,
    upsertTag,
    setThreadTags,
    setThreadFavorite,
    deleteWorkspaceThreads,
}: ConversationSidebarPaneProps) {
    const utils = trpc.useUtils();
    const [, startSelectionTransition] = useTransition();

    return (
        <ConversationSidebar
            profileId={profileId}
            threadListQueryInput={threadListQueryInput}
            isCollapsed={isCollapsed}
            onToggleCollapsed={onToggleCollapsed}
            buckets={buckets}
            threads={threads}
            sessions={sessions}
            tags={tags}
            threadTags={threadTags}
            threadTagIdsByThread={threadTagIdsByThread}
            workspaceRoots={workspaceRoots}
            providers={providers}
            providerModels={providerModels}
            workspacePreferences={workspacePreferences}
            defaults={defaults}
            {...(preferredWorkspaceFingerprint ? { preferredWorkspaceFingerprint } : {})}
            {...(selectedThreadId ? { selectedThreadId } : {})}
            {...(selectedSessionId ? { selectedSessionId } : {})}
            {...(selectedRunId ? { selectedRunId } : {})}
            selectedTagIds={selectedTagIds}
            scopeFilter={scopeFilter}
            {...(workspaceFilter ? { workspaceFilter } : {})}
            sort={sort}
            showAllModes={showAllModes}
            groupView={groupView}
            isAddingTag={isAddingTag}
            isDeletingWorkspaceThreads={isDeletingWorkspaceThreads}
            isCreatingThread={isCreatingThread}
            {...(statusMessage ? { statusMessage, statusTone } : {})}
            onSelectThread={(threadId) => {
                startSelectionTransition(() => {
                    const targetThread = threads.find((thread) => thread.id === threadId);
                    const nextTab = targetThread?.topLevelTab ?? topLevelTab;
                    const switchState = resolveTabSwitchNotice(topLevelTab, nextTab);
                    if (switchState.shouldSwitch) {
                        onTopLevelTabChange(nextTab);
                        onSetTabSwitchNotice(switchState.notice);
                        window.setTimeout(() => {
                            onSetTabSwitchNotice(undefined);
                        }, 2200);
                    } else {
                        onSetTabSwitchNotice(undefined);
                    }
                    onSelectThreadId(threadId);
                });
            }}
            onSelectThreadId={onSelectThreadId}
            onSelectSessionId={onSelectSessionId}
            onSelectRunId={onSelectRunId}
            onPreviewThread={(threadId) => {
                const latestSession = sessions
                    .filter((session) => session.threadId === threadId)
                    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
                    .at(0);
                if (!latestSession) {
                    return;
                }

                void utils.session.status.prefetch({
                    profileId,
                    sessionId: latestSession.id,
                });
                void utils.session.listRuns.prefetch({
                    profileId,
                    sessionId: latestSession.id,
                });
            }}
            onToggleTagFilter={(tagId) => {
                startSelectionTransition(() => {
                    onSelectTagIds((current) =>
                        current.includes(tagId) ? current.filter((value) => value !== tagId) : [...current, tagId]
                    );
                });
            }}
            onScopeFilterChange={(scope) => {
                startTransition(() => {
                    onScopeFilterChange(scope);
                });
            }}
            onWorkspaceFilterChange={(nextWorkspaceFingerprint) => {
                startTransition(() => {
                    onWorkspaceFilterChange(nextWorkspaceFingerprint);
                });
            }}
            onSortChange={(nextSort) => {
                startTransition(() => {
                    onSortChange(nextSort);
                });
            }}
            onShowAllModesChange={(nextShowAllModes) => {
                startTransition(() => {
                    onShowAllModesChange(nextShowAllModes);
                });
            }}
            onGroupViewChange={(nextGroupView) => {
                startTransition(() => {
                    onGroupViewChange(nextGroupView);
                });
            }}
            onSelectWorkspaceFingerprint={onSelectWorkspaceFingerprint}
            onCreateThread={onCreateThread}
            upsertTag={upsertTag}
            setThreadTags={setThreadTags}
            setThreadFavorite={setThreadFavorite}
            deleteWorkspaceThreads={deleteWorkspaceThreads}
        />
    );
}

import { useState } from 'react';

import { SidebarRailHeader } from '@/web/components/conversation/sidebar/sections/sidebarRailHeader';
import { SidebarThreadBrowser } from '@/web/components/conversation/sidebar/sections/sidebarThreadBrowser';
import { SidebarThreadComposer } from '@/web/components/conversation/sidebar/sections/sidebarThreadComposer';
import { WorkspaceDeleteDialog } from '@/web/components/conversation/sidebar/sections/workspaceDeleteDialog';
import { SECONDARY_QUERY_OPTIONS } from '@/web/lib/query/secondaryQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { TopLevelTab } from '@/shared/contracts';

interface ConversationSidebarProps {
    profileId: string;
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    topLevelTab: TopLevelTab;
    selectedThreadId?: string;
    selectedTagIds: string[];
    scopeFilter: 'all' | 'workspace' | 'detached';
    workspaceFilter?: string;
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    isCreatingThread: boolean;
    isAddingTag: boolean;
    isDeletingWorkspaceThreads: boolean;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    onTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
    onSelectThread: (threadId: string) => void;
    onPreviewThread?: (threadId: string) => void;
    onToggleTagFilter: (tagId: string) => void;
    onToggleThreadFavorite: (threadId: string, nextFavorite: boolean) => Promise<void>;
    onScopeFilterChange: (scope: 'all' | 'workspace' | 'detached') => void;
    onWorkspaceFilterChange: (workspaceFingerprint?: string) => void;
    onSortChange: (sort: 'latest' | 'alphabetical') => void;
    onShowAllModesChange: (showAllModes: boolean) => void;
    onGroupViewChange: (groupView: 'workspace' | 'branch') => void;
    onCreateThread: (input: {
        scope: 'detached' | 'workspace';
        workspacePath?: string;
        title: string;
    }) => Promise<
        | void
        | {
              feedbackMessage?: string;
          }
    >;
    onAddTagToThread: (threadId: string, label: string) => Promise<void>;
    onDeleteWorkspaceThreads: (input: {
        workspaceFingerprint: string;
        includeFavoriteThreads: boolean;
    }) => Promise<void>;
}

export function ConversationSidebar({
    profileId,
    buckets,
    threads,
    tags,
    threadTagIdsByThread,
    topLevelTab,
    selectedThreadId,
    selectedTagIds,
    scopeFilter,
    workspaceFilter,
    sort,
    showAllModes,
    groupView,
    isCreatingThread,
    isAddingTag,
    isDeletingWorkspaceThreads,
    statusMessage,
    statusTone = 'info',
    onTopLevelTabChange,
    onSelectThread,
    onPreviewThread,
    onToggleTagFilter,
    onToggleThreadFavorite,
    onScopeFilterChange,
    onWorkspaceFilterChange,
    onSortChange,
    onShowAllModesChange,
    onGroupViewChange,
    onCreateThread,
    onAddTagToThread,
    onDeleteWorkspaceThreads,
}: ConversationSidebarProps) {
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<
        | {
              workspaceFingerprint: string;
              workspaceLabel: string;
          }
        | undefined
    >(undefined);
    const [includeFavoriteThreads, setIncludeFavoriteThreads] = useState(false);
    const workspaceDeletePreviewQuery = trpc.conversation.getWorkspaceThreadDeletePreview.useQuery(
        {
            profileId,
            workspaceFingerprint: workspaceDeleteTarget?.workspaceFingerprint ?? '',
            includeFavorites: includeFavoriteThreads,
        },
        {
            enabled: Boolean(workspaceDeleteTarget),
            ...SECONDARY_QUERY_OPTIONS,
        }
    );

    return (
        <>
            <aside className='border-border/70 bg-card/40 flex min-h-0 w-[272px] flex-col border-r xl:w-[288px]'>
                <SidebarRailHeader
                    topLevelTab={topLevelTab}
                    {...(feedbackMessage ? { feedbackMessage } : {})}
                    {...(statusMessage ? { statusMessage, statusTone } : {})}
                    onTopLevelTabChange={onTopLevelTabChange}
                    threadComposerAction={
                        <SidebarThreadComposer
                            topLevelTab={topLevelTab}
                            isCreatingThread={isCreatingThread}
                            onCreateThread={async (input) => {
                                setFeedbackMessage(undefined);
                                const result = await onCreateThread(input);
                                if (result?.feedbackMessage) {
                                    setFeedbackMessage(result.feedbackMessage);
                                }
                            }}
                        />
                    }
                />

                <SidebarThreadBrowser
                    buckets={buckets}
                    threads={threads}
                    tags={tags}
                    threadTagIdsByThread={threadTagIdsByThread}
                    {...(selectedThreadId ? { selectedThreadId } : {})}
                    selectedTagIds={selectedTagIds}
                    scopeFilter={scopeFilter}
                    {...(workspaceFilter ? { workspaceFilter } : {})}
                    sort={sort}
                    showAllModes={showAllModes}
                    groupView={groupView}
                    isAddingTag={isAddingTag}
                    {...(statusMessage ? { statusMessage, statusTone } : {})}
                    onSelectThread={onSelectThread}
                    {...(onPreviewThread ? { onPreviewThread } : {})}
                    onToggleTagFilter={onToggleTagFilter}
                    onToggleThreadFavorite={async (threadId, nextFavorite) => {
                        setFeedbackMessage(undefined);
                        try {
                            await onToggleThreadFavorite(threadId, nextFavorite);
                        } catch (error) {
                            const message =
                                error instanceof Error ? error.message : 'Favorite status could not be updated.';
                            setFeedbackMessage(message);
                            throw error;
                        }
                    }}
                    onRequestWorkspaceDelete={(workspaceFingerprint, workspaceLabel) => {
                        setFeedbackMessage(undefined);
                        setIncludeFavoriteThreads(false);
                        setWorkspaceDeleteTarget({
                            workspaceFingerprint,
                            workspaceLabel,
                        });
                    }}
                    onScopeFilterChange={onScopeFilterChange}
                    onWorkspaceFilterChange={onWorkspaceFilterChange}
                    onSortChange={onSortChange}
                    onShowAllModesChange={onShowAllModesChange}
                    onGroupViewChange={onGroupViewChange}
                    onAddTagToThread={async (threadId, label) => {
                        setFeedbackMessage(undefined);
                        try {
                            await onAddTagToThread(threadId, label);
                        } catch (error) {
                            const message =
                                error instanceof Error ? error.message : 'Thread tags could not be updated.';
                            setFeedbackMessage(message);
                            throw error;
                        }
                    }}
                />
            </aside>

            <WorkspaceDeleteDialog
                open={Boolean(workspaceDeleteTarget)}
                {...(workspaceDeleteTarget?.workspaceLabel ? { workspaceLabel: workspaceDeleteTarget.workspaceLabel } : {})}
                deletableThreadCount={workspaceDeletePreviewQuery.data?.deletableThreadCount ?? 0}
                favoriteThreadCount={workspaceDeletePreviewQuery.data?.favoriteThreadCount ?? 0}
                totalThreadCount={workspaceDeletePreviewQuery.data?.totalThreadCount ?? 0}
                busy={isDeletingWorkspaceThreads || workspaceDeletePreviewQuery.isLoading}
                includeFavoriteThreads={includeFavoriteThreads}
                onIncludeFavoriteThreadsChange={setIncludeFavoriteThreads}
                onCancel={() => {
                    setWorkspaceDeleteTarget(undefined);
                    setIncludeFavoriteThreads(false);
                }}
                onConfirm={() => {
                    if (!workspaceDeleteTarget) {
                        return;
                    }

                    setFeedbackMessage(undefined);
                    void onDeleteWorkspaceThreads({
                        workspaceFingerprint: workspaceDeleteTarget.workspaceFingerprint,
                        includeFavoriteThreads,
                    })
                        .then(() => {
                            setWorkspaceDeleteTarget(undefined);
                            setIncludeFavoriteThreads(false);
                        })
                        .catch((error) => {
                            setFeedbackMessage(
                                error instanceof Error ? error.message : 'Workspace threads could not be deleted.'
                            );
                        });
                }}
            />
        </>
    );
}

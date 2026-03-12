import { startTransition, useTransition } from 'react';

import { applyConversationSessionCacheUpdate } from '@/web/components/conversation/shell/conversationShellCache';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { resolveTabSwitchNotice } from '@/web/components/conversation/shell/workspace/tabSwitch';
import { ConversationSidebar } from '@/web/components/conversation/sidebar/sidebar';
import {
    patchThreadListRecord,
    removeDeletedSidebarRecords,
    replaceThreadTagRelations,
    toThreadListRecord,
    upsertBucketRecord,
    upsertTagRecord,
    upsertThreadListRecord,
} from '@/web/components/conversation/sidebar/sidebarCache';
import { trpc } from '@/web/trpc/client';

import type { ConversationRecord, TagRecord, ThreadListRecord, ThreadRecord, ThreadTagRecord } from '@/app/backend/persistence/types';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';

import type { EntityId, TopLevelTab } from '@/shared/contracts';

interface ConversationSidebarPaneProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    sessions: SessionSummaryRecord[];
    tags: TagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    selectedThreadId: string | undefined;
    selectedSessionId: string | undefined;
    selectedTagIds: string[];
    scopeFilter: 'all' | 'workspace' | 'detached';
    workspaceFilter: string | undefined;
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    isCreatingThread: boolean;
    isAddingTag: boolean;
    isDeletingWorkspaceThreads: boolean;
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
    createThread: (input: {
        profileId: string;
        topLevelTab: TopLevelTab;
        scope: 'detached' | 'workspace';
        workspacePath?: string;
        title: string;
    }) => Promise<{ bucket: ConversationRecord; thread: ThreadRecord }>;
    createSession: (input: {
        profileId: string;
        threadId: EntityId<'thr'>;
        kind: 'local';
    }) => Promise<
        | { created: false; reason: string }
        | {
              created: true;
              session: SessionSummaryRecord;
              thread?: ThreadListRecord;
          }
    >;
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
    }) => Promise<{ updated: boolean; thread?: ThreadRecord }>;
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
    buckets,
    threads,
    sessions,
    tags,
    threadTagIdsByThread,
    selectedThreadId,
    selectedSessionId,
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
    createThread,
    createSession,
    upsertTag,
    setThreadTags,
    setThreadFavorite,
    deleteWorkspaceThreads,
}: ConversationSidebarPaneProps) {
    const utils = trpc.useUtils();
    const [, startSelectionTransition] = useTransition();
    const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
    const threadListQueryInput = {
        profileId,
        activeTab: topLevelTab,
        showAllModes,
        groupView,
        ...(scopeFilter !== 'all' ? { scope: scopeFilter } : {}),
        ...(workspaceFilter ? { workspaceFingerprint: workspaceFilter } : {}),
        sort,
    };
    return (
        <ConversationSidebar
                profileId={profileId}
                buckets={buckets}
                threads={threads}
                tags={tags}
                threadTagIdsByThread={threadTagIdsByThread}
                topLevelTab={topLevelTab}
                {...(selectedThreadId ? { selectedThreadId } : {})}
                selectedTagIds={selectedTagIds}
                scopeFilter={scopeFilter}
                {...(workspaceFilter ? { workspaceFilter } : {})}
                sort={sort}
                showAllModes={showAllModes}
                groupView={groupView}
                isCreatingThread={isCreatingThread}
                isAddingTag={isAddingTag}
                isDeletingWorkspaceThreads={isDeletingWorkspaceThreads}
                {...(statusMessage ? { statusMessage, statusTone } : {})}
                onTopLevelTabChange={(nextTab) => {
                    startTransition(() => {
                        onSetTabSwitchNotice(undefined);
                        onTopLevelTabChange(nextTab);
                    });
                }}
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
                onToggleThreadFavorite={async (threadId, nextFavorite) => {
                    if (!isEntityId(threadId, 'thr')) {
                        throw new Error('Favorite status could not be updated.');
                    }

                    const currentThread = threads.find((thread) => thread.id === threadId);
                    if (!currentThread) {
                        throw new Error('Favorite status could not be updated.');
                    }

                    const previousThreadList = utils.conversation.listThreads.getData(threadListQueryInput);
                    utils.conversation.listThreads.setData(threadListQueryInput, (current) => {
                        if (!current) {
                            return current;
                        }

                        return {
                            ...current,
                            threads: patchThreadListRecord(current.threads, {
                                ...currentThread,
                                isFavorite: nextFavorite,
                            }),
                        };
                    });

                    try {
                        const result = await setThreadFavorite({
                            profileId,
                            threadId,
                            isFavorite: nextFavorite,
                        });
                        if (!result.updated || !result.thread) {
                            if (previousThreadList) {
                                utils.conversation.listThreads.setData(threadListQueryInput, previousThreadList);
                            }
                            throw new Error('Favorite status could not be updated.');
                        }
                        const updatedThread = result.thread;

                        utils.conversation.listThreads.setData(threadListQueryInput, (current) => {
                            if (!current) {
                                return current;
                            }

                            return {
                                ...current,
                                threads: patchThreadListRecord(current.threads, updatedThread),
                            };
                        });
                    } catch (error) {
                        if (previousThreadList) {
                            utils.conversation.listThreads.setData(threadListQueryInput, previousThreadList);
                        }
                        throw error instanceof Error ? error : new Error('Favorite status could not be updated.');
                    }
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
                onCreateThread={async (input) => {
                    const result = await createThread({
                        profileId,
                        topLevelTab,
                        ...input,
                    });
                    const createdThread = toThreadListRecord(result);
                    utils.conversation.listBuckets.setData({ profileId }, (current) => {
                        if (!current) {
                            return current;
                        }

                        return {
                            buckets: upsertBucketRecord(current.buckets, result.bucket),
                        };
                    });
                    utils.conversation.listThreads.setData(threadListQueryInput, (current) => {
                        if (!current) {
                            return current;
                        }

                        return {
                            ...current,
                            threads: upsertThreadListRecord(current.threads, createdThread, sort),
                        };
                    });

                    if (!isEntityId(result.thread.id, 'thr')) {
                        onSelectThreadId(result.thread.id);
                        onSelectSessionId(undefined);
                        onSelectRunId(undefined);
                        return;
                    }

                    onSelectThreadId(result.thread.id);
                    onSelectRunId(undefined);
                    try {
                        const starterSession = await createSession({
                            profileId,
                            threadId: result.thread.id,
                            kind: 'local',
                        });
                        if (!starterSession.created) {
                            onSelectSessionId(undefined);
                            return {
                                feedbackMessage: 'The starter session could not be created automatically.',
                            };
                        }

                        utils.session.listRuns.setData(
                            {
                                profileId,
                                sessionId: starterSession.session.id,
                            },
                            {
                                runs: [],
                            }
                        );
                        applyConversationSessionCacheUpdate({
                            utils,
                            profileId,
                            listThreadsInput: threadListQueryInput,
                            session: starterSession.session,
                            thread: createdThread,
                        });
                        onSelectSessionId(starterSession.session.id);
                    } catch (error) {
                        onSelectSessionId(undefined);
                        return {
                            feedbackMessage:
                                error instanceof Error
                                    ? error.message
                                    : 'The starter session could not be created automatically.',
                        };
                    }
                }}
                onAddTagToThread={async (threadId, label) => {
                    if (!isEntityId(threadId, 'thr')) {
                        throw new Error('Thread tags could not be updated.');
                    }
                    const previousTags = utils.conversation.listTags.getData({ profileId });
                    const previousShellBootstrap = utils.runtime.getShellBootstrap.getData({ profileId });

                    try {
                        const upserted = await upsertTag({
                            profileId,
                            label,
                        });
                        const existingTagIds = threadTagIdsByThread.get(threadId) ?? [];
                        const nextTagIds = [...new Set([...existingTagIds, upserted.tag.id])];
                        const validTagIds = nextTagIds.filter(
                            (tagId): tagId is EntityId<'tag'> => isEntityId(tagId, 'tag')
                        );
                        if (validTagIds.length !== nextTagIds.length) {
                            throw new Error('The selected tag could not be applied to this thread.');
                        }

                        utils.conversation.listTags.setData({ profileId }, (current) => {
                            if (!current) {
                                return current;
                            }

                            return {
                                tags: upsertTagRecord(current.tags, upserted.tag),
                            };
                        });
                        utils.runtime.getShellBootstrap.setData({ profileId }, (current) => {
                            if (!current) {
                                return current;
                            }

                            const optimisticThreadTags: ThreadTagRecord[] = validTagIds.map((tagId) => ({
                                profileId,
                                threadId,
                                tagId,
                                createdAt: new Date().toISOString(),
                            }));

                            return {
                                ...current,
                                threadTags: replaceThreadTagRelations(current.threadTags, threadId, optimisticThreadTags),
                            };
                        });

                        const result = await setThreadTags({
                            profileId,
                            threadId,
                            tagIds: validTagIds,
                        });
                        utils.runtime.getShellBootstrap.setData({ profileId }, (current) => {
                            if (!current) {
                                return current;
                            }

                            return {
                                ...current,
                                threadTags: replaceThreadTagRelations(current.threadTags, threadId, result.threadTags),
                            };
                        });
                    } catch (error) {
                        if (previousTags) {
                            utils.conversation.listTags.setData({ profileId }, previousTags);
                        }
                        if (previousShellBootstrap) {
                            utils.runtime.getShellBootstrap.setData({ profileId }, previousShellBootstrap);
                        }
                        throw error instanceof Error ? error : new Error('Thread tags could not be updated.');
                    }
                }}
            onDeleteWorkspaceThreads={async ({ workspaceFingerprint, includeFavoriteThreads }) => {
                const previousBucketList = utils.conversation.listBuckets.getData({ profileId });
                const previousThreadList = utils.conversation.listThreads.getData(threadListQueryInput);
                const previousTagList = utils.conversation.listTags.getData({ profileId });
                const previousShellBootstrap = utils.runtime.getShellBootstrap.getData({ profileId });
                const previousSessionList = utils.session.list.getData({ profileId });

                try {
                    const result = await deleteWorkspaceThreads({
                        profileId,
                        workspaceFingerprint,
                        includeFavorites: includeFavoriteThreads,
                    });
                    if (selectedThreadId && result.deletedThreadIds.includes(selectedThreadId)) {
                        onSelectThreadId(undefined);
                        onSelectSessionId(undefined);
                        onSelectRunId(undefined);
                    } else if (selectedSessionId && result.sessionIds.includes(selectedSessionId)) {
                        onSelectSessionId(undefined);
                        onSelectRunId(undefined);
                    } else if (
                        selectedThread &&
                        selectedThread.workspaceFingerprint === workspaceFingerprint &&
                        result.deletedThreadIds.length > 0
                    ) {
                        onSelectSessionId(undefined);
                        onSelectRunId(undefined);
                    }

                    const deletedSidebarRecords = removeDeletedSidebarRecords({
                        buckets,
                        threads,
                        tags,
                        threadTags: previousShellBootstrap?.threadTags ?? [],
                        deletedThreadIds: result.deletedThreadIds,
                        deletedTagIds: result.deletedTagIds,
                        deletedConversationIds: result.deletedConversationIds,
                    });
                    utils.conversation.listBuckets.setData({ profileId }, {
                        buckets: deletedSidebarRecords.buckets,
                    });
                    utils.conversation.listThreads.setData(threadListQueryInput, (current) => {
                        if (!current) {
                            return current;
                        }

                        return {
                            ...current,
                            threads: deletedSidebarRecords.threads,
                        };
                    });
                    utils.conversation.listTags.setData({ profileId }, {
                        tags: deletedSidebarRecords.tags,
                    });
                    if (previousShellBootstrap) {
                        utils.runtime.getShellBootstrap.setData({ profileId }, {
                            ...previousShellBootstrap,
                            threadTags: deletedSidebarRecords.threadTags,
                        });
                    }
                    if (previousSessionList) {
                        utils.session.list.setData(
                            { profileId },
                            {
                                sessions: previousSessionList.sessions.filter(
                                    (session) => !result.sessionIds.includes(session.id)
                                ),
                            }
                        );
                    }
                } catch (error) {
                    if (previousBucketList) {
                        utils.conversation.listBuckets.setData({ profileId }, previousBucketList);
                    }
                    if (previousThreadList) {
                        utils.conversation.listThreads.setData(threadListQueryInput, previousThreadList);
                    }
                    if (previousTagList) {
                        utils.conversation.listTags.setData({ profileId }, previousTagList);
                    }
                    if (previousShellBootstrap) {
                        utils.runtime.getShellBootstrap.setData({ profileId }, previousShellBootstrap);
                    }
                    if (previousSessionList) {
                        utils.session.list.setData({ profileId }, previousSessionList);
                    }
                    throw error instanceof Error ? error : new Error('Workspace threads could not be deleted.');
                }
            }}
        />
    );
}


import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import {
    patchThreadListRecord,
    removeDeletedSidebarRecords,
    replaceThreadTagRelations,
    upsertTagRecord,
} from '@/web/components/conversation/sidebar/sidebarCache';
import {
    sidebarMutationFailure,
    sidebarMutationSuccess,
} from '@/web/components/conversation/sidebar/sidebarMutationResult';
import type { SidebarMutationResult } from '@/web/components/conversation/sidebar/sidebarMutationResult';
import { resolveSidebarSelectionAfterMutation } from '@/web/components/conversation/sidebar/useSidebarMutationOutcomeHandler';
import { trpc } from '@/web/trpc/client';

import type {
    ConversationRecord,
    TagRecord,
    ThreadListRecord,
    ThreadRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';

import type { EntityId, TopLevelTab } from '@/shared/contracts';


interface SidebarThreadListQueryInput {
    profileId: string;
    activeTab: TopLevelTab;
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    scope?: 'workspace' | 'detached';
    workspaceFingerprint?: string;
    sort?: 'latest' | 'alphabetical';
}

interface UseSidebarMutationControllerInput {
    profileId: string;
    threadListQueryInput: SidebarThreadListQueryInput;
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    threadTags: ThreadTagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    selectedThreadId: string | undefined;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    onSelectThreadId: (threadId: string | undefined) => void;
    onSelectSessionId: (sessionId: string | undefined) => void;
    onSelectRunId: (runId: string | undefined) => void;
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

export function useSidebarMutationController(input: UseSidebarMutationControllerInput) {
    const utils = trpc.useUtils();
    const selectedThread = input.threads.find((thread) => thread.id === input.selectedThreadId);

    return {
        async toggleThreadFavorite(threadId: string, nextFavorite: boolean): Promise<SidebarMutationResult> {
            const failureMessage = 'Favorite status could not be updated.';
            if (!isEntityId(threadId, 'thr')) {
                return sidebarMutationFailure(failureMessage);
            }

            const currentThread = input.threads.find((thread) => thread.id === threadId);
            if (!currentThread) {
                return sidebarMutationFailure(failureMessage);
            }

            const previousThreadList = utils.conversation.listThreads.getData(input.threadListQueryInput);
            utils.conversation.listThreads.setData(input.threadListQueryInput, (current) => {
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
                const result = await input.setThreadFavorite({
                    profileId: input.profileId,
                    threadId,
                    isFavorite: nextFavorite,
                });
                if (!result.updated || !result.thread) {
                    if (previousThreadList) {
                        utils.conversation.listThreads.setData(input.threadListQueryInput, previousThreadList);
                    }
                    return sidebarMutationFailure(failureMessage);
                }
                const updatedThread = result.thread;

                utils.conversation.listThreads.setData(input.threadListQueryInput, (current) => {
                    if (!current) {
                        return current;
                    }

                    return {
                        ...current,
                        threads: patchThreadListRecord(current.threads, updatedThread),
                    };
                });
                return sidebarMutationSuccess();
            } catch (error) {
                if (previousThreadList) {
                    utils.conversation.listThreads.setData(input.threadListQueryInput, previousThreadList);
                }
                return sidebarMutationFailure(error instanceof Error ? error.message : failureMessage);
            }
        },

        async addTagToThread(threadId: string, label: string): Promise<SidebarMutationResult> {
            const failureMessage = 'Thread tags could not be updated.';
            if (!isEntityId(threadId, 'thr')) {
                return sidebarMutationFailure(failureMessage);
            }

            const previousTags = utils.conversation.listTags.getData({ profileId: input.profileId });
            const previousShellBootstrap = utils.runtime.getShellBootstrap.getData({ profileId: input.profileId });

            try {
                const upserted = await input.upsertTag({
                    profileId: input.profileId,
                    label,
                });
                const existingTagIds = input.threadTagIdsByThread.get(threadId) ?? [];
                const nextTagIds = [...new Set([...existingTagIds, upserted.tag.id])];
                const validTagIds = nextTagIds.filter((tagId): tagId is EntityId<'tag'> => isEntityId(tagId, 'tag'));
                if (validTagIds.length !== nextTagIds.length) {
                    return sidebarMutationFailure('The selected tag could not be applied to this thread.');
                }

                utils.conversation.listTags.setData({ profileId: input.profileId }, (current) => {
                    if (!current) {
                        return current;
                    }

                    return {
                        tags: upsertTagRecord(current.tags, upserted.tag),
                    };
                });
                utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, (current) => {
                    if (!current) {
                        return current;
                    }

                    const optimisticThreadTags: ThreadTagRecord[] = validTagIds.map((tagId) => ({
                        profileId: input.profileId,
                        threadId,
                        tagId,
                        createdAt: new Date().toISOString(),
                    }));

                    return {
                        ...current,
                        threadTags: replaceThreadTagRelations(current.threadTags, threadId, optimisticThreadTags),
                    };
                });

                const result = await input.setThreadTags({
                    profileId: input.profileId,
                    threadId,
                    tagIds: validTagIds,
                });
                utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, (current) => {
                    if (!current) {
                        return current;
                    }

                    return {
                        ...current,
                        threadTags: replaceThreadTagRelations(current.threadTags, threadId, result.threadTags),
                    };
                });
                return sidebarMutationSuccess();
            } catch (error) {
                if (previousTags) {
                    utils.conversation.listTags.setData({ profileId: input.profileId }, previousTags);
                }
                if (previousShellBootstrap) {
                    utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, previousShellBootstrap);
                }
                return sidebarMutationFailure(error instanceof Error ? error.message : failureMessage);
            }
        },

        async deleteWorkspaceThreadsForSidebar(inputDeletion: {
            workspaceFingerprint: string;
            includeFavoriteThreads: boolean;
        }): Promise<SidebarMutationResult> {
            const failureMessage = 'Workspace threads could not be deleted.';
            const previousBucketList = utils.conversation.listBuckets.getData({ profileId: input.profileId });
            const previousThreadList = utils.conversation.listThreads.getData(input.threadListQueryInput);
            const previousTagList = utils.conversation.listTags.getData({ profileId: input.profileId });
            const previousShellBootstrap = utils.runtime.getShellBootstrap.getData({ profileId: input.profileId });
            const previousSessionList = utils.session.list.getData({ profileId: input.profileId });

            try {
                const result = await input.deleteWorkspaceThreads({
                    profileId: input.profileId,
                    workspaceFingerprint: inputDeletion.workspaceFingerprint,
                    includeFavorites: inputDeletion.includeFavoriteThreads,
                });

                const nextSelection = resolveSidebarSelectionAfterMutation({
                    selectedThreadId: input.selectedThreadId,
                    selectedSessionId: input.selectedSessionId,
                    selectedRunId: input.selectedRunId,
                    selectedThread,
                    outcome: {
                        kind: 'deleted_workspace_threads',
                        workspaceFingerprint: inputDeletion.workspaceFingerprint,
                        deletedThreadIds: result.deletedThreadIds,
                        deletedSessionIds: result.sessionIds,
                        deletedConversationIds: result.deletedConversationIds,
                        deletedTagIds: result.deletedTagIds,
                    },
                });

                input.onSelectThreadId(nextSelection.selectedThreadId);
                input.onSelectSessionId(nextSelection.selectedSessionId);
                input.onSelectRunId(nextSelection.selectedRunId);

                const deletedSidebarRecords = removeDeletedSidebarRecords({
                    buckets: input.buckets,
                    threads: input.threads,
                    tags: input.tags,
                    threadTags: input.threadTags,
                    deletedThreadIds: result.deletedThreadIds,
                    deletedTagIds: result.deletedTagIds,
                    deletedConversationIds: result.deletedConversationIds,
                });

                utils.conversation.listBuckets.setData(
                    { profileId: input.profileId },
                    {
                        buckets: deletedSidebarRecords.buckets,
                    }
                );
                utils.conversation.listThreads.setData(input.threadListQueryInput, (current) => {
                    if (!current) {
                        return current;
                    }

                    return {
                        ...current,
                        threads: deletedSidebarRecords.threads,
                    };
                });
                utils.conversation.listTags.setData(
                    { profileId: input.profileId },
                    {
                        tags: deletedSidebarRecords.tags,
                    }
                );
                if (previousShellBootstrap) {
                    utils.runtime.getShellBootstrap.setData(
                        { profileId: input.profileId },
                        {
                            ...previousShellBootstrap,
                            threadTags: deletedSidebarRecords.threadTags,
                        }
                    );
                }
                if (previousSessionList) {
                    utils.session.list.setData(
                        { profileId: input.profileId },
                        {
                            sessions: previousSessionList.sessions.filter(
                                (session) => !result.sessionIds.includes(session.id)
                            ),
                        }
                    );
                }
                return sidebarMutationSuccess();
            } catch (error) {
                if (previousBucketList) {
                    utils.conversation.listBuckets.setData({ profileId: input.profileId }, previousBucketList);
                }
                if (previousThreadList) {
                    utils.conversation.listThreads.setData(input.threadListQueryInput, previousThreadList);
                }
                if (previousTagList) {
                    utils.conversation.listTags.setData({ profileId: input.profileId }, previousTagList);
                }
                if (previousShellBootstrap) {
                    utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, previousShellBootstrap);
                }
                if (previousSessionList) {
                    utils.session.list.setData({ profileId: input.profileId }, previousSessionList);
                }
                return sidebarMutationFailure(error instanceof Error ? error.message : failureMessage);
            }
        },
    };
}


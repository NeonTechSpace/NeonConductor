import {
    conversationStore,
    settingsStore,
    tagStore,
    threadStore,
    workspaceRootStore,
} from '@/app/backend/persistence/stores';
import {
    conversationCreateThreadInputSchema,
    conversationDeleteWorkspaceThreadsInputSchema,
    conversationGetEditPreferenceInputSchema,
    conversationGetThreadTitlePreferenceInputSchema,
    conversationListBucketsInputSchema,
    conversationListTagsInputSchema,
    conversationListThreadsInputSchema,
    conversationRenameThreadInputSchema,
    conversationSetEditPreferenceInputSchema,
    conversationSetThreadFavoriteInputSchema,
    conversationSetThreadTitlePreferenceInputSchema,
    conversationSetThreadTagsInputSchema,
    conversationUpsertTagInputSchema,
    conversationWorkspaceThreadDeletePreviewInputSchema,
} from '@/app/backend/runtime/contracts';
import { eventMetadata } from '@/app/backend/runtime/services/common/logContext';
import { runtimeRemoveEvent, runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, raiseTrpcError, toTrpcError } from '@/app/backend/trpc/trpcErrorMap';

const THREAD_SORT_SETTING_KEY = 'conversation_thread_sort';
const DEFAULT_THREAD_SORT = 'latest' as const;
const THREAD_SHOW_ALL_MODES_SETTING_KEY = 'conversation_thread_show_all_modes';
const DEFAULT_SHOW_ALL_MODES = false;
const THREAD_GROUP_VIEW_SETTING_KEY = 'conversation_thread_group_view';
const DEFAULT_THREAD_GROUP_VIEW = 'workspace' as const;
const EDIT_RESOLUTION_SETTING_KEY = 'conversation_edit_resolution';
const DEFAULT_EDIT_RESOLUTION = 'ask' as const;
const THREAD_TITLE_GENERATION_MODE_SETTING_KEY = 'thread_title_generation_mode';
const DEFAULT_THREAD_TITLE_GENERATION_MODE = 'template' as const;

function isThreadSort(value: string | undefined): value is 'latest' | 'alphabetical' {
    return value === 'latest' || value === 'alphabetical';
}

function isThreadGroupView(value: string | undefined): value is 'workspace' | 'branch' {
    return value === 'workspace' || value === 'branch';
}

function parseStoredBoolean(value: string | undefined): boolean | undefined {
    if (!value) {
        return undefined;
    }

    if (value === 'true' || value === '1') {
        return true;
    }

    if (value === 'false' || value === '0') {
        return false;
    }

    return undefined;
}

export const conversationRouter = router({
    listBuckets: publicProcedure.input(conversationListBucketsInputSchema).query(async ({ input }) => {
        return {
            buckets: await conversationStore.listBuckets(input.profileId),
        };
    }),
    listThreads: publicProcedure.input(conversationListThreadsInputSchema).query(async ({ input }) => {
        const [persistedSort, persistedShowAllModes, persistedGroupView] = await Promise.all([
            settingsStore.getStringOptional(input.profileId, THREAD_SORT_SETTING_KEY),
            settingsStore.getStringOptional(input.profileId, THREAD_SHOW_ALL_MODES_SETTING_KEY),
            settingsStore.getStringOptional(input.profileId, THREAD_GROUP_VIEW_SETTING_KEY),
        ]);
        const selectedSort = input.sort ?? (isThreadSort(persistedSort) ? persistedSort : DEFAULT_THREAD_SORT);
        const selectedShowAllModes =
            input.showAllModes ?? parseStoredBoolean(persistedShowAllModes) ?? DEFAULT_SHOW_ALL_MODES;
        const selectedGroupView =
            input.groupView ?? (isThreadGroupView(persistedGroupView) ? persistedGroupView : DEFAULT_THREAD_GROUP_VIEW);

        const persistUpdates: Promise<void>[] = [];
        if (input.sort && input.sort !== persistedSort) {
            persistUpdates.push(settingsStore.setString(input.profileId, THREAD_SORT_SETTING_KEY, input.sort));
        }
        if (input.showAllModes !== undefined && input.showAllModes !== parseStoredBoolean(persistedShowAllModes)) {
            persistUpdates.push(
                settingsStore.setString(
                    input.profileId,
                    THREAD_SHOW_ALL_MODES_SETTING_KEY,
                    input.showAllModes ? '1' : '0'
                )
            );
        }
        if (input.groupView && input.groupView !== persistedGroupView) {
            persistUpdates.push(
                settingsStore.setString(input.profileId, THREAD_GROUP_VIEW_SETTING_KEY, input.groupView)
            );
        }
        if (persistUpdates.length > 0) {
            await Promise.all(persistUpdates);
        }

        return {
            sort: selectedSort,
            showAllModes: selectedShowAllModes,
            groupView: selectedGroupView,
            threads: await threadStore.list({
                ...input,
                activeTab: input.activeTab ?? 'chat',
                showAllModes: selectedShowAllModes,
                groupView: selectedGroupView,
                sort: selectedSort,
            }),
        };
    }),
    createThread: publicProcedure.input(conversationCreateThreadInputSchema).mutation(async ({ input, ctx }) => {
        const topLevelTab = input.topLevelTab ?? 'chat';
        if (input.scope === 'detached' && topLevelTab !== 'chat') {
            raiseTrpcError({
                code: 'unsupported_tab',
                message: 'Playground threads are chat-only.',
            });
        }

        const resolvedBucket = (
            await conversationStore.createOrGetBucket({
                profileId: input.profileId,
                scope: input.scope,
                ...(input.workspacePath
                    ? {
                          workspaceFingerprint: (
                              await workspaceRootStore.resolveOrCreate(input.profileId, input.workspacePath)
                          ).fingerprint,
                      }
                    : {}),
            })
        ).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        const createdThread = (
            await threadStore.create({
                profileId: input.profileId,
                conversationId: resolvedBucket.id,
                title: input.title,
                topLevelTab,
                ...(input.executionEnvironmentMode ? { executionEnvironmentMode: input.executionEnvironmentMode } : {}),
                ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
            })
        ).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );

        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'thread',
                domain: 'thread',
                entityId: createdThread.id,
                eventType: 'conversation.thread.created',
                payload: {
                    profileId: input.profileId,
                    bucket: resolvedBucket,
                    thread: createdThread,
                },
                ...eventMetadata({
                    requestId: ctx.requestId,
                    correlationId: ctx.correlationId,
                    origin: 'trpc.conversation.createThread',
                }),
            })
        );

        return {
            bucket: resolvedBucket,
            thread: createdThread,
        };
    }),
    renameThread: publicProcedure.input(conversationRenameThreadInputSchema).mutation(async ({ input, ctx }) => {
        const renamedThread = (await threadStore.rename(input.profileId, input.threadId, input.title)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        if (!renamedThread) {
            return {
                renamed: false as const,
                reason: 'not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'thread',
                domain: 'thread',
                entityId: renamedThread.id,
                eventType: 'conversation.thread.renamed',
                payload: {
                    profileId: input.profileId,
                    thread: renamedThread,
                },
                ...eventMetadata({
                    requestId: ctx.requestId,
                    correlationId: ctx.correlationId,
                    origin: 'trpc.conversation.renameThread',
                }),
            })
        );

        return {
            renamed: true as const,
            thread: renamedThread,
        };
    }),
    setThreadFavorite: publicProcedure
        .input(conversationSetThreadFavoriteInputSchema)
        .mutation(async ({ input, ctx }) => {
            const updatedThread = (
                await threadStore.setFavorite(input.profileId, input.threadId, input.isFavorite)
            ).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            );
            if (!updatedThread) {
                return {
                    updated: false as const,
                    reason: 'not_found' as const,
                };
            }

            await runtimeEventLogService.append(
                runtimeUpsertEvent({
                    entityType: 'thread',
                    domain: 'thread',
                    entityId: updatedThread.id,
                    eventType: 'conversation.thread.favorite.updated',
                    payload: {
                        profileId: input.profileId,
                        threadId: updatedThread.id,
                        isFavorite: updatedThread.isFavorite,
                        thread: updatedThread,
                    },
                    ...eventMetadata({
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                        origin: 'trpc.conversation.setThreadFavorite',
                    }),
                })
            );

            return {
                updated: true as const,
                thread: updatedThread,
            };
        }),
    listTags: publicProcedure.input(conversationListTagsInputSchema).query(async ({ input }) => {
        return {
            tags: await tagStore.listByProfile(input.profileId),
        };
    }),
    upsertTag: publicProcedure.input(conversationUpsertTagInputSchema).mutation(async ({ input }) => {
        const tag = (await tagStore.upsert(input.profileId, input.label)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'tag',
                domain: 'tag',
                entityId: tag.id,
                eventType: 'conversation.tag.upserted',
                payload: {
                    profileId: input.profileId,
                    tag,
                },
            })
        );
        return { tag };
    }),
    setThreadTags: publicProcedure.input(conversationSetThreadTagsInputSchema).mutation(async ({ input, ctx }) => {
        const threadTags = (await tagStore.setThreadTags(input.profileId, input.threadId, input.tagIds)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'thread',
                domain: 'thread',
                entityId: input.threadId,
                eventType: 'conversation.thread.tags.updated',
                payload: {
                    profileId: input.profileId,
                    threadId: input.threadId,
                    tagIds: threadTags.map((item) => item.tagId),
                },
                ...eventMetadata({
                    requestId: ctx.requestId,
                    correlationId: ctx.correlationId,
                    origin: 'trpc.conversation.setThreadTags',
                }),
            })
        );

        return {
            threadTags,
        };
    }),
    getWorkspaceThreadDeletePreview: publicProcedure
        .input(conversationWorkspaceThreadDeletePreviewInputSchema)
        .query(async ({ input }) => {
            return threadStore.getWorkspaceDeletePreview({
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                includeFavorites: input.includeFavorites ?? false,
            });
        }),
    deleteWorkspaceThreads: publicProcedure
        .input(conversationDeleteWorkspaceThreadsInputSchema)
        .mutation(async ({ input, ctx }) => {
            const result = await threadStore.deleteWorkspaceThreads({
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                includeFavorites: input.includeFavorites ?? false,
            });

            if (result.deletedThreadIds.length > 0) {
                const primaryThreadId = result.deletedThreadIds[0] ?? input.workspaceFingerprint;
                await runtimeEventLogService.append(
                    runtimeRemoveEvent({
                        entityType: 'thread',
                        domain: 'thread',
                        entityId: primaryThreadId,
                        eventType: 'conversation.workspace.threads.cleared',
                        payload: {
                            profileId: input.profileId,
                            threadId: primaryThreadId,
                            workspaceFingerprint: input.workspaceFingerprint,
                            deletedThreadIds: result.deletedThreadIds,
                            tagIds: result.deletedTagIds,
                            deletedTagIds: result.deletedTagIds,
                            deletedConversationIds: result.deletedConversationIds,
                            sessionIds: result.sessionIds,
                            includeFavorites: input.includeFavorites ?? false,
                            totalThreadCount: result.totalThreadCount,
                            favoriteThreadCount: result.favoriteThreadCount,
                            deletableThreadCount: result.deletableThreadCount,
                        },
                        ...eventMetadata({
                            requestId: ctx.requestId,
                            correlationId: ctx.correlationId,
                            origin: 'trpc.conversation.deleteWorkspaceThreads',
                        }),
                    })
                );
            }

            return result;
        }),
    getEditPreference: publicProcedure.input(conversationGetEditPreferenceInputSchema).query(async ({ input }) => {
        const value = await settingsStore.getString(
            input.profileId,
            EDIT_RESOLUTION_SETTING_KEY,
            DEFAULT_EDIT_RESOLUTION
        );
        const resolved = value === 'truncate' || value === 'branch' ? value : DEFAULT_EDIT_RESOLUTION;
        return { value: resolved };
    }),
    setEditPreference: publicProcedure.input(conversationSetEditPreferenceInputSchema).mutation(async ({ input }) => {
        await settingsStore.setString(input.profileId, EDIT_RESOLUTION_SETTING_KEY, input.value);
        return { value: input.value };
    }),
    getThreadTitlePreference: publicProcedure
        .input(conversationGetThreadTitlePreferenceInputSchema)
        .query(async ({ input }) => {
            const modeRaw = await settingsStore.getStringOptional(input.profileId, THREAD_TITLE_GENERATION_MODE_SETTING_KEY);
            const mode = modeRaw === 'ai_optional' ? 'ai_optional' : DEFAULT_THREAD_TITLE_GENERATION_MODE;

            return { mode };
        }),
    setThreadTitlePreference: publicProcedure
        .input(conversationSetThreadTitlePreferenceInputSchema)
        .mutation(async ({ input }) => {
            await Promise.all([
                settingsStore.setString(input.profileId, THREAD_TITLE_GENERATION_MODE_SETTING_KEY, input.mode),
                settingsStore.delete(input.profileId, 'thread_title_ai_model'),
            ]);

            return { mode: input.mode };
        }),
});

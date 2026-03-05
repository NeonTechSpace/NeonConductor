import { conversationStore, settingsStore, tagStore, threadStore } from '@/app/backend/persistence/stores';
import {
    conversationCreateThreadInputSchema,
    conversationGetEditPreferenceInputSchema,
    conversationGetThreadTitlePreferenceInputSchema,
    conversationListBucketsInputSchema,
    conversationSetEditPreferenceInputSchema,
    conversationSetThreadTitlePreferenceInputSchema,
    conversationListTagsInputSchema,
    conversationListThreadsInputSchema,
    conversationRenameThreadInputSchema,
    conversationSetThreadTagsInputSchema,
    conversationUpsertTagInputSchema,
} from '@/app/backend/runtime/contracts';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

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
const THREAD_TITLE_AI_MODEL_SETTING_KEY = 'thread_title_ai_model';

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
    createThread: publicProcedure.input(conversationCreateThreadInputSchema).mutation(async ({ input }) => {
        const topLevelTab = input.topLevelTab ?? 'chat';
        if (input.scope === 'detached' && topLevelTab !== 'chat') {
            throw new Error('Playground threads are chat-only.');
        }

        const bucket = await conversationStore.createOrGetBucket({
            profileId: input.profileId,
            scope: input.scope,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        const thread = await threadStore.create({
            profileId: input.profileId,
            conversationId: bucket.id,
            title: input.title,
            topLevelTab,
        });

        await runtimeEventLogService.append({
            entityType: 'thread',
            entityId: thread.id,
            eventType: 'conversation.thread.created',
            payload: {
                profileId: input.profileId,
                bucket,
                thread,
            },
        });

        return {
            bucket,
            thread,
        };
    }),
    renameThread: publicProcedure.input(conversationRenameThreadInputSchema).mutation(async ({ input }) => {
        const thread = await threadStore.rename(input.profileId, input.threadId, input.title);
        if (!thread) {
            return {
                renamed: false as const,
                reason: 'not_found' as const,
            };
        }

        await runtimeEventLogService.append({
            entityType: 'thread',
            entityId: thread.id,
            eventType: 'conversation.thread.renamed',
            payload: {
                profileId: input.profileId,
                thread,
            },
        });

        return {
            renamed: true as const,
            thread,
        };
    }),
    listTags: publicProcedure.input(conversationListTagsInputSchema).query(async ({ input }) => {
        return {
            tags: await tagStore.listByProfile(input.profileId),
        };
    }),
    upsertTag: publicProcedure.input(conversationUpsertTagInputSchema).mutation(async ({ input }) => {
        const tag = await tagStore.upsert(input.profileId, input.label);
        return { tag };
    }),
    setThreadTags: publicProcedure.input(conversationSetThreadTagsInputSchema).mutation(async ({ input }) => {
        const threadTags = await tagStore.setThreadTags(input.profileId, input.threadId, input.tagIds);
        await runtimeEventLogService.append({
            entityType: 'thread',
            entityId: input.threadId,
            eventType: 'conversation.thread.tags.updated',
            payload: {
                profileId: input.profileId,
                threadId: input.threadId,
                tagIds: threadTags.map((item) => item.tagId),
            },
        });

        return {
            threadTags,
        };
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
            const [modeRaw, aiModelRaw] = await Promise.all([
                settingsStore.getStringOptional(input.profileId, THREAD_TITLE_GENERATION_MODE_SETTING_KEY),
                settingsStore.getStringOptional(input.profileId, THREAD_TITLE_AI_MODEL_SETTING_KEY),
            ]);
            const mode = modeRaw === 'ai_optional' ? 'ai_optional' : DEFAULT_THREAD_TITLE_GENERATION_MODE;
            const aiModel = aiModelRaw?.trim();

            return {
                mode,
                ...(mode === 'ai_optional' && aiModel ? { aiModel } : {}),
            };
        }),
    setThreadTitlePreference: publicProcedure
        .input(conversationSetThreadTitlePreferenceInputSchema)
        .mutation(async ({ input }) => {
            await settingsStore.setString(input.profileId, THREAD_TITLE_GENERATION_MODE_SETTING_KEY, input.mode);
            if (input.mode === 'ai_optional') {
                const aiModel = input.aiModel?.trim();
                if (!aiModel) {
                    throw new Error('Invalid "aiModel": required when mode is "ai_optional".');
                }
                await settingsStore.setString(input.profileId, THREAD_TITLE_AI_MODEL_SETTING_KEY, aiModel);
            } else {
                await settingsStore.setString(input.profileId, THREAD_TITLE_AI_MODEL_SETTING_KEY, '');
            }

            return {
                mode: input.mode,
                ...(input.aiModel ? { aiModel: input.aiModel } : {}),
            };
        }),
});

import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { mapThreadListRecord, mapThreadRecord } from '@/app/backend/persistence/stores/conversation/threads/threadStore.mapper';
import {
    compareAnchor,
    compareIsoDesc,
    compareThreadOrder,
    flattenBranchView,
    getAnchorActivity,
    toAnchorKey,
    type ThreadSort,
} from '@/app/backend/persistence/stores/conversation/threads/threadStore.ordering';
import {
    SESSION_THREAD_WITH_CONVERSATION_COLUMNS,
    THREAD_COLUMNS,
} from '@/app/backend/persistence/stores/conversation/threads/threadStore.queries';
import { parseThreadTitle } from '@/app/backend/persistence/stores/conversation/threads/threadStore.validation';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ThreadListRecord, ThreadRecord } from '@/app/backend/persistence/types';
import { topLevelTabs } from '@/app/backend/runtime/contracts';
import type { EntityId, ExecutionEnvironmentMode, TopLevelTab } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

type ThreadGroupView = 'workspace' | 'branch';

interface WorkspaceThreadDeleteResolution {
    totalThreadCount: number;
    favoriteThreadCount: number;
    deletableThreadIds: EntityId<'thr'>[];
    deletedTagIds: EntityId<'tag'>[];
    deletedConversationIds: string[];
    sessionIds: EntityId<'sess'>[];
    runIds: EntityId<'run'>[];
    messageIds: EntityId<'msg'>[];
    messagePartIds: string[];
    checkpointIds: EntityId<'ckpt'>[];
    diffIds: string[];
    runtimeEventEntityIds: string[];
}

export interface WorkspaceThreadDeletePreview {
    workspaceFingerprint: string;
    totalThreadCount: number;
    favoriteThreadCount: number;
    deletableThreadCount: number;
}

export interface DeleteWorkspaceThreadsResult extends WorkspaceThreadDeletePreview {
    deletedThreadIds: EntityId<'thr'>[];
    deletedTagIds: EntityId<'tag'>[];
    deletedConversationIds: string[];
    sessionIds: EntityId<'sess'>[];
}

interface DeleteDelegatedChildLaneInput {
    profileId: string;
    threadId: EntityId<'thr'>;
    sessionId?: EntityId<'sess'>;
    orchestratorRunId: EntityId<'orch'>;
}

function createThreadId(): string {
    return `thr_${randomUUID()}`;
}

function uniqueValues<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

async function resolveWorkspaceThreadDeletion(
    profileId: string,
    workspaceFingerprint: string,
    includeFavorites: boolean
): Promise<WorkspaceThreadDeleteResolution> {
    const { db } = getPersistence();
    const workspaceThreads = await db
        .selectFrom('threads')
        .innerJoin('conversations', 'conversations.id', 'threads.conversation_id')
        .select([
            'threads.id',
            'threads.root_thread_id',
            'threads.is_favorite',
            'threads.conversation_id',
        ])
        .where('threads.profile_id', '=', profileId)
        .where('conversations.scope', '=', 'workspace')
        .where('conversations.workspace_fingerprint', '=', workspaceFingerprint)
        .execute();

    const totalThreadCount = workspaceThreads.length;
    const favoriteThreads = workspaceThreads.filter((thread) => thread.is_favorite === 1);
    const favoriteThreadCount = favoriteThreads.length;
    const protectedThreadIds = includeFavorites
        ? new Set<string>()
        : new Set<string>([
              ...favoriteThreads.map((thread) => thread.id),
              ...favoriteThreads.map((thread) => thread.root_thread_id),
          ]);
    const deletableThreadIds = workspaceThreads
        .filter((thread) => !protectedThreadIds.has(thread.id))
        .map((thread) => parseEntityId(thread.id, 'threads.id', 'thr'));

    if (deletableThreadIds.length === 0) {
        return {
            totalThreadCount,
            favoriteThreadCount,
            deletableThreadIds: [],
            deletedTagIds: [],
            deletedConversationIds: [],
            sessionIds: [],
            runIds: [],
            messageIds: [],
            messagePartIds: [],
            checkpointIds: [],
            diffIds: [],
            runtimeEventEntityIds: [],
        };
    }

    const deletableThreadIdSet = new Set(deletableThreadIds);
    const candidateConversationIds = uniqueValues(
        workspaceThreads
            .filter((thread) => deletableThreadIdSet.has(parseEntityId(thread.id, 'threads.id', 'thr')))
            .map((thread) => thread.conversation_id)
    );
    const retainedConversationRows = await db
        .selectFrom('threads')
        .select(['id', 'conversation_id'])
        .where('profile_id', '=', profileId)
        .where('conversation_id', 'in', candidateConversationIds)
        .execute();
    const deletedConversationIds = candidateConversationIds.filter((conversationId) => {
        return !retainedConversationRows.some(
            (thread) =>
                thread.conversation_id === conversationId &&
                !deletableThreadIdSet.has(parseEntityId(thread.id, 'threads.id', 'thr'))
        );
    });

    const sessionRows = await db
        .selectFrom('sessions')
        .select('id')
        .where('profile_id', '=', profileId)
        .where('thread_id', 'in', deletableThreadIds)
        .execute();
    const sessionIds = sessionRows.map((row) => parseEntityId(row.id, 'sessions.id', 'sess'));

    const runRows = sessionIds.length
        ? await db.selectFrom('runs').select('id').where('session_id', 'in', sessionIds).execute()
        : [];
    const runIds = runRows.map((row) => parseEntityId(row.id, 'runs.id', 'run'));

    const messageRows = sessionIds.length
        ? await db.selectFrom('messages').select('id').where('session_id', 'in', sessionIds).execute()
        : [];
    const messageIds = messageRows.map((row) => parseEntityId(row.id, 'messages.id', 'msg'));

    const messagePartRows = messageIds.length
        ? await db
              .selectFrom('message_parts')
              .select('id')
              .where('message_id', 'in', messageIds)
              .execute()
        : [];
    const messagePartIds = messagePartRows.map((row) => row.id);

    const checkpointRows = sessionIds.length
        ? await db.selectFrom('checkpoints').select('id').where('session_id', 'in', sessionIds).execute()
        : [];
    const checkpointIds = checkpointRows.map((row) => parseEntityId(row.id, 'checkpoints.id', 'ckpt'));

    const diffRows = sessionIds.length
        ? await db.selectFrom('diffs').select('id').where('session_id', 'in', sessionIds).execute()
        : [];
    const diffIds = diffRows.map((row) => row.id);

    const candidateTagRows = await db
        .selectFrom('thread_tags')
        .select('tag_id')
        .distinct()
        .where('thread_id', 'in', deletableThreadIds)
        .execute();
    const candidateTagIds = candidateTagRows.map((row) => parseEntityId(row.tag_id, 'thread_tags.tag_id', 'tag'));
    const retainedTagIds = candidateTagIds.length
        ? (
              await db
                  .selectFrom('thread_tags')
                  .select('tag_id')
                  .distinct()
                  .where('tag_id', 'in', candidateTagIds)
                  .where((expressionBuilder) => expressionBuilder.not(expressionBuilder('thread_id', 'in', deletableThreadIds)))
                  .execute()
          ).reduce((value, row) => {
              value.add(parseEntityId(row.tag_id, 'thread_tags.tag_id', 'tag'));
              return value;
          }, new Set<EntityId<'tag'>>())
        : new Set<EntityId<'tag'>>();
    const removableTagIds = candidateTagIds.filter((tagId) => !retainedTagIds.has(tagId));

    return {
        totalThreadCount,
        favoriteThreadCount,
        deletableThreadIds,
        deletedTagIds: removableTagIds,
        deletedConversationIds,
        sessionIds,
        runIds,
        messageIds,
        messagePartIds,
        checkpointIds,
        diffIds,
        runtimeEventEntityIds: uniqueValues([
            ...deletableThreadIds,
            ...deletedConversationIds,
            ...sessionIds,
            ...runIds,
            ...messageIds,
            ...messagePartIds,
            ...checkpointIds,
            ...diffIds,
            ...removableTagIds,
        ]),
    };
}

export class ThreadStore {
    async getListRecordById(profileId: string, threadId: string): Promise<ThreadListRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('threads')
            .innerJoin('conversations', 'conversations.id', 'threads.conversation_id')
            .leftJoin('sessions', (join) =>
                join
                    .onRef('sessions.thread_id', '=', 'threads.id')
                    .onRef('sessions.profile_id', '=', 'threads.profile_id')
            )
            .select((eb) => [
                'threads.id as id',
                'threads.profile_id as profile_id',
                'threads.conversation_id as conversation_id',
                'threads.title as title',
                'threads.top_level_tab as top_level_tab',
                'threads.parent_thread_id as parent_thread_id',
                'threads.root_thread_id as root_thread_id',
                'threads.delegated_from_orchestrator_run_id as delegated_from_orchestrator_run_id',
                'threads.is_favorite as is_favorite',
                'threads.execution_environment_mode as execution_environment_mode',
                'threads.sandbox_id as sandbox_id',
                'threads.last_assistant_at as last_assistant_at',
                'threads.created_at as created_at',
                'threads.updated_at as updated_at',
                'conversations.scope as scope',
                'conversations.workspace_fingerprint as workspace_fingerprint',
                eb.fn.count<number>('sessions.id').as('session_count'),
                eb.fn.max<string>('sessions.updated_at').as('latest_session_updated_at'),
            ])
            .where('threads.profile_id', '=', profileId)
            .where('threads.id', '=', threadId)
            .groupBy([
                'threads.id',
                'threads.profile_id',
                'threads.conversation_id',
                'threads.title',
                'threads.top_level_tab',
                'threads.parent_thread_id',
                'threads.root_thread_id',
                'threads.delegated_from_orchestrator_run_id',
                'threads.is_favorite',
                'threads.execution_environment_mode',
                'threads.sandbox_id',
                'threads.last_assistant_at',
                'threads.created_at',
                'threads.updated_at',
                'conversations.scope',
                'conversations.workspace_fingerprint',
            ])
            .executeTakeFirst();

        return row ? mapThreadListRecord(row) : null;
    }

    async listIdsBySandbox(profileId: string, sandboxId: EntityId<'sb'>): Promise<EntityId<'thr'>[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('threads')
            .select('id')
            .where('profile_id', '=', profileId)
            .where('sandbox_id', '=', sandboxId)
            .execute();

        return rows.map((row) => parseEntityId(row.id, 'threads.id', 'thr'));
    }

    async create(input: {
        profileId: string;
        conversationId: string;
        title: string;
        topLevelTab: TopLevelTab;
        parentThreadId?: string;
        rootThreadId?: string;
        delegatedFromOrchestratorRunId?: EntityId<'orch'>;
        executionEnvironmentMode?: ExecutionEnvironmentMode;
        sandboxId?: EntityId<'sb'>;
    }): Promise<OperationalResult<ThreadRecord>> {
        const title = parseThreadTitle(input.title);
        if (title.isErr()) {
            return errOp(title.error.code, title.error.message, {
                ...(title.error.details ? { details: title.error.details } : {}),
                ...(title.error.retryable !== undefined ? { retryable: title.error.retryable } : {}),
            });
        }

        const { db } = getPersistence();
        const conversation = await db
            .selectFrom('conversations')
            .select(['id', 'scope'])
            .where('id', '=', input.conversationId)
            .where('profile_id', '=', input.profileId)
            .executeTakeFirst();

        if (!conversation) {
            return errOp(
                'conversation_not_found',
                `Conversation "${input.conversationId}" does not exist for profile "${input.profileId}".`
            );
        }

        if (conversation.scope === 'detached' && input.topLevelTab !== 'chat') {
            return errOp('unsupported_tab', 'Playground threads are chat-only.');
        }

        let resolvedParentThreadId: string | undefined;
        let resolvedRootThreadId: string | undefined;
        let inheritedExecutionEnvironmentMode = input.executionEnvironmentMode;
        let inheritedSandboxId = input.sandboxId;

        if (input.parentThreadId) {
            const parent = await db
                .selectFrom('threads')
                .select(['id', 'conversation_id', 'root_thread_id', 'top_level_tab'])
                .where('id', '=', input.parentThreadId)
                .where('profile_id', '=', input.profileId)
                .executeTakeFirst();
            if (!parent) {
                return errOp(
                    'thread_not_found',
                    `Parent thread "${input.parentThreadId}" does not exist for profile "${input.profileId}".`
                );
            }
            if (parent.conversation_id !== input.conversationId) {
                return errOp('thread_mode_mismatch', 'Parent thread must belong to the same conversation bucket.');
            }
            const parentTopLevelTab = parseEnumValue(parent.top_level_tab, 'threads.top_level_tab', topLevelTabs);
            const parentAllowsDelegatedWorker =
                input.delegatedFromOrchestratorRunId &&
                input.topLevelTab === 'agent' &&
                parentTopLevelTab === 'orchestrator';
            if (parentTopLevelTab !== input.topLevelTab && !parentAllowsDelegatedWorker) {
                return errOp('thread_mode_mismatch', 'Thread mode affinity mismatch with parent thread.');
            }

            resolvedParentThreadId = parent.id;
            resolvedRootThreadId = parent.root_thread_id;
            if (inheritedExecutionEnvironmentMode === undefined) {
                const parentThread = await this.getById(input.profileId, parent.id);
                if (parentThread) {
                    inheritedExecutionEnvironmentMode = parentThread.executionEnvironmentMode;
                    inheritedSandboxId = parentThread.sandboxId;
                }
            }
        }

        if (input.rootThreadId) {
            const root = await db
                .selectFrom('threads')
                .select(['id', 'conversation_id', 'top_level_tab'])
                .where('id', '=', input.rootThreadId)
                .where('profile_id', '=', input.profileId)
                .executeTakeFirst();
            if (!root) {
                return errOp(
                    'thread_not_found',
                    `Root thread "${input.rootThreadId}" does not exist for profile "${input.profileId}".`
                );
            }
            if (root.conversation_id !== input.conversationId) {
                return errOp('thread_mode_mismatch', 'Root thread must belong to the same conversation bucket.');
            }
            const rootTopLevelTab = parseEnumValue(root.top_level_tab, 'threads.top_level_tab', topLevelTabs);
            const rootAllowsDelegatedWorker =
                input.delegatedFromOrchestratorRunId &&
                input.topLevelTab === 'agent' &&
                rootTopLevelTab === 'orchestrator';
            if (rootTopLevelTab !== input.topLevelTab && !rootAllowsDelegatedWorker) {
                return errOp('thread_mode_mismatch', 'Thread mode affinity mismatch with root thread.');
            }
            resolvedRootThreadId = root.id;
        }

        if (inheritedExecutionEnvironmentMode === undefined && conversation.scope === 'workspace' && input.topLevelTab !== 'chat') {
            inheritedExecutionEnvironmentMode = 'new_sandbox';
        }

        const threadId = createThreadId();
        const now = nowIso();
        const inserted = await db
            .insertInto('threads')
            .values({
                id: threadId,
                profile_id: input.profileId,
                conversation_id: input.conversationId,
                title: title.value,
                top_level_tab: input.topLevelTab,
                parent_thread_id: resolvedParentThreadId ?? null,
                root_thread_id: resolvedRootThreadId ?? threadId,
                delegated_from_orchestrator_run_id: input.delegatedFromOrchestratorRunId ?? null,
                is_favorite: 0,
                execution_environment_mode: inheritedExecutionEnvironmentMode ?? 'local',
                sandbox_id: inheritedSandboxId ?? null,
                last_assistant_at: null,
                created_at: now,
                updated_at: now,
            })
            .returning(THREAD_COLUMNS)
            .executeTakeFirstOrThrow();

        return okOp(mapThreadRecord(inserted));
    }

    async rename(profileId: string, threadId: string, title: string): Promise<OperationalResult<ThreadRecord | null>> {
        const trimmed = parseThreadTitle(title);
        if (trimmed.isErr()) {
            return errOp(trimmed.error.code, trimmed.error.message, {
                ...(trimmed.error.details ? { details: trimmed.error.details } : {}),
                ...(trimmed.error.retryable !== undefined ? { retryable: trimmed.error.retryable } : {}),
            });
        }

        const { db } = getPersistence();
        const updated = await db
            .updateTable('threads')
            .set({
                title: trimmed.value,
                updated_at: nowIso(),
            })
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .returning(THREAD_COLUMNS)
            .executeTakeFirst();

        return okOp(updated ? mapThreadRecord(updated) : null);
    }

    async getById(profileId: string, threadId: string): Promise<ThreadRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('threads')
            .select(THREAD_COLUMNS)
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();

        return row ? mapThreadRecord(row) : null;
    }

    async getBySessionId(
        profileId: string,
        sessionId: string
    ): Promise<null | {
        thread: ThreadRecord;
        sessionSandboxId?: EntityId<'sb'>;
        scope: 'detached' | 'workspace';
        workspaceFingerprint?: string;
    }> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('sessions')
            .innerJoin('threads', 'threads.id', 'sessions.thread_id')
            .innerJoin('conversations', 'conversations.id', 'threads.conversation_id')
            .select(SESSION_THREAD_WITH_CONVERSATION_COLUMNS)
            .select(['sessions.sandbox_id as session_sandbox_id'])
            .where('sessions.id', '=', sessionId)
            .where('sessions.profile_id', '=', profileId)
            .executeTakeFirst();

        if (!row) {
            return null;
        }

        return {
            thread: mapThreadRecord(row),
            scope: row.scope === 'workspace' ? 'workspace' : 'detached',
            ...(row.session_sandbox_id
                ? { sessionSandboxId: parseEntityId(row.session_sandbox_id, 'sessions.sandbox_id', 'sb') }
                : {}),
            ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        };
    }

    async setExecutionEnvironment(input: {
        profileId: string;
        threadId: string;
        mode: ExecutionEnvironmentMode;
        sandboxId?: EntityId<'sb'>;
    }): Promise<ThreadRecord | null> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('threads')
            .set({
                execution_environment_mode: input.mode,
                sandbox_id: input.sandboxId ?? null,
                updated_at: nowIso(),
            })
            .where('id', '=', input.threadId)
            .where('profile_id', '=', input.profileId)
            .returning(THREAD_COLUMNS)
            .executeTakeFirst();

        return updated ? mapThreadRecord(updated) : null;
    }

    async bindSandbox(input: {
        profileId: string;
        threadId: string;
        sandboxId: EntityId<'sb'>;
    }): Promise<ThreadRecord | null> {
        return this.setExecutionEnvironment({
            profileId: input.profileId,
            threadId: input.threadId,
            mode: 'sandbox',
            sandboxId: input.sandboxId,
        });
    }

    async list(input: {
        profileId: string;
        activeTab: TopLevelTab;
        showAllModes: boolean;
        groupView: ThreadGroupView;
        scope?: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        sort: ThreadSort;
    }): Promise<ThreadListRecord[]> {
        const { db } = getPersistence();
        let query = db
            .selectFrom('threads')
            .innerJoin('conversations', 'conversations.id', 'threads.conversation_id')
            .leftJoin('sessions', (join) =>
                join
                    .onRef('sessions.thread_id', '=', 'threads.id')
                    .onRef('sessions.profile_id', '=', 'threads.profile_id')
            )
            .select((eb) => [
                'threads.id as id',
                'threads.profile_id as profile_id',
                'threads.conversation_id as conversation_id',
                'threads.title as title',
                'threads.top_level_tab as top_level_tab',
                'threads.parent_thread_id as parent_thread_id',
                'threads.root_thread_id as root_thread_id',
                'threads.delegated_from_orchestrator_run_id as delegated_from_orchestrator_run_id',
                'threads.is_favorite as is_favorite',
                'threads.execution_environment_mode as execution_environment_mode',
                'threads.sandbox_id as sandbox_id',
                'threads.last_assistant_at as last_assistant_at',
                'threads.created_at as created_at',
                'threads.updated_at as updated_at',
                'conversations.scope as scope',
                'conversations.workspace_fingerprint as workspace_fingerprint',
                eb.fn.count<number>('sessions.id').as('session_count'),
                eb.fn.max<string>('sessions.updated_at').as('latest_session_updated_at'),
            ])
            .where('threads.profile_id', '=', input.profileId)
            .groupBy([
                'threads.id',
                'threads.profile_id',
                'threads.conversation_id',
                'threads.title',
                'threads.top_level_tab',
                'threads.parent_thread_id',
                'threads.root_thread_id',
                'threads.is_favorite',
                'threads.execution_environment_mode',
                'threads.sandbox_id',
                'threads.last_assistant_at',
                'threads.created_at',
                'threads.updated_at',
                'conversations.scope',
                'conversations.workspace_fingerprint',
            ]);

        if (!input.showAllModes) {
            query = query.where((expressionBuilder) => {
                if (input.activeTab === 'orchestrator') {
                    return expressionBuilder.or([
                        expressionBuilder('threads.top_level_tab', '=', input.activeTab),
                        expressionBuilder('threads.delegated_from_orchestrator_run_id', 'is not', null),
                    ]);
                }

                return expressionBuilder('threads.top_level_tab', '=', input.activeTab);
            });
        }
        if (input.scope) {
            query = query.where('conversations.scope', '=', input.scope);
        }
        if (input.workspaceFingerprint) {
            query = query.where('conversations.workspace_fingerprint', '=', input.workspaceFingerprint);
        }

        const listed = (await query.execute()).map(mapThreadListRecord);
        const byAnchor = new Map<string, ThreadListRecord[]>();
        for (const thread of listed) {
            const key = toAnchorKey(thread);
            const existing = byAnchor.get(key) ?? [];
            existing.push(thread);
            byAnchor.set(key, existing);
        }

        const orderedAnchors = Array.from(byAnchor.values()).sort((leftGroup, rightGroup) => {
            const leftFirst = leftGroup[0];
            const rightFirst = rightGroup[0];
            if (!leftFirst || !rightFirst) {
                return leftGroup.length - rightGroup.length;
            }
            const activityCompare = compareIsoDesc(getAnchorActivity(leftGroup), getAnchorActivity(rightGroup));
            if (activityCompare !== 0) {
                return activityCompare;
            }
            return compareAnchor(leftFirst, rightFirst);
        });
        for (const anchorThreads of orderedAnchors) {
            anchorThreads.sort((left, right) => compareThreadOrder(left, right, input.sort));
        }
        const groupedOrdered = orderedAnchors.flatMap((group) => group);

        if (input.groupView === 'branch') {
            return flattenBranchView(groupedOrdered, input.sort);
        }

        return groupedOrdered;
    }

    async setFavorite(
        profileId: string,
        threadId: EntityId<'thr'>,
        isFavorite: boolean
    ): Promise<OperationalResult<ThreadRecord | null>> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('threads')
            .set({
                is_favorite: isFavorite ? 1 : 0,
                updated_at: nowIso(),
            })
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .returning(THREAD_COLUMNS)
            .executeTakeFirst();

        return okOp(updated ? mapThreadRecord(updated) : null);
    }

    async getWorkspaceDeletePreview(input: {
        profileId: string;
        workspaceFingerprint: string;
        includeFavorites: boolean;
    }): Promise<WorkspaceThreadDeletePreview> {
        const resolved = await resolveWorkspaceThreadDeletion(
            input.profileId,
            input.workspaceFingerprint,
            input.includeFavorites
        );

        return {
            workspaceFingerprint: input.workspaceFingerprint,
            totalThreadCount: resolved.totalThreadCount,
            favoriteThreadCount: resolved.favoriteThreadCount,
            deletableThreadCount: resolved.deletableThreadIds.length,
        };
    }

    async deleteWorkspaceThreads(input: {
        profileId: string;
        workspaceFingerprint: string;
        includeFavorites: boolean;
    }): Promise<DeleteWorkspaceThreadsResult> {
        const resolved = await resolveWorkspaceThreadDeletion(
            input.profileId,
            input.workspaceFingerprint,
            input.includeFavorites
        );
        if (resolved.deletableThreadIds.length === 0) {
            return {
                workspaceFingerprint: input.workspaceFingerprint,
                totalThreadCount: resolved.totalThreadCount,
                favoriteThreadCount: resolved.favoriteThreadCount,
                deletableThreadCount: 0,
                deletedThreadIds: [],
                deletedTagIds: [],
                deletedConversationIds: [],
                sessionIds: [],
            };
        }

        const { db } = getPersistence();
        await db.transaction().execute(async (transaction) => {
            if (resolved.runtimeEventEntityIds.length > 0) {
                await transaction
                    .deleteFrom('runtime_events')
                    .where('entity_id', 'in', resolved.runtimeEventEntityIds)
                    .execute();
            }

            await transaction
                .deleteFrom('threads')
                .where('profile_id', '=', input.profileId)
                .where('id', 'in', resolved.deletableThreadIds)
                .execute();

            if (resolved.deletedConversationIds.length > 0) {
                await transaction
                    .deleteFrom('conversations')
                    .where('profile_id', '=', input.profileId)
                    .where('id', 'in', resolved.deletedConversationIds)
                    .execute();
            }

            if (resolved.deletedTagIds.length > 0) {
                await transaction
                    .deleteFrom('tags')
                    .where('profile_id', '=', input.profileId)
                    .where('id', 'in', resolved.deletedTagIds)
                    .execute();
            }
        });

        return {
            workspaceFingerprint: input.workspaceFingerprint,
            totalThreadCount: resolved.totalThreadCount,
            favoriteThreadCount: resolved.favoriteThreadCount,
            deletableThreadCount: resolved.deletableThreadIds.length,
            deletedThreadIds: resolved.deletableThreadIds,
            deletedTagIds: resolved.deletedTagIds,
            deletedConversationIds: resolved.deletedConversationIds,
            sessionIds: resolved.sessionIds,
        };
    }

    async deleteDelegatedChildLane(input: DeleteDelegatedChildLaneInput): Promise<boolean> {
        const { db } = getPersistence();

        return db.transaction().execute(async (transaction) => {
            const delegatedChildLane = input.sessionId
                ? await transaction
                      .selectFrom('threads')
                      .innerJoin('sessions', 'sessions.thread_id', 'threads.id')
                      .select(['threads.id as thread_id', 'sessions.id as session_id'])
                      .where('threads.profile_id', '=', input.profileId)
                      .where('sessions.profile_id', '=', input.profileId)
                      .where('threads.id', '=', input.threadId)
                      .where('sessions.id', '=', input.sessionId)
                      .where('threads.delegated_from_orchestrator_run_id', '=', input.orchestratorRunId)
                      .where('sessions.delegated_from_orchestrator_run_id', '=', input.orchestratorRunId)
                      .executeTakeFirst()
                : await transaction
                      .selectFrom('threads')
                      .select(['threads.id as thread_id'])
                      .where('threads.profile_id', '=', input.profileId)
                      .where('threads.id', '=', input.threadId)
                      .where('threads.delegated_from_orchestrator_run_id', '=', input.orchestratorRunId)
                      .executeTakeFirst();

            if (!delegatedChildLane) {
                return false;
            }

            const runtimeEventEntityIds = input.sessionId ? [input.threadId, input.sessionId] : [input.threadId];
            await transaction.deleteFrom('runtime_events').where('entity_id', 'in', runtimeEventEntityIds).execute();

            await transaction
                .deleteFrom('threads')
                .where('profile_id', '=', input.profileId)
                .where('id', '=', input.threadId)
                .execute();

            return true;
        });
    }

    async touchByThread(profileId: string, threadId: string): Promise<void> {
        const { db } = getPersistence();
        const now = nowIso();

        const thread = await db
            .updateTable('threads')
            .set({ updated_at: now })
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .returning(['conversation_id'])
            .executeTakeFirst();

        if (!thread) {
            return;
        }

        await db
            .updateTable('conversations')
            .set({ updated_at: now })
            .where('id', '=', thread.conversation_id)
            .where('profile_id', '=', profileId)
            .execute();
    }

    async markAssistantActivity(profileId: string, threadId: string, atIso: string): Promise<void> {
        const { db } = getPersistence();
        const existing = await db
            .selectFrom('threads')
            .select(['last_assistant_at', 'conversation_id'])
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();
        if (!existing) {
            return;
        }

        const nextLastAssistantAt =
            existing.last_assistant_at && existing.last_assistant_at > atIso ? existing.last_assistant_at : atIso;
        await db
            .updateTable('threads')
            .set({
                last_assistant_at: nextLastAssistantAt,
                updated_at: nowIso(),
            })
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .execute();
        await db
            .updateTable('conversations')
            .set({ updated_at: nowIso() })
            .where('id', '=', existing.conversation_id)
            .where('profile_id', '=', profileId)
            .execute();
    }
}

export const threadStore = new ThreadStore();

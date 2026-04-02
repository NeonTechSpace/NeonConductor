import { getPersistence } from '@/app/backend/persistence/db';
import { deleteDelegatedChildLane } from '@/app/backend/persistence/stores/conversation/threads/delegatedChildLaneDeletionLifecycle';
import { createThreadRecord } from '@/app/backend/persistence/stores/conversation/threads/threadCreationLifecycle';
import {
    markThreadAssistantActivity,
    touchThreadActivity,
} from '@/app/backend/persistence/stores/conversation/threads/threadActivityWriter';
import type {
    DeleteDelegatedChildLaneInput,
    DeleteWorkspaceThreadsResult,
    ResolvedThreadCreationInput,
    WorkspaceThreadDeletePreview,
} from '@/app/backend/persistence/stores/conversation/threads/threadLifecycle.types';
import { listThreadRecords } from '@/app/backend/persistence/stores/conversation/threads/threadListReadModel';
import {
    mapThreadListRecord,
    mapThreadRecord,
} from '@/app/backend/persistence/stores/conversation/threads/threadStore.mapper';
import { type ThreadSort } from '@/app/backend/persistence/stores/conversation/threads/threadStore.ordering';
import {
    SESSION_THREAD_WITH_CONVERSATION_COLUMNS,
    THREAD_COLUMNS,
} from '@/app/backend/persistence/stores/conversation/threads/threadStore.queries';
import { parseThreadTitle } from '@/app/backend/persistence/stores/conversation/threads/threadStore.validation';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ThreadListRecord, ThreadRecord } from '@/app/backend/persistence/types';
import type { EntityId, ExecutionEnvironmentMode, TopLevelTab } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    applyWorkspaceThreadDeletion,
    getWorkspaceThreadDeletionPreview,
} from '@/app/backend/persistence/stores/conversation/threads/workspaceThreadDeletionLifecycle';

type ThreadGroupView = 'workspace' | 'branch';

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
                'threads.delegated_from_plan_research_batch_id as delegated_from_plan_research_batch_id',
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
                'threads.delegated_from_plan_research_batch_id',
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
        delegatedFromPlanResearchBatchId?: EntityId<'prb'>;
        executionEnvironmentMode?: ExecutionEnvironmentMode;
        sandboxId?: EntityId<'sb'>;
    }): Promise<OperationalResult<ThreadRecord>> {
        return createThreadRecord(input satisfies ResolvedThreadCreationInput);
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
        return listThreadRecords(input);
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
        return getWorkspaceThreadDeletionPreview(input);
    }

    async deleteWorkspaceThreads(input: {
        profileId: string;
        workspaceFingerprint: string;
        includeFavorites: boolean;
    }): Promise<DeleteWorkspaceThreadsResult> {
        const resolved = await applyWorkspaceThreadDeletion(input);
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
        return deleteDelegatedChildLane(input);
    }

    async touchByThread(profileId: string, threadId: string): Promise<void> {
        await touchThreadActivity(profileId, threadId);
    }

    async markAssistantActivity(profileId: string, threadId: string, atIso: string): Promise<void> {
        await markThreadAssistantActivity(profileId, threadId, atIso);
    }
}

export const threadStore = new ThreadStore();

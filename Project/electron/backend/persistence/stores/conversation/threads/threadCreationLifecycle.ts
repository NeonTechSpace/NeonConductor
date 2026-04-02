import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { mapThreadRecord } from '@/app/backend/persistence/stores/conversation/threads/threadStore.mapper';
import { THREAD_COLUMNS } from '@/app/backend/persistence/stores/conversation/threads/threadStore.queries';
import { parseThreadTitle } from '@/app/backend/persistence/stores/conversation/threads/threadStore.validation';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ThreadRecord } from '@/app/backend/persistence/types';
import { topLevelTabs } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

import type { ResolvedThreadCreationInput } from '@/app/backend/persistence/stores/conversation/threads/threadLifecycle.types';

function createThreadId(): string {
    return `thr_${randomUUID()}`;
}

export async function createThreadRecord(input: ResolvedThreadCreationInput): Promise<OperationalResult<ThreadRecord>> {
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
    const hasDelegatedOwner =
        input.delegatedFromOrchestratorRunId !== undefined || input.delegatedFromPlanResearchBatchId !== undefined;
    if (input.delegatedFromOrchestratorRunId && input.delegatedFromPlanResearchBatchId) {
        return errOp('thread_mode_mismatch', 'Delegated child lanes must have exactly one owner.');
    }

    if (input.parentThreadId) {
        const parent = await db
            .selectFrom('threads')
            .select([
                'id',
                'conversation_id',
                'root_thread_id',
                'top_level_tab',
                'execution_environment_mode',
                'sandbox_id',
            ])
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
            hasDelegatedOwner && input.topLevelTab === 'agent' && parentTopLevelTab === 'orchestrator';
        if (parentTopLevelTab !== input.topLevelTab && !parentAllowsDelegatedWorker) {
            return errOp('thread_mode_mismatch', 'Thread mode affinity mismatch with parent thread.');
        }

        resolvedParentThreadId = parent.id;
        resolvedRootThreadId = parent.root_thread_id;
        if (inheritedExecutionEnvironmentMode === undefined) {
            inheritedExecutionEnvironmentMode = parseEnumValue(
                parent.execution_environment_mode,
                'threads.execution_environment_mode',
                ['local', 'sandbox', 'new_sandbox'] as const
            );
            inheritedSandboxId = parent.sandbox_id
                ? parseEntityId(parent.sandbox_id, 'threads.sandbox_id', 'sb')
                : undefined;
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
            hasDelegatedOwner && input.topLevelTab === 'agent' && rootTopLevelTab === 'orchestrator';
        if (rootTopLevelTab !== input.topLevelTab && !rootAllowsDelegatedWorker) {
            return errOp('thread_mode_mismatch', 'Thread mode affinity mismatch with root thread.');
        }
        resolvedRootThreadId = root.id;
    }

    if (
        inheritedExecutionEnvironmentMode === undefined &&
        conversation.scope === 'workspace' &&
        input.topLevelTab !== 'chat'
    ) {
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
            delegated_from_plan_research_batch_id: input.delegatedFromPlanResearchBatchId ?? null,
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

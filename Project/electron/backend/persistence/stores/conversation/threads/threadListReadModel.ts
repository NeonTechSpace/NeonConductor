import { getPersistence } from '@/app/backend/persistence/db';
import { mapThreadListRecord } from '@/app/backend/persistence/stores/conversation/threads/threadStore.mapper';
import {
    compareAnchor,
    compareIsoDesc,
    compareThreadOrder,
    flattenBranchView,
    getAnchorActivity,
    toAnchorKey,
} from '@/app/backend/persistence/stores/conversation/threads/threadStore.ordering';
import type { ThreadListQueryInput } from '@/app/backend/persistence/stores/conversation/threads/threadLifecycle.types';
import type { ThreadListRecord } from '@/app/backend/persistence/types';

export async function listThreadRecords(input: ThreadListQueryInput): Promise<ThreadListRecord[]> {
    const { db } = getPersistence();
    let query = db
        .selectFrom('threads')
        .innerJoin('conversations', 'conversations.id', 'threads.conversation_id')
        .leftJoin('sessions', (join) =>
            join.onRef('sessions.thread_id', '=', 'threads.id').onRef('sessions.profile_id', '=', 'threads.profile_id')
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
        .where('threads.profile_id', '=', input.profileId)
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

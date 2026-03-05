import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { ThreadListRecord, ThreadRecord } from '@/app/backend/persistence/types';
import { topLevelTabs } from '@/app/backend/runtime/contracts';
import type { TopLevelTab } from '@/app/backend/runtime/contracts';

type ThreadSort = 'latest' | 'alphabetical';
type ThreadGroupView = 'workspace' | 'branch';

interface ThreadRow {
    id: string;
    profile_id: string;
    conversation_id: string;
    title: string;
    top_level_tab: string;
    parent_thread_id: string | null;
    root_thread_id: string;
    last_assistant_at: string | null;
    created_at: string;
    updated_at: string;
}

interface ThreadListRow extends ThreadRow {
    scope: string;
    workspace_fingerprint: string | null;
    session_count: number;
    latest_session_updated_at: string | null;
}

function createThreadId(): string {
    return `thr_${randomUUID()}`;
}

function mapThreadRecord(row: ThreadRow): ThreadRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        conversationId: row.conversation_id,
        title: row.title,
        topLevelTab: parseEnumValue(row.top_level_tab, 'threads.top_level_tab', topLevelTabs),
        ...(row.parent_thread_id ? { parentThreadId: row.parent_thread_id } : {}),
        rootThreadId: row.root_thread_id,
        ...(row.last_assistant_at ? { lastAssistantAt: row.last_assistant_at } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function toAnchorKey(thread: ThreadListRecord): string {
    if (thread.anchorKind === 'playground') {
        return 'playground';
    }

    return `workspace:${thread.anchorId ?? 'unknown'}`;
}

function compareIsoDesc(left?: string, right?: string): number {
    const leftValue = left ?? '';
    const rightValue = right ?? '';
    if (leftValue > rightValue) return -1;
    if (leftValue < rightValue) return 1;
    return 0;
}

function compareAnchor(left: ThreadListRecord, right: ThreadListRecord): number {
    if (left.anchorKind !== right.anchorKind) {
        return left.anchorKind === 'workspace' ? -1 : 1;
    }

    const leftAnchor = left.anchorId ?? '';
    const rightAnchor = right.anchorId ?? '';
    if (leftAnchor !== rightAnchor) {
        return leftAnchor.localeCompare(rightAnchor, undefined, {
            sensitivity: 'base',
            numeric: true,
        });
    }

    return 0;
}

function getThreadActivity(thread: ThreadListRecord): string {
    return thread.lastAssistantAt ?? thread.latestSessionUpdatedAt ?? thread.updatedAt;
}

function getAnchorActivity(threads: ThreadListRecord[]): string {
    let latest = '';
    for (const thread of threads) {
        const activity = getThreadActivity(thread);
        if (activity > latest) {
            latest = activity;
        }
    }
    return latest;
}

function compareThreadOrder(left: ThreadListRecord, right: ThreadListRecord, sort: ThreadSort): number {
    if (sort === 'alphabetical') {
        const titleCompare = left.title.localeCompare(right.title, undefined, {
            sensitivity: 'base',
            numeric: true,
        });
        if (titleCompare !== 0) {
            return titleCompare;
        }
    } else {
        const activityCompare = compareIsoDesc(getThreadActivity(left), getThreadActivity(right));
        if (activityCompare !== 0) {
            return activityCompare;
        }
    }

    return left.id.localeCompare(right.id);
}

function mapThreadListRecord(row: ThreadListRow): ThreadListRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        conversationId: row.conversation_id,
        title: row.title,
        topLevelTab: parseEnumValue(row.top_level_tab, 'threads.top_level_tab', topLevelTabs),
        ...(row.parent_thread_id ? { parentThreadId: row.parent_thread_id } : {}),
        rootThreadId: row.root_thread_id,
        ...(row.last_assistant_at ? { lastAssistantAt: row.last_assistant_at } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        scope: row.scope === 'workspace' ? 'workspace' : 'detached',
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        anchorKind: row.scope === 'workspace' ? 'workspace' : 'playground',
        ...(row.scope === 'workspace'
            ? { anchorId: row.workspace_fingerprint ?? 'unknown-workspace' }
            : { anchorId: 'playground' }),
        sessionCount: row.session_count,
        ...(row.latest_session_updated_at ? { latestSessionUpdatedAt: row.latest_session_updated_at } : {}),
    };
}

function flattenBranchView(threads: ThreadListRecord[], sort: ThreadSort): ThreadListRecord[] {
    const byAnchor = new Map<string, ThreadListRecord[]>();
    for (const thread of threads) {
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

    const ordered: ThreadListRecord[] = [];
    for (const anchorThreads of orderedAnchors) {
        const threadById = new Map(anchorThreads.map((thread) => [thread.id, thread]));
        const childrenByParent = new Map<string, ThreadListRecord[]>();
        const roots: ThreadListRecord[] = [];

        for (const thread of anchorThreads) {
            const parentId = thread.parentThreadId;
            if (!parentId || !threadById.has(parentId)) {
                roots.push(thread);
                continue;
            }

            const existing = childrenByParent.get(parentId) ?? [];
            existing.push(thread);
            childrenByParent.set(parentId, existing);
        }

        roots.sort((left, right) => compareThreadOrder(left, right, sort));
        for (const children of childrenByParent.values()) {
            children.sort((left, right) => compareThreadOrder(left, right, sort));
        }

        const stack = [...roots].reverse();
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {
                continue;
            }
            ordered.push(current);
            const children = childrenByParent.get(current.id);
            if (!children || children.length === 0) {
                continue;
            }
            for (let index = children.length - 1; index >= 0; index -= 1) {
                const child = children[index];
                if (child) {
                    stack.push(child);
                }
            }
        }
    }

    return ordered;
}

export class ThreadStore {
    async create(input: {
        profileId: string;
        conversationId: string;
        title: string;
        topLevelTab: TopLevelTab;
        parentThreadId?: string;
        rootThreadId?: string;
    }): Promise<ThreadRecord> {
        const title = input.title.trim();
        if (title.length === 0) {
            throw new Error('Thread title must be a non-empty string.');
        }

        const { db } = getPersistence();
        const conversation = await db
            .selectFrom('conversations')
            .select(['id', 'scope'])
            .where('id', '=', input.conversationId)
            .where('profile_id', '=', input.profileId)
            .executeTakeFirst();

        if (!conversation) {
            throw new Error(`Conversation "${input.conversationId}" does not exist for profile "${input.profileId}".`);
        }

        if (conversation.scope === 'detached' && input.topLevelTab !== 'chat') {
            throw new Error('Playground threads are chat-only.');
        }

        let resolvedParentThreadId: string | undefined;
        let resolvedRootThreadId: string | undefined;

        if (input.parentThreadId) {
            const parent = await db
                .selectFrom('threads')
                .select(['id', 'conversation_id', 'root_thread_id', 'top_level_tab'])
                .where('id', '=', input.parentThreadId)
                .where('profile_id', '=', input.profileId)
                .executeTakeFirst();
            if (!parent) {
                throw new Error(
                    `Parent thread "${input.parentThreadId}" does not exist for profile "${input.profileId}".`
                );
            }
            if (parent.conversation_id !== input.conversationId) {
                throw new Error('Parent thread must belong to the same conversation bucket.');
            }
            if (parseEnumValue(parent.top_level_tab, 'threads.top_level_tab', topLevelTabs) !== input.topLevelTab) {
                throw new Error('Thread mode affinity mismatch with parent thread.');
            }

            resolvedParentThreadId = parent.id;
            resolvedRootThreadId = parent.root_thread_id;
        }

        if (input.rootThreadId) {
            const root = await db
                .selectFrom('threads')
                .select(['id', 'conversation_id', 'top_level_tab'])
                .where('id', '=', input.rootThreadId)
                .where('profile_id', '=', input.profileId)
                .executeTakeFirst();
            if (!root) {
                throw new Error(`Root thread "${input.rootThreadId}" does not exist for profile "${input.profileId}".`);
            }
            if (root.conversation_id !== input.conversationId) {
                throw new Error('Root thread must belong to the same conversation bucket.');
            }
            if (parseEnumValue(root.top_level_tab, 'threads.top_level_tab', topLevelTabs) !== input.topLevelTab) {
                throw new Error('Thread mode affinity mismatch with root thread.');
            }
            resolvedRootThreadId = root.id;
        }

        const threadId = createThreadId();
        const now = nowIso();
        const inserted = await db
            .insertInto('threads')
            .values({
                id: threadId,
                profile_id: input.profileId,
                conversation_id: input.conversationId,
                title,
                top_level_tab: input.topLevelTab,
                parent_thread_id: resolvedParentThreadId ?? null,
                root_thread_id: resolvedRootThreadId ?? threadId,
                last_assistant_at: null,
                created_at: now,
                updated_at: now,
            })
            .returning([
                'id',
                'profile_id',
                'conversation_id',
                'title',
                'top_level_tab',
                'parent_thread_id',
                'root_thread_id',
                'last_assistant_at',
                'created_at',
                'updated_at',
            ])
            .executeTakeFirstOrThrow();

        return mapThreadRecord(inserted);
    }

    async rename(profileId: string, threadId: string, title: string): Promise<ThreadRecord | null> {
        const trimmed = title.trim();
        if (trimmed.length === 0) {
            throw new Error('Thread title must be a non-empty string.');
        }

        const { db } = getPersistence();
        const updated = await db
            .updateTable('threads')
            .set({
                title: trimmed,
                updated_at: nowIso(),
            })
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .returning([
                'id',
                'profile_id',
                'conversation_id',
                'title',
                'top_level_tab',
                'parent_thread_id',
                'root_thread_id',
                'last_assistant_at',
                'created_at',
                'updated_at',
            ])
            .executeTakeFirst();

        return updated ? mapThreadRecord(updated) : null;
    }

    async getById(profileId: string, threadId: string): Promise<ThreadRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('threads')
            .select([
                'id',
                'profile_id',
                'conversation_id',
                'title',
                'top_level_tab',
                'parent_thread_id',
                'root_thread_id',
                'last_assistant_at',
                'created_at',
                'updated_at',
            ])
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
        scope: 'detached' | 'workspace';
        workspaceFingerprint?: string;
    }> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('sessions')
            .innerJoin('threads', 'threads.id', 'sessions.thread_id')
            .innerJoin('conversations', 'conversations.id', 'threads.conversation_id')
            .select([
                'threads.id as id',
                'threads.profile_id as profile_id',
                'threads.conversation_id as conversation_id',
                'threads.title as title',
                'threads.top_level_tab as top_level_tab',
                'threads.parent_thread_id as parent_thread_id',
                'threads.root_thread_id as root_thread_id',
                'threads.last_assistant_at as last_assistant_at',
                'threads.created_at as created_at',
                'threads.updated_at as updated_at',
                'conversations.scope as scope',
                'conversations.workspace_fingerprint as workspace_fingerprint',
            ])
            .where('sessions.id', '=', sessionId)
            .where('sessions.profile_id', '=', profileId)
            .executeTakeFirst();

        if (!row) {
            return null;
        }

        return {
            thread: mapThreadRecord(row),
            scope: row.scope === 'workspace' ? 'workspace' : 'detached',
            ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        };
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
                'threads.last_assistant_at',
                'threads.created_at',
                'threads.updated_at',
                'conversations.scope',
                'conversations.workspace_fingerprint',
            ]);

        if (!input.showAllModes) {
            query = query.where('threads.top_level_tab', '=', input.activeTab);
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

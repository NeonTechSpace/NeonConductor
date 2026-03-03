import { getPersistence, reseedRuntimeData } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import type { RuntimeResetCounts, RuntimeResetInput, RuntimeResetResult } from '@/app/backend/runtime/contracts';
import { getSecretStore } from '@/app/backend/secrets/store';

import type { Kysely } from 'kysely';

const EMPTY_COUNTS: RuntimeResetCounts = {
    settings: 0,
    runtimeEvents: 0,
    sessions: 0,
    runs: 0,
    permissions: 0,
    conversations: 0,
    threads: 0,
    threadTags: 0,
    tags: 0,
    diffs: 0,
};

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

async function listWorkspaceSessionIds(
    db: Kysely<DatabaseSchema>,
    target: RuntimeResetInput['target'],
    workspaceFingerprint?: string
): Promise<string[]> {
    let query = db.selectFrom('sessions').select('id');

    if (target === 'workspace') {
        query = query.where('workspace_fingerprint', '=', workspaceFingerprint ?? '');
    } else {
        query = query.where('scope', '=', 'workspace');
    }

    const rows = await query.execute();
    return rows.map((row) => row.id);
}

async function listWorkspaceConversationIds(
    db: Kysely<DatabaseSchema>,
    target: RuntimeResetInput['target'],
    workspaceFingerprint?: string
): Promise<string[]> {
    let query = db.selectFrom('conversations').select('id');

    if (target === 'workspace') {
        query = query.where('workspace_fingerprint', '=', workspaceFingerprint ?? '');
    } else {
        query = query.where('scope', '=', 'workspace');
    }

    const rows = await query.execute();
    return rows.map((row) => row.id);
}

async function listThreadIds(db: Kysely<DatabaseSchema>, conversationIds: string[]): Promise<string[]> {
    if (conversationIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('threads').select('id').where('conversation_id', 'in', conversationIds).execute();

    return rows.map((row) => row.id);
}

async function listRunIds(db: Kysely<DatabaseSchema>, sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('runs').select('id').where('session_id', 'in', sessionIds).execute();

    return rows.map((row) => row.id);
}

async function listDiffIds(db: Kysely<DatabaseSchema>, sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('diffs').select('id').where('session_id', 'in', sessionIds).execute();

    return rows.map((row) => row.id);
}

async function listThreadTagIdsToDelete(db: Kysely<DatabaseSchema>, threadIds: string[]): Promise<string[]> {
    if (threadIds.length === 0) {
        return [];
    }

    const rows = await db
        .selectFrom('thread_tags')
        .select('tag_id')
        .distinct()
        .where('thread_id', 'in', threadIds)
        .execute();

    const tagIds = rows.map((row) => row.tag_id);
    const deletableTagIds: string[] = [];

    for (const tagId of tagIds) {
        const nonWorkspaceReferences = await db
            .selectFrom('thread_tags')
            .select('tag_id')
            .where('tag_id', '=', tagId)
            .where((eb) => eb.not(eb('thread_id', 'in', threadIds)))
            .executeTakeFirst();

        if (!nonWorkspaceReferences) {
            deletableTagIds.push(tagId);
        }
    }

    return deletableTagIds;
}

async function countRuntimeEventsForEntityIds(db: Kysely<DatabaseSchema>, entityIds: string[]): Promise<number> {
    if (entityIds.length === 0) {
        return 0;
    }

    const row = await db
        .selectFrom('runtime_events')
        .select((eb) => eb.fn.count<number>('sequence').as('count'))
        .where('entity_id', 'in', entityIds)
        .executeTakeFirst();

    return row?.count ?? 0;
}

async function removeKnownProviderSecrets(): Promise<void> {
    const store = getSecretStore();
    await Promise.allSettled([store.delete('provider/kilo'), store.delete('provider/openai')]);
}

async function resolveWorkspaceCounts(
    db: Kysely<DatabaseSchema>,
    target: 'workspace' | 'workspace_all',
    workspaceFingerprint?: string
): Promise<
    RuntimeResetCounts & {
        sessionIds: string[];
        conversationIds: string[];
        tagIds: string[];
        entityIds: string[];
    }
> {
    const sessionIds = await listWorkspaceSessionIds(db, target, workspaceFingerprint);
    const conversationIds = await listWorkspaceConversationIds(db, target, workspaceFingerprint);
    const threadIds = await listThreadIds(db, conversationIds);
    const runIds = await listRunIds(db, sessionIds);
    const diffIds = await listDiffIds(db, sessionIds);

    const threadTagRows = threadIds.length
        ? await db
              .selectFrom('thread_tags')
              .select(['thread_id', 'tag_id'])
              .where('thread_id', 'in', threadIds)
              .execute()
        : [];

    const tagIds = await listThreadTagIdsToDelete(db, threadIds);
    const entityIds = unique([...sessionIds, ...runIds, ...conversationIds, ...threadIds, ...diffIds, ...tagIds]);

    return {
        settings: 0,
        runtimeEvents: await countRuntimeEventsForEntityIds(db, entityIds),
        sessions: sessionIds.length,
        runs: runIds.length,
        permissions: 0,
        conversations: conversationIds.length,
        threads: threadIds.length,
        threadTags: threadTagRows.length,
        tags: tagIds.length,
        diffs: diffIds.length,
        sessionIds,
        conversationIds,
        tagIds,
        entityIds,
    };
}

async function applyWorkspaceDelete(
    db: Kysely<DatabaseSchema>,
    counts: { sessionIds: string[]; conversationIds: string[]; tagIds: string[]; entityIds: string[] }
): Promise<void> {
    if (counts.entityIds.length > 0) {
        await db.deleteFrom('runtime_events').where('entity_id', 'in', counts.entityIds).execute();
    }

    if (counts.sessionIds.length > 0) {
        await db.deleteFrom('sessions').where('id', 'in', counts.sessionIds).execute();
    }

    if (counts.conversationIds.length > 0) {
        await db.deleteFrom('conversations').where('id', 'in', counts.conversationIds).execute();
    }

    if (counts.tagIds.length > 0) {
        await db.deleteFrom('tags').where('id', 'in', counts.tagIds).execute();
    }
}

export interface RuntimeResetService {
    reset(input: RuntimeResetInput): Promise<RuntimeResetResult>;
}

class RuntimeResetServiceImpl implements RuntimeResetService {
    async reset(input: RuntimeResetInput): Promise<RuntimeResetResult> {
        const { db } = getPersistence();
        const dryRun = input.dryRun ?? false;

        if (input.target === 'workspace' || input.target === 'workspace_all') {
            const countsWithIds = await resolveWorkspaceCounts(db, input.target, input.workspaceFingerprint);
            const counts: RuntimeResetCounts = {
                settings: countsWithIds.settings,
                runtimeEvents: countsWithIds.runtimeEvents,
                sessions: countsWithIds.sessions,
                runs: countsWithIds.runs,
                permissions: countsWithIds.permissions,
                conversations: countsWithIds.conversations,
                threads: countsWithIds.threads,
                threadTags: countsWithIds.threadTags,
                tags: countsWithIds.tags,
                diffs: countsWithIds.diffs,
            };

            if (!dryRun) {
                await applyWorkspaceDelete(db, countsWithIds);
            }

            return {
                dryRun,
                target: input.target,
                applied: !dryRun,
                counts,
            };
        }

        if (input.target === 'profile_settings') {
            const settings = await db
                .selectFrom('settings')
                .select((eb) => eb.fn.count<number>('id').as('count'))
                .where('profile_id', '=', input.profileId ?? '')
                .executeTakeFirst();

            const counts: RuntimeResetCounts = {
                ...EMPTY_COUNTS,
                settings: settings?.count ?? 0,
            };

            if (!dryRun) {
                await db
                    .deleteFrom('settings')
                    .where('profile_id', '=', input.profileId ?? '')
                    .execute();
            }

            return {
                dryRun,
                target: input.target,
                applied: !dryRun,
                counts,
            };
        }

        const counts: RuntimeResetCounts = {
            settings:
                (
                    await db
                        .selectFrom('settings')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            runtimeEvents:
                (
                    await db
                        .selectFrom('runtime_events')
                        .select((eb) => eb.fn.count<number>('sequence').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            sessions:
                (
                    await db
                        .selectFrom('sessions')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            runs:
                (
                    await db
                        .selectFrom('runs')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            permissions:
                (
                    await db
                        .selectFrom('permissions')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            conversations:
                (
                    await db
                        .selectFrom('conversations')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            threads:
                (
                    await db
                        .selectFrom('threads')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            threadTags:
                (
                    await db
                        .selectFrom('thread_tags')
                        .select((eb) => eb.fn.count<number>('thread_id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            tags:
                (
                    await db
                        .selectFrom('tags')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
            diffs:
                (
                    await db
                        .selectFrom('diffs')
                        .select((eb) => eb.fn.count<number>('id').as('count'))
                        .executeTakeFirst()
                )?.count ?? 0,
        };

        if (!dryRun) {
            await db.deleteFrom('runtime_events').execute();
            await db.deleteFrom('permissions').execute();
            await db.deleteFrom('sessions').execute();
            await db.deleteFrom('conversations').execute();
            await db.deleteFrom('tags').execute();
            await db.deleteFrom('settings').execute();
            await db.deleteFrom('provider_models').execute();
            await db.deleteFrom('providers').execute();
            await db.deleteFrom('tools_catalog').execute();
            await db.deleteFrom('mcp_servers').execute();

            reseedRuntimeData();
            await removeKnownProviderSecrets();
        }

        return {
            dryRun,
            target: input.target,
            applied: !dryRun,
            counts,
        };
    }
}

export const runtimeResetService: RuntimeResetService = new RuntimeResetServiceImpl();

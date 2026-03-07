import type { RuntimeResetCounts, RuntimeResetInput } from '@/app/backend/runtime/contracts';
import type {
    PlannedRuntimeResetOperation,
    RuntimeResetDatabase,
} from '@/app/backend/runtime/services/runtimeReset/types';
import { EMPTY_COUNTS } from '@/app/backend/runtime/services/runtimeReset/types';

interface WorkspaceResolvedCounts {
    counts: RuntimeResetCounts;
    sessionIds: string[];
    conversationIds: string[];
    tagIds: string[];
    checkpointIds: string[];
    rulesetIds: string[];
    skillfileIds: string[];
    entityIds: string[];
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

async function listWorkspaceSessionIds(db: RuntimeResetDatabase, conversationIds: string[]): Promise<string[]> {
    if (conversationIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('sessions').select('id').where('conversation_id', 'in', conversationIds).execute();
    return rows.map((row) => row.id);
}

async function listWorkspaceConversationIds(
    db: RuntimeResetDatabase,
    target: Extract<RuntimeResetInput['target'], 'workspace' | 'workspace_all'>,
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

async function listWorkspaceParityIds(
    db: RuntimeResetDatabase,
    table: 'rulesets' | 'skillfiles',
    target: Extract<RuntimeResetInput['target'], 'workspace' | 'workspace_all'>,
    workspaceFingerprint?: string
): Promise<string[]> {
    let query = db.selectFrom(table).select('id');

    if (target === 'workspace') {
        query = query.where('workspace_fingerprint', '=', workspaceFingerprint ?? '');
    } else {
        query = query.where('workspace_fingerprint', 'is not', null);
    }

    const rows = await query.execute();
    return rows.map((row) => row.id);
}

async function listThreadIds(db: RuntimeResetDatabase, conversationIds: string[]): Promise<string[]> {
    if (conversationIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('threads').select('id').where('conversation_id', 'in', conversationIds).execute();
    return rows.map((row) => row.id);
}

async function listRunIds(db: RuntimeResetDatabase, sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('runs').select('id').where('session_id', 'in', sessionIds).execute();
    return rows.map((row) => row.id);
}

async function listDiffIds(db: RuntimeResetDatabase, sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('diffs').select('id').where('session_id', 'in', sessionIds).execute();
    return rows.map((row) => row.id);
}

async function listCheckpointIds(db: RuntimeResetDatabase, sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) {
        return [];
    }

    const rows = await db.selectFrom('checkpoints').select('id').where('session_id', 'in', sessionIds).execute();
    return rows.map((row) => row.id);
}

async function countMessagesBySessionIds(db: RuntimeResetDatabase, sessionIds: string[]): Promise<number> {
    if (sessionIds.length === 0) {
        return 0;
    }

    const row = await db
        .selectFrom('messages')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('session_id', 'in', sessionIds)
        .executeTakeFirst();

    return row?.count ?? 0;
}

async function countMessagePartsBySessionIds(db: RuntimeResetDatabase, sessionIds: string[]): Promise<number> {
    if (sessionIds.length === 0) {
        return 0;
    }

    const row = await db
        .selectFrom('message_parts')
        .innerJoin('messages', 'messages.id', 'message_parts.message_id')
        .select((eb) => eb.fn.count<number>('message_parts.id').as('count'))
        .where('messages.session_id', 'in', sessionIds)
        .executeTakeFirst();

    return row?.count ?? 0;
}

async function countRunUsageByRunIds(db: RuntimeResetDatabase, runIds: string[]): Promise<number> {
    if (runIds.length === 0) {
        return 0;
    }

    const row = await db
        .selectFrom('run_usage')
        .select((eb) => eb.fn.count<number>('run_id').as('count'))
        .where('run_id', 'in', runIds)
        .executeTakeFirst();

    return row?.count ?? 0;
}

async function listThreadTagIdsToDelete(db: RuntimeResetDatabase, threadIds: string[]): Promise<string[]> {
    if (threadIds.length === 0) {
        return [];
    }

    const candidateRows = await db
        .selectFrom('thread_tags')
        .select('tag_id')
        .distinct()
        .where('thread_id', 'in', threadIds)
        .execute();
    const candidateTagIds = candidateRows.map((row) => row.tag_id);

    if (candidateTagIds.length === 0) {
        return [];
    }

    const retainedRows = await db
        .selectFrom('thread_tags')
        .select('tag_id')
        .distinct()
        .where('tag_id', 'in', candidateTagIds)
        .where((eb) => eb.not(eb('thread_id', 'in', threadIds)))
        .execute();
    const retainedTagIds = new Set(retainedRows.map((row) => row.tag_id));

    return candidateTagIds.filter((tagId) => !retainedTagIds.has(tagId));
}

async function countRuntimeEventsForEntityIds(db: RuntimeResetDatabase, entityIds: string[]): Promise<number> {
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

async function resolveWorkspaceCounts(
    db: RuntimeResetDatabase,
    target: Extract<RuntimeResetInput['target'], 'workspace' | 'workspace_all'>,
    workspaceFingerprint?: string
): Promise<WorkspaceResolvedCounts> {
    const conversationIds = await listWorkspaceConversationIds(db, target, workspaceFingerprint);
    const sessionIds = await listWorkspaceSessionIds(db, conversationIds);
    const threadIds = await listThreadIds(db, conversationIds);
    const runIds = await listRunIds(db, sessionIds);
    const diffIds = await listDiffIds(db, sessionIds);
    const checkpointIds = await listCheckpointIds(db, sessionIds);
    const rulesetIds = await listWorkspaceParityIds(db, 'rulesets', target, workspaceFingerprint);
    const skillfileIds = await listWorkspaceParityIds(db, 'skillfiles', target, workspaceFingerprint);

    const threadTagRows = threadIds.length
        ? await db
              .selectFrom('thread_tags')
              .select(['thread_id', 'tag_id'])
              .where('thread_id', 'in', threadIds)
              .execute()
        : [];

    const tagIds = await listThreadTagIdsToDelete(db, threadIds);
    const entityIds = unique([
        ...sessionIds,
        ...runIds,
        ...conversationIds,
        ...threadIds,
        ...diffIds,
        ...checkpointIds,
        ...tagIds,
        ...rulesetIds,
        ...skillfileIds,
    ]);

    return {
        counts: {
            ...EMPTY_COUNTS,
            runtimeEvents: await countRuntimeEventsForEntityIds(db, entityIds),
            sessions: sessionIds.length,
            runs: runIds.length,
            messages: await countMessagesBySessionIds(db, sessionIds),
            messageParts: await countMessagePartsBySessionIds(db, sessionIds),
            runUsage: await countRunUsageByRunIds(db, runIds),
            conversations: conversationIds.length,
            threads: threadIds.length,
            threadTags: threadTagRows.length,
            tags: tagIds.length,
            diffs: diffIds.length,
            checkpoints: checkpointIds.length,
            rulesets: rulesetIds.length,
            skillfiles: skillfileIds.length,
        },
        sessionIds,
        conversationIds,
        tagIds,
        checkpointIds,
        rulesetIds,
        skillfileIds,
        entityIds,
    };
}

async function applyWorkspaceDelete(db: RuntimeResetDatabase, resolved: WorkspaceResolvedCounts): Promise<void> {
    if (resolved.entityIds.length > 0) {
        await db.deleteFrom('runtime_events').where('entity_id', 'in', resolved.entityIds).execute();
    }

    if (resolved.sessionIds.length > 0) {
        await db.deleteFrom('sessions').where('id', 'in', resolved.sessionIds).execute();
    }

    if (resolved.checkpointIds.length > 0) {
        await db.deleteFrom('checkpoints').where('id', 'in', resolved.checkpointIds).execute();
    }

    if (resolved.conversationIds.length > 0) {
        await db.deleteFrom('conversations').where('id', 'in', resolved.conversationIds).execute();
    }

    if (resolved.tagIds.length > 0) {
        await db.deleteFrom('tags').where('id', 'in', resolved.tagIds).execute();
    }

    if (resolved.rulesetIds.length > 0) {
        await db.deleteFrom('rulesets').where('id', 'in', resolved.rulesetIds).execute();
    }

    if (resolved.skillfileIds.length > 0) {
        await db.deleteFrom('skillfiles').where('id', 'in', resolved.skillfileIds).execute();
    }
}

export async function planWorkspaceReset(
    db: RuntimeResetDatabase,
    target: Extract<RuntimeResetInput['target'], 'workspace' | 'workspace_all'>,
    workspaceFingerprint?: string
): Promise<PlannedRuntimeResetOperation> {
    const resolved = await resolveWorkspaceCounts(db, target, workspaceFingerprint);

    return {
        counts: resolved.counts,
        secretKeyRefs: [],
        reseedRuntimeData: false,
        apply: async (applyDb) => {
            await applyWorkspaceDelete(applyDb, resolved);
        },
    };
}

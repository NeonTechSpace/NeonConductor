import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { ConversationRecord, ThreadRecord } from '@/app/backend/persistence/types';
import type { ConversationScope } from '@/app/backend/runtime/contracts';

function createConversationId(): string {
    return `conv_${randomUUID()}`;
}

function createThreadId(): string {
    return `thr_${randomUUID()}`;
}

function mapConversationRecord(row: {
    id: string;
    scope: string;
    workspace_fingerprint: string | null;
    title: string;
    created_at: string;
    updated_at: string;
}): ConversationRecord {
    return {
        id: row.id,
        scope: row.scope as ConversationScope,
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapThreadRecord(row: {
    id: string;
    conversation_id: string;
    title: string;
    created_at: string;
    updated_at: string;
}): ThreadRecord {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class ConversationStore {
    async createConversation(
        scope: ConversationScope,
        title: string,
        workspaceFingerprint?: string
    ): Promise<ConversationRecord> {
        if (scope === 'workspace' && !workspaceFingerprint) {
            throw new Error('workspaceFingerprint is required when creating workspace conversations.');
        }

        if (scope !== 'workspace' && workspaceFingerprint) {
            throw new Error('workspaceFingerprint is allowed only for workspace conversations.');
        }

        const { db } = getPersistence();
        const now = nowIso();

        const inserted = await db
            .insertInto('conversations')
            .values({
                id: createConversationId(),
                scope,
                workspace_fingerprint: workspaceFingerprint ?? null,
                title,
                created_at: now,
                updated_at: now,
            })
            .returning(['id', 'scope', 'workspace_fingerprint', 'title', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return mapConversationRecord(inserted);
    }

    async listConversations(): Promise<ConversationRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('conversations')
            .select(['id', 'scope', 'workspace_fingerprint', 'title', 'created_at', 'updated_at'])
            .orderBy('updated_at', 'desc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapConversationRecord);
    }

    async createThread(conversationId: string, title: string): Promise<ThreadRecord> {
        const { db } = getPersistence();
        const now = nowIso();

        const inserted = await db
            .insertInto('threads')
            .values({
                id: createThreadId(),
                conversation_id: conversationId,
                title,
                created_at: now,
                updated_at: now,
            })
            .returning(['id', 'conversation_id', 'title', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return mapThreadRecord(inserted);
    }

    async listThreads(conversationId?: string): Promise<ThreadRecord[]> {
        const { db } = getPersistence();
        let query = db
            .selectFrom('threads')
            .select(['id', 'conversation_id', 'title', 'created_at', 'updated_at'])
            .orderBy('updated_at', 'desc')
            .orderBy('id', 'asc');

        if (conversationId) {
            query = query.where('conversation_id', '=', conversationId);
        }

        const rows = await query.execute();
        return rows.map(mapThreadRecord);
    }
}

export const conversationStore = new ConversationStore();

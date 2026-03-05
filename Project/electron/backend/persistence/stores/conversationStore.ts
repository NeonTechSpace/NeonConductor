import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { ConversationRecord } from '@/app/backend/persistence/types';
import type { ConversationScope } from '@/app/backend/runtime/contracts';

function createConversationId(): string {
    return `conv_${randomUUID()}`;
}

function defaultConversationTitle(scope: ConversationScope): string {
    return scope === 'workspace' ? 'Workspace' : 'Playground';
}

function mapConversationRecord(row: {
    id: string;
    profile_id: string;
    scope: string;
    workspace_fingerprint: string | null;
    title: string;
    created_at: string;
    updated_at: string;
}): ConversationRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        scope: row.scope as ConversationScope,
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class ConversationStore {
    async findBucketByScope(
        profileId: string,
        scope: ConversationScope,
        workspaceFingerprint?: string
    ): Promise<ConversationRecord | null> {
        if (scope === 'workspace' && !workspaceFingerprint) {
            throw new Error('workspaceFingerprint is required when creating workspace conversations.');
        }

        if (scope !== 'workspace' && workspaceFingerprint) {
            throw new Error('workspaceFingerprint is allowed only for workspace conversations.');
        }

        const { db } = getPersistence();

        const existing = await db
            .selectFrom('conversations')
            .select(['id', 'profile_id', 'scope', 'workspace_fingerprint', 'title', 'created_at', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('scope', '=', scope)
            .where((eb) =>
                workspaceFingerprint
                    ? eb('workspace_fingerprint', '=', workspaceFingerprint)
                    : eb('workspace_fingerprint', 'is', null)
            )
            .orderBy('updated_at', 'desc')
            .orderBy('id', 'asc')
            .executeTakeFirst();

        return existing ? mapConversationRecord(existing) : null;
    }

    async createOrGetBucket(input: {
        profileId: string;
        scope: ConversationScope;
        workspaceFingerprint?: string;
        title?: string;
    }): Promise<ConversationRecord> {
        const existing = await this.findBucketByScope(input.profileId, input.scope, input.workspaceFingerprint);
        if (existing) {
            return existing;
        }

        const { db } = getPersistence();
        const now = nowIso();
        const title = input.title?.trim();

        const inserted = await db
            .insertInto('conversations')
            .values({
                id: createConversationId(),
                profile_id: input.profileId,
                scope: input.scope,
                workspace_fingerprint: input.workspaceFingerprint ?? null,
                title: title && title.length > 0 ? title : defaultConversationTitle(input.scope),
                created_at: now,
                updated_at: now,
            })
            .returning(['id', 'profile_id', 'scope', 'workspace_fingerprint', 'title', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return mapConversationRecord(inserted);
    }

    async listBuckets(profileId: string): Promise<ConversationRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('conversations')
            .select(['id', 'profile_id', 'scope', 'workspace_fingerprint', 'title', 'created_at', 'updated_at'])
            .where('profile_id', '=', profileId)
            .orderBy('scope', 'desc')
            .orderBy('workspace_fingerprint', 'asc')
            .orderBy('updated_at', 'desc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapConversationRecord);
    }

    async getBucketById(profileId: string, conversationId: string): Promise<ConversationRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('conversations')
            .select(['id', 'profile_id', 'scope', 'workspace_fingerprint', 'title', 'created_at', 'updated_at'])
            .where('id', '=', conversationId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();

        return row ? mapConversationRecord(row) : null;
    }
}

export const conversationStore = new ConversationStore();

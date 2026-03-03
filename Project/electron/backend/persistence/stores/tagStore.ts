import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { TagRecord, ThreadTagRecord } from '@/app/backend/persistence/types';

function createTagId(): string {
    return `tag_${randomUUID()}`;
}

function mapTagRecord(row: { id: string; label: string; created_at: string; updated_at: string }): TagRecord {
    return {
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapThreadTagRecord(row: { thread_id: string; tag_id: string; created_at: string }): ThreadTagRecord {
    return {
        threadId: row.thread_id,
        tagId: row.tag_id,
        createdAt: row.created_at,
    };
}

export class TagStore {
    async create(label: string): Promise<TagRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const normalizedLabel = label.trim();

        const existing = await db
            .selectFrom('tags')
            .select(['id', 'label', 'created_at', 'updated_at'])
            .where('label', '=', normalizedLabel)
            .executeTakeFirst();

        if (existing) {
            return mapTagRecord(existing);
        }

        const inserted = await db
            .insertInto('tags')
            .values({
                id: createTagId(),
                label: normalizedLabel,
                created_at: now,
                updated_at: now,
            })
            .returning(['id', 'label', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return mapTagRecord(inserted);
    }

    async list(): Promise<TagRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('tags')
            .select(['id', 'label', 'created_at', 'updated_at'])
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapTagRecord);
    }

    async attachToThread(threadId: string, tagId: string): Promise<ThreadTagRecord> {
        const { db } = getPersistence();
        const now = nowIso();

        const existing = await db
            .selectFrom('thread_tags')
            .select(['thread_id', 'tag_id', 'created_at'])
            .where('thread_id', '=', threadId)
            .where('tag_id', '=', tagId)
            .executeTakeFirst();

        if (existing) {
            return mapThreadTagRecord(existing);
        }

        const inserted = await db
            .insertInto('thread_tags')
            .values({
                thread_id: threadId,
                tag_id: tagId,
                created_at: now,
            })
            .returning(['thread_id', 'tag_id', 'created_at'])
            .executeTakeFirstOrThrow();

        return mapThreadTagRecord(inserted);
    }

    async listThreadTags(): Promise<ThreadTagRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('thread_tags')
            .select(['thread_id', 'tag_id', 'created_at'])
            .orderBy('created_at', 'asc')
            .orderBy('thread_id', 'asc')
            .orderBy('tag_id', 'asc')
            .execute();

        return rows.map(mapThreadTagRecord);
    }
}

export const tagStore = new TagStore();

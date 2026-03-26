import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { TagRecord, ThreadTagRecord } from '@/app/backend/persistence/types';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

function createTagId(): string {
    return `tag_${randomUUID()}`;
}

function mapTagRecord(row: {
    id: string;
    profile_id: string;
    label: string;
    created_at: string;
    updated_at: string;
}): TagRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        label: row.label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapThreadTagRecord(row: {
    profile_id: string;
    thread_id: string;
    tag_id: string;
    created_at: string;
}): ThreadTagRecord {
    return {
        profileId: row.profile_id,
        threadId: row.thread_id,
        tagId: row.tag_id,
        createdAt: row.created_at,
    };
}

export class TagStore {
    async upsert(profileId: string, label: string): Promise<OperationalResult<TagRecord>> {
        const { db } = getPersistence();
        const now = nowIso();
        const normalizedLabel = label.trim();
        if (normalizedLabel.length === 0) {
            return errOp('invalid_input', 'Tag label must be a non-empty string.');
        }

        const existing = await db
            .selectFrom('tags')
            .select(['id', 'profile_id', 'label', 'created_at', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('label', '=', normalizedLabel)
            .executeTakeFirst();

        if (existing) {
            return okOp(mapTagRecord(existing));
        }

        const inserted = await db
            .insertInto('tags')
            .values({
                id: createTagId(),
                profile_id: profileId,
                label: normalizedLabel,
                created_at: now,
                updated_at: now,
            })
            .returning(['id', 'profile_id', 'label', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return okOp(mapTagRecord(inserted));
    }

    async listByProfile(profileId: string): Promise<TagRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('tags')
            .select(['id', 'profile_id', 'label', 'created_at', 'updated_at'])
            .where('profile_id', '=', profileId)
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapTagRecord);
    }

    async listThreadTagsByProfile(profileId: string): Promise<ThreadTagRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('thread_tags')
            .select(['profile_id', 'thread_id', 'tag_id', 'created_at'])
            .where('profile_id', '=', profileId)
            .orderBy('created_at', 'asc')
            .orderBy('thread_id', 'asc')
            .orderBy('tag_id', 'asc')
            .execute();

        return rows.map(mapThreadTagRecord);
    }

    async listThreadTagsByThread(profileId: string, threadId: string): Promise<ThreadTagRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('thread_tags')
            .select(['profile_id', 'thread_id', 'tag_id', 'created_at'])
            .where('profile_id', '=', profileId)
            .where('thread_id', '=', threadId)
            .orderBy('created_at', 'asc')
            .orderBy('tag_id', 'asc')
            .execute();

        return rows.map(mapThreadTagRecord);
    }

    async setThreadTags(
        profileId: string,
        threadId: string,
        tagIds: string[]
    ): Promise<OperationalResult<ThreadTagRecord[]>> {
        const { db } = getPersistence();
        const now = nowIso();
        const dedupedTagIds = [...new Set(tagIds)];

        const thread = await db
            .selectFrom('threads')
            .select('id')
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();
        if (!thread) {
            return errOp('thread_not_found', `Thread "${threadId}" does not exist for profile "${profileId}".`);
        }

        if (dedupedTagIds.length > 0) {
            const tags = await db
                .selectFrom('tags')
                .select('id')
                .where('profile_id', '=', profileId)
                .where('id', 'in', dedupedTagIds)
                .execute();

            if (tags.length !== dedupedTagIds.length) {
                return errOp(
                    'invalid_input',
                    'setThreadTags received one or more tag IDs that are not owned by the target profile.'
                );
            }
        }

        await db
            .deleteFrom('thread_tags')
            .where('profile_id', '=', profileId)
            .where('thread_id', '=', threadId)
            .execute();

        if (dedupedTagIds.length > 0) {
            await db
                .insertInto('thread_tags')
                .values(
                    dedupedTagIds.map((tagId) => ({
                        profile_id: profileId,
                        thread_id: threadId,
                        tag_id: tagId,
                        created_at: now,
                    }))
                )
                .execute();
        }

        return okOp(await this.listThreadTagsByThread(profileId, threadId));
    }
}

export const tagStore = new TagStore();

import { sql, type Kysely } from 'kysely';

import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { EntityId } from '@/app/backend/runtime/contracts';

export interface MemoryRetrievalUsageRecord {
    profileId: string;
    memoryId: EntityId<'mem'>;
    reuseCount: number;
    updatedAt: string;
}

function mapMemoryRetrievalUsageRecord(row: {
    profile_id: string;
    memory_id: string;
    reuse_count: number;
    updated_at: string;
}): MemoryRetrievalUsageRecord {
    return {
        profileId: row.profile_id,
        memoryId: parseEntityId(row.memory_id, 'memory_retrieval_usage_records.memory_id', 'mem'),
        reuseCount: row.reuse_count,
        updatedAt: row.updated_at,
    };
}

export class MemoryRetrievalUsageStore {
    private getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    async incrementMany(input: { profileId: string; memoryIds: EntityId<'mem'>[] }): Promise<void> {
        const timestamp = nowIso();
        for (const memoryId of Array.from(new Set(input.memoryIds))) {
            await this.getDb()
                .insertInto('memory_retrieval_usage_records')
                .values({
                    profile_id: input.profileId,
                    memory_id: memoryId,
                    reuse_count: 1,
                    updated_at: timestamp,
                })
                .onConflict((conflict) =>
                    conflict.columns(['profile_id', 'memory_id']).doUpdateSet({
                        reuse_count: sql<number>`memory_retrieval_usage_records.reuse_count + 1`,
                        updated_at: timestamp,
                    })
                )
                .execute();
        }
    }

    async listByMemoryIds(profileId: string, memoryIds: EntityId<'mem'>[]): Promise<MemoryRetrievalUsageRecord[]> {
        if (memoryIds.length === 0) {
            return [];
        }

        const rows = await this.getDb()
            .selectFrom('memory_retrieval_usage_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('memory_id', 'in', memoryIds)
            .execute();

        return rows.map(mapMemoryRetrievalUsageRecord);
    }
}

export const memoryRetrievalUsageStore = new MemoryRetrievalUsageStore();

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { PermissionRecord } from '@/app/backend/persistence/types';
import type { EntityId, PermissionPolicy } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/contracts';

function mapPermissionRecord(row: {
    id: string;
    policy: string;
    resource: string;
    decision: string;
    rationale: string | null;
    created_at: string;
    updated_at: string;
}): PermissionRecord {
    return {
        id: row.id as EntityId<'perm'>,
        policy: row.policy as PermissionPolicy,
        resource: row.resource,
        decision: row.decision as PermissionRecord['decision'],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.rationale ? { rationale: row.rationale } : {}),
    };
}

export class PermissionStore {
    async create(input: { policy: PermissionPolicy; resource: string; rationale?: string }): Promise<PermissionRecord> {
        const { db } = getPersistence();
        const now = nowIso();

        const inserted = await db
            .insertInto('permissions')
            .values({
                id: createEntityId('perm'),
                policy: input.policy,
                resource: input.resource,
                decision: 'pending',
                rationale: input.rationale ?? null,
                created_at: now,
                updated_at: now,
            })
            .returning(['id', 'policy', 'resource', 'decision', 'rationale', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return mapPermissionRecord(inserted);
    }

    async listPending(): Promise<PermissionRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('permissions')
            .select(['id', 'policy', 'resource', 'decision', 'rationale', 'created_at', 'updated_at'])
            .where('decision', '=', 'pending')
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPermissionRecord);
    }

    async getById(id: string): Promise<PermissionRecord | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('permissions')
            .select(['id', 'policy', 'resource', 'decision', 'rationale', 'created_at', 'updated_at'])
            .where('id', '=', id)
            .executeTakeFirst();

        return row ? mapPermissionRecord(row) : null;
    }

    async setDecision(id: string, decision: 'granted' | 'denied'): Promise<PermissionRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();

        const row = await db
            .updateTable('permissions')
            .set({
                decision,
                updated_at: now,
            })
            .where('id', '=', id)
            .returning(['id', 'policy', 'resource', 'decision', 'rationale', 'created_at', 'updated_at'])
            .executeTakeFirst();

        return row ? mapPermissionRecord(row) : null;
    }

    async listAll(): Promise<PermissionRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('permissions')
            .select(['id', 'policy', 'resource', 'decision', 'rationale', 'created_at', 'updated_at'])
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPermissionRecord);
    }
}

export const permissionStore = new PermissionStore();

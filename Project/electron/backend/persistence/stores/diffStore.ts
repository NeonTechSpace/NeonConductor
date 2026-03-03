import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';
import type { DiffRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';

function createDiffId(): string {
    return `diff_${randomUUID()}`;
}

function mapDiffRecord(row: {
    id: string;
    session_id: string;
    run_id: string | null;
    summary: string;
    payload_json: string;
    created_at: string;
    updated_at: string;
}): DiffRecord {
    return {
        id: row.id,
        sessionId: row.session_id,
        runId: row.run_id,
        summary: row.summary,
        payload: parseJsonValue<Record<string, unknown>>(row.payload_json, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class DiffStore {
    async create(input: {
        sessionId: EntityId<'sess'>;
        runId: EntityId<'run'> | null;
        summary: string;
        payload: Record<string, unknown>;
    }): Promise<DiffRecord> {
        const { db } = getPersistence();
        const now = nowIso();

        const inserted = await db
            .insertInto('diffs')
            .values({
                id: createDiffId(),
                session_id: input.sessionId,
                run_id: input.runId,
                summary: input.summary,
                payload_json: JSON.stringify(input.payload),
                created_at: now,
                updated_at: now,
            })
            .returning(['id', 'session_id', 'run_id', 'summary', 'payload_json', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return mapDiffRecord(inserted);
    }

    async listBySession(sessionId: EntityId<'sess'>): Promise<DiffRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('diffs')
            .select(['id', 'session_id', 'run_id', 'summary', 'payload_json', 'created_at', 'updated_at'])
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapDiffRecord);
    }

    async list(): Promise<DiffRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('diffs')
            .select(['id', 'session_id', 'run_id', 'summary', 'payload_json', 'created_at', 'updated_at'])
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapDiffRecord);
    }
}

export const diffStore = new DiffStore();

import { getPersistence } from '@/app/backend/persistence/db';

export interface RunRecord {
    id: string;
    sessionId: string;
    prompt: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}

function mapRunRecord(row: {
    id: string;
    session_id: string;
    prompt: string;
    status: string;
    created_at: string;
    updated_at: string;
}): RunRecord {
    return {
        id: row.id,
        sessionId: row.session_id,
        prompt: row.prompt,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class RunStore {
    async listBySession(sessionId: string): Promise<RunRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('runs')
            .select(['id', 'session_id', 'prompt', 'status', 'created_at', 'updated_at'])
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapRunRecord);
    }
}

export const runStore = new RunStore();

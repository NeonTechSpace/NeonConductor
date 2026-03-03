import { getPersistence } from '@/app/backend/persistence/db';
import type { ToolRecord } from '@/app/backend/persistence/types';

function mapToolRecord(row: { id: string; label: string; description: string; permission_policy: string }): ToolRecord {
    return {
        id: row.id,
        label: row.label,
        description: row.description,
        permissionPolicy: row.permission_policy as ToolRecord['permissionPolicy'],
    };
}

export class ToolStore {
    async list(): Promise<ToolRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('tools_catalog')
            .select(['id', 'label', 'description', 'permission_policy'])
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapToolRecord);
    }
}

export const toolStore = new ToolStore();

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { McpServerRecord } from '@/app/backend/persistence/types';

function mapMcpRecord(row: {
    id: string;
    label: string;
    auth_mode: string;
    connection_state: string;
    auth_state: string;
}): McpServerRecord {
    return {
        id: row.id,
        label: row.label,
        authMode: row.auth_mode as McpServerRecord['authMode'],
        connectionState: row.connection_state as McpServerRecord['connectionState'],
        authState: row.auth_state as McpServerRecord['authState'],
    };
}

export class McpStore {
    async listServers(): Promise<McpServerRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('mcp_servers')
            .select(['id', 'label', 'auth_mode', 'connection_state', 'auth_state'])
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapMcpRecord);
    }

    async getServer(serverId: string): Promise<McpServerRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('mcp_servers')
            .select(['id', 'label', 'auth_mode', 'connection_state', 'auth_state'])
            .where('id', '=', serverId)
            .executeTakeFirst();

        return row ? mapMcpRecord(row) : null;
    }

    async connect(serverId: string): Promise<McpServerRecord | null> {
        const { db } = getPersistence();

        const existing = await this.getServer(serverId);
        if (!existing) {
            return null;
        }

        const updated = await db
            .updateTable('mcp_servers')
            .set({
                connection_state: 'connected',
                auth_state: existing.authMode === 'none' ? 'authenticated' : existing.authState,
                updated_at: nowIso(),
            })
            .where('id', '=', serverId)
            .returning(['id', 'label', 'auth_mode', 'connection_state', 'auth_state'])
            .executeTakeFirstOrThrow();

        return mapMcpRecord(updated);
    }

    async disconnect(serverId: string): Promise<McpServerRecord | null> {
        const { db } = getPersistence();

        const updated = await db
            .updateTable('mcp_servers')
            .set({
                connection_state: 'disconnected',
                updated_at: nowIso(),
            })
            .where('id', '=', serverId)
            .returning(['id', 'label', 'auth_mode', 'connection_state', 'auth_state'])
            .executeTakeFirst();

        return updated ? mapMcpRecord(updated) : null;
    }
}

export const mcpStore = new McpStore();

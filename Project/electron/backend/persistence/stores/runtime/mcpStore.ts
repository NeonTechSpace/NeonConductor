import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { McpDiscoveredToolRecord, McpServerRecord } from '@/app/backend/persistence/types';
import {
    mcpServerConnectionStates,
    mcpServerToolDiscoveryStates,
    mcpServerTransports,
    mcpServerWorkingDirectoryModes,
    type McpCreateServerInput,
    type McpServerConnectionState,
    type McpServerToolDiscoveryState,
    type McpUpdateServerInput,
} from '@/app/backend/runtime/contracts';

interface McpServerRow {
    id: string;
    label: string;
    transport: string;
    command: string;
    args_json: string;
    working_directory_mode: string;
    fixed_working_directory: string | null;
    timeout_ms: number | null;
    enabled: 0 | 1;
    connection_state: string;
    last_error: string | null;
    connected_at: string | null;
    tool_discovery_state: string;
    updated_at: string;
}

interface McpToolRow {
    server_id: string;
    tool_name: string;
    description: string | null;
    input_schema_json: string;
}

function parseStringArray(value: string): string[] {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
    } catch {
        return [];
    }
}

function mapToolRow(row: McpToolRow): McpDiscoveredToolRecord {
    return {
        name: row.tool_name,
        ...(row.description ? { description: row.description } : {}),
        inputSchema: parseJsonRecord(row.input_schema_json),
    };
}

function mapMcpServerRecord(input: {
    row: McpServerRow;
    tools: McpDiscoveredToolRecord[];
    envKeys: string[];
}): McpServerRecord {
    return {
        id: input.row.id,
        label: input.row.label,
        transport: parseEnumValue(input.row.transport, 'mcp_servers.transport', mcpServerTransports),
        command: input.row.command,
        args: parseStringArray(input.row.args_json),
        workingDirectoryMode: parseEnumValue(
            input.row.working_directory_mode,
            'mcp_servers.working_directory_mode',
            mcpServerWorkingDirectoryModes
        ),
        ...(input.row.fixed_working_directory ? { fixedWorkingDirectory: input.row.fixed_working_directory } : {}),
        ...(input.row.timeout_ms !== null ? { timeoutMs: input.row.timeout_ms } : {}),
        enabled: input.row.enabled === 1,
        connectionState: parseEnumValue(
            input.row.connection_state,
            'mcp_servers.connection_state',
            mcpServerConnectionStates
        ),
        ...(input.row.last_error ? { lastError: input.row.last_error } : {}),
        ...(input.row.connected_at ? { connectedAt: input.row.connected_at } : {}),
        updatedAt: input.row.updated_at,
        toolDiscoveryState: parseEnumValue(
            input.row.tool_discovery_state,
            'mcp_servers.tool_discovery_state',
            mcpServerToolDiscoveryStates
        ),
        tools: input.tools,
        envKeys: input.envKeys,
    };
}

export interface McpServerRuntimeConfig {
    server: McpServerRecord;
    env: Record<string, string>;
}

export class McpStore {
    private async listToolRows(serverId?: string): Promise<McpToolRow[]> {
        const { db } = getPersistence();
        let query = db
            .selectFrom('mcp_server_tools')
            .select(['server_id', 'tool_name', 'description', 'input_schema_json'])
            .orderBy('server_id', 'asc')
            .orderBy('tool_name', 'asc');

        if (serverId) {
            query = query.where('server_id', '=', serverId);
        }

        return query.execute();
    }

    private async listEnvKeys(serverId?: string): Promise<Array<{ server_id: string; env_key: string }>> {
        const { db } = getPersistence();
        let query = db
            .selectFrom('mcp_server_env_secrets')
            .select(['server_id', 'env_key'])
            .orderBy('server_id', 'asc')
            .orderBy('env_key', 'asc');

        if (serverId) {
            query = query.where('server_id', '=', serverId);
        }

        return query.execute();
    }

    private buildToolsByServer(rows: McpToolRow[]): Map<string, McpDiscoveredToolRecord[]> {
        const toolsByServer = new Map<string, McpDiscoveredToolRecord[]>();
        for (const row of rows) {
            const tools = toolsByServer.get(row.server_id) ?? [];
            tools.push(mapToolRow(row));
            toolsByServer.set(row.server_id, tools);
        }
        return toolsByServer;
    }

    private buildEnvKeysByServer(rows: Array<{ server_id: string; env_key: string }>): Map<string, string[]> {
        const envKeysByServer = new Map<string, string[]>();
        for (const row of rows) {
            const keys = envKeysByServer.get(row.server_id) ?? [];
            keys.push(row.env_key);
            envKeysByServer.set(row.server_id, keys);
        }
        return envKeysByServer;
    }

    private async mapRows(rows: McpServerRow[]): Promise<McpServerRecord[]> {
        const serverIds = rows.map((row) => row.id);
        const [toolRows, envRows] = await Promise.all([
            serverIds.length > 0 ? this.listToolRows() : Promise.resolve([]),
            serverIds.length > 0 ? this.listEnvKeys() : Promise.resolve([]),
        ]);
        const toolsByServer = this.buildToolsByServer(toolRows.filter((row) => serverIds.includes(row.server_id)));
        const envKeysByServer = this.buildEnvKeysByServer(envRows.filter((row) => serverIds.includes(row.server_id)));

        return rows.map((row) =>
            mapMcpServerRecord({
                row,
                tools: toolsByServer.get(row.id) ?? [],
                envKeys: envKeysByServer.get(row.id) ?? [],
            })
        );
    }

    async listServers(): Promise<McpServerRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('mcp_servers')
            .select([
                'id',
                'label',
                'transport',
                'command',
                'args_json',
                'working_directory_mode',
                'fixed_working_directory',
                'timeout_ms',
                'enabled',
                'connection_state',
                'last_error',
                'connected_at',
                'tool_discovery_state',
                'updated_at',
            ])
            .orderBy('label', 'asc')
            .execute();

        return this.mapRows(rows);
    }

    async getServer(serverId: string): Promise<McpServerRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('mcp_servers')
            .select([
                'id',
                'label',
                'transport',
                'command',
                'args_json',
                'working_directory_mode',
                'fixed_working_directory',
                'timeout_ms',
                'enabled',
                'connection_state',
                'last_error',
                'connected_at',
                'tool_discovery_state',
                'updated_at',
            ])
            .where('id', '=', serverId)
            .executeTakeFirst();

        if (!row) {
            return null;
        }

        const [toolRows, envRows] = await Promise.all([this.listToolRows(serverId), this.listEnvKeys(serverId)]);
        return mapMcpServerRecord({
            row,
            tools: toolRows.map(mapToolRow),
            envKeys: envRows.map((envRow) => envRow.env_key),
        });
    }

    async getServerRuntimeConfig(serverId: string): Promise<McpServerRuntimeConfig | null> {
        const server = await this.getServer(serverId);
        if (!server) {
            return null;
        }

        const env = await this.getEnvSecrets(serverId);
        return {
            server,
            env,
        };
    }

    async createServer(input: McpCreateServerInput): Promise<McpServerRecord> {
        const { db } = getPersistence();
        const timestamp = nowIso();
        const serverId = `mcp_${randomUUID()}`;

        await db
            .insertInto('mcp_servers')
            .values({
                id: serverId,
                label: input.label,
                transport: 'stdio',
                command: input.command,
                args_json: JSON.stringify(input.args),
                working_directory_mode: input.workingDirectoryMode,
                fixed_working_directory: input.fixedWorkingDirectory ?? null,
                timeout_ms: input.timeoutMs ?? null,
                enabled: input.enabled ? 1 : 0,
                connection_state: 'disconnected',
                last_error: null,
                connected_at: null,
                tool_discovery_state: 'idle',
                created_at: timestamp,
                updated_at: timestamp,
            })
            .execute();

        return (await this.getServer(serverId)) as McpServerRecord;
    }

    async normalizeStartupConnectionState(): Promise<void> {
        const { db } = getPersistence();
        await db
            .updateTable('mcp_servers')
            .set({
                connection_state: 'disconnected',
                connected_at: null,
                updated_at: nowIso(),
            })
            .where('connection_state', 'in', ['connecting', 'connected'])
            .execute();
    }

    async updateServer(input: McpUpdateServerInput): Promise<McpServerRecord | null> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('mcp_servers')
            .set({
                label: input.label,
                command: input.command,
                args_json: JSON.stringify(input.args),
                working_directory_mode: input.workingDirectoryMode,
                fixed_working_directory: input.fixedWorkingDirectory ?? null,
                timeout_ms: input.timeoutMs ?? null,
                enabled: input.enabled ? 1 : 0,
                updated_at: nowIso(),
            })
            .where('id', '=', input.serverId)
            .executeTakeFirst();

        if (Number(updated.numUpdatedRows) === 0) {
            return null;
        }

        return this.getServer(input.serverId);
    }

    async deleteServer(serverId: string): Promise<boolean> {
        const { db } = getPersistence();
        const rows = await db.deleteFrom('mcp_servers').where('id', '=', serverId).returning('id').execute();
        return rows.length > 0;
    }

    async getEnvSecrets(serverId: string): Promise<Record<string, string>> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('mcp_server_env_secrets')
            .select(['env_key', 'secret_value'])
            .where('server_id', '=', serverId)
            .orderBy('env_key', 'asc')
            .execute();

        return Object.fromEntries(rows.map((row) => [row.env_key, row.secret_value]));
    }

    async setEnvSecrets(input: {
        serverId: string;
        values: Array<{ key: string; value: string }>;
        clearKeys?: string[];
    }): Promise<McpServerRecord | null> {
        const { db } = getPersistence();
        const timestamp = nowIso();

        for (const value of input.values) {
            await db
                .insertInto('mcp_server_env_secrets')
                .values({
                    server_id: input.serverId,
                    env_key: value.key,
                    secret_value: value.value,
                    updated_at: timestamp,
                })
                .onConflict((oc) =>
                    oc.columns(['server_id', 'env_key']).doUpdateSet({
                        secret_value: value.value,
                        updated_at: timestamp,
                    })
                )
                .execute();
        }

        if (input.clearKeys && input.clearKeys.length > 0) {
            await db
                .deleteFrom('mcp_server_env_secrets')
                .where('server_id', '=', input.serverId)
                .where('env_key', 'in', input.clearKeys)
                .execute();
        }

        return this.getServer(input.serverId);
    }

    async replaceDiscoveredTools(input: {
        serverId: string;
        tools: McpDiscoveredToolRecord[];
        toolDiscoveryState: McpServerToolDiscoveryState;
        connectionState: McpServerConnectionState;
        lastError?: string;
        connectedAt?: string;
    }): Promise<McpServerRecord | null> {
        const { db } = getPersistence();
        const updatedAt = nowIso();

        await db.deleteFrom('mcp_server_tools').where('server_id', '=', input.serverId).execute();
        for (const tool of input.tools) {
            await db
                .insertInto('mcp_server_tools')
                .values({
                    server_id: input.serverId,
                    tool_name: tool.name,
                    description: tool.description ?? null,
                    input_schema_json: JSON.stringify(tool.inputSchema),
                    updated_at: updatedAt,
                })
                .execute();
        }

        await db
            .updateTable('mcp_servers')
            .set({
                connection_state: input.connectionState,
                tool_discovery_state: input.toolDiscoveryState,
                last_error: input.lastError ?? null,
                connected_at: input.connectedAt ?? null,
                updated_at: updatedAt,
            })
            .where('id', '=', input.serverId)
            .execute();

        return this.getServer(input.serverId);
    }

    async setLifecycleState(input: {
        serverId: string;
        connectionState: McpServerConnectionState;
        toolDiscoveryState?: McpServerToolDiscoveryState;
        lastError?: string;
        connectedAt?: string;
    }): Promise<McpServerRecord | null> {
        const { db } = getPersistence();
        await db
            .updateTable('mcp_servers')
            .set({
                connection_state: input.connectionState,
                ...(input.toolDiscoveryState ? { tool_discovery_state: input.toolDiscoveryState } : {}),
                last_error: input.lastError ?? null,
                connected_at: input.connectedAt ?? null,
                updated_at: nowIso(),
            })
            .where('id', '=', input.serverId)
            .execute();

        return this.getServer(input.serverId);
    }
}

export const mcpStore = new McpStore();

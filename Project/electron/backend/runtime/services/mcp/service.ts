
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { Buffer } from 'node:buffer';

import { mcpStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import type { McpServerRecord } from '@/app/backend/persistence/types';
import type { ProviderRuntimeToolDefinition } from '@/app/backend/providers/types';
import type { McpDiscoveredToolRecord } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

interface LiveMcpConnection {
    client: Client;
    transport: StdioClientTransport;
}

export interface McpResolvedToolDefinition extends ProviderRuntimeToolDefinition {
    serverId: string;
    toolName: string;
    resource: string;
}

function encodeSegment(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeSegment(value: string): string | null {
    try {
        return Buffer.from(value, 'base64url').toString('utf8');
    } catch {
        return null;
    }
}

export function buildMcpRuntimeToolId(serverId: string, toolName: string): string {
    return `mcp__${encodeSegment(serverId)}__${encodeSegment(toolName)}`;
}

export function buildMcpToolResource(serverId: string, toolName: string): string {
    return `mcp:${serverId}:${toolName}`;
}

export function decodeMcpRuntimeToolId(toolId: string): { serverId: string; toolName: string } | null {
    if (!toolId.startsWith('mcp__')) {
        return null;
    }

    const parts = toolId.split('__');
    if (parts.length !== 3) {
        return null;
    }

    const serverId = decodeSegment(parts[1] ?? '');
    const toolName = decodeSegment(parts[2] ?? '');
    if (!serverId || !toolName) {
        return null;
    }

    return {
        serverId,
        toolName,
    };
}

function toRuntimeToolDefinition(server: McpServerRecord, tool: McpDiscoveredToolRecord): McpResolvedToolDefinition {
    return {
        id: buildMcpRuntimeToolId(server.id, tool.name),
        description: tool.description ?? `MCP tool "${tool.name}" from ${server.label}.`,
        inputSchema: tool.inputSchema,
        serverId: server.id,
        toolName: tool.name,
        resource: buildMcpToolResource(server.id, tool.name),
    };
}

function normalizeMcpToolRecords(
    tools: Array<{
        name: string;
        description?: string | undefined;
        inputSchema: Record<string, unknown>;
    }>
): McpDiscoveredToolRecord[] {
    return tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema,
    }));
}

async function closeConnection(connection: LiveMcpConnection | undefined): Promise<void> {
    if (!connection) {
        return;
    }

    try {
        await connection.client.close();
    } catch {
        // Best-effort cleanup for a volatile child process.
    }
}

class McpService {
    private readonly liveConnections = new Map<string, LiveMcpConnection>();
    private startupStateNormalized = false;

    private async ensureStartupStateNormalized(): Promise<void> {
        if (this.startupStateNormalized) {
            return;
        }

        await mcpStore.normalizeStartupConnectionState();
        this.startupStateNormalized = true;
    }

    private async resolveWorkingDirectory(input: {
        profileId: string;
        server: McpServerRecord;
        workspaceFingerprint?: string;
    }): Promise<OperationalResult<string | undefined>> {
        if (input.server.workingDirectoryMode === 'inherit_process') {
            return okOp(undefined);
        }

        if (input.server.workingDirectoryMode === 'fixed_path') {
            return okOp(input.server.fixedWorkingDirectory);
        }

        if (!input.workspaceFingerprint) {
            return errOp(
                'invalid_input',
                `MCP server "${input.server.label}" requires a selected workspace root to connect.`
            );
        }

        const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, input.workspaceFingerprint);
        if (!workspaceRoot) {
            return errOp(
                'not_found',
                `Workspace root "${input.workspaceFingerprint}" could not be resolved for MCP server "${input.server.label}".`
            );
        }

        return okOp(workspaceRoot.absolutePath);
    }

    async listRuntimeTools(): Promise<McpResolvedToolDefinition[]> {
        await this.ensureStartupStateNormalized();
        const servers = await mcpStore.listServers();
        return servers
            .filter(
                (server) =>
                    server.enabled && server.connectionState === 'connected' && server.toolDiscoveryState === 'ready'
            )
            .flatMap((server) => server.tools.map((tool) => toRuntimeToolDefinition(server, tool)));
    }

    async findRuntimeToolById(toolId: string): Promise<McpResolvedToolDefinition | null> {
        const decoded = decodeMcpRuntimeToolId(toolId);
        if (!decoded) {
            return null;
        }

        await this.ensureStartupStateNormalized();
        const server = await mcpStore.getServer(decoded.serverId);
        if (
            !server ||
            !server.enabled ||
            server.connectionState !== 'connected' ||
            server.toolDiscoveryState !== 'ready'
        ) {
            return null;
        }

        const tool = server.tools.find((candidate) => candidate.name === decoded.toolName);
        if (!tool) {
            return null;
        }

        return toRuntimeToolDefinition(server, tool);
    }

    async connect(input: {
        profileId: string;
        serverId: string;
        workspaceFingerprint?: string;
    }): Promise<McpServerRecord | null> {
        await this.ensureStartupStateNormalized();
        const serverConfig = await mcpStore.getServerRuntimeConfig(input.serverId);
        if (!serverConfig) {
            return null;
        }

        await mcpStore.setLifecycleState({
            serverId: input.serverId,
            connectionState: 'connecting',
            toolDiscoveryState: 'discovering',
        });

        await closeConnection(this.liveConnections.get(input.serverId));
        this.liveConnections.delete(input.serverId);

        const client = new Client(
            {
                name: 'NeonConductor',
                version: '0.0.0-alpha',
            },
            {
                capabilities: {},
            }
        );
        let transport: StdioClientTransport | null = null;

        try {
            const cwd = await this.resolveWorkingDirectory({
                profileId: input.profileId,
                server: serverConfig.server,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            });
            if (cwd.isErr()) {
                return await mcpStore.setLifecycleState({
                    serverId: input.serverId,
                    connectionState: 'error',
                    toolDiscoveryState: 'error',
                    lastError: cwd.error.message,
                });
            }
            transport = new StdioClientTransport({
                command: serverConfig.server.command,
                args: serverConfig.server.args,
                ...(Object.keys(serverConfig.env).length > 0 ? { env: serverConfig.env } : {}),
                ...(cwd.value ? { cwd: cwd.value } : {}),
            });
            await client.connect(transport);
            const listed = await client.listTools();
            const tools = normalizeMcpToolRecords(listed.tools);
            this.liveConnections.set(input.serverId, {
                client,
                transport,
            });

            return await mcpStore.replaceDiscoveredTools({
                serverId: input.serverId,
                tools,
                connectionState: 'connected',
                toolDiscoveryState: 'ready',
                connectedAt: new Date().toISOString(),
            });
        } catch (error) {
            if (transport) {
                await closeConnection({ client, transport });
            }
            return await mcpStore.setLifecycleState({
                serverId: input.serverId,
                connectionState: 'error',
                toolDiscoveryState: 'error',
                lastError: error instanceof Error ? error.message : 'Failed to connect MCP server.',
            });
        }
    }

    async disconnect(serverId: string): Promise<McpServerRecord | null> {
        await this.ensureStartupStateNormalized();
        await closeConnection(this.liveConnections.get(serverId));
        this.liveConnections.delete(serverId);
        return mcpStore.setLifecycleState({
            serverId,
            connectionState: 'disconnected',
        });
    }

    async invokeTool(input: {
        toolId: string;
        args: Record<string, unknown>;
    }): Promise<OperationalResult<Record<string, unknown>>> {
        await this.ensureStartupStateNormalized();
        const decoded = decodeMcpRuntimeToolId(input.toolId);
        if (!decoded) {
            return errOp('invalid_input', `Tool "${input.toolId}" is not a valid MCP tool identifier.`);
        }

        const liveConnection = this.liveConnections.get(decoded.serverId);
        if (!liveConnection) {
            return errOp('request_failed', `MCP server "${decoded.serverId}" is not connected.`);
        }

        try {
            const result = await liveConnection.client.callTool(
                {
                    name: decoded.toolName,
                    arguments: input.args,
                },
                CallToolResultSchema
            );

            return okOp({
                content: result.content ?? [],
                ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
                ...(result.isError !== undefined ? { isError: result.isError } : {}),
                ...(result._meta !== undefined ? { meta: result._meta } : {}),
            });
        } catch (error) {
            return errOp('request_failed', error instanceof Error ? error.message : 'MCP tool execution failed.');
        }
    }
}

export const mcpService = new McpService();

import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export const mcpServerTransports = ['stdio'] as const;
export type McpServerTransport = (typeof mcpServerTransports)[number];

export const mcpServerWorkingDirectoryModes = ['inherit_process', 'workspace_root', 'fixed_path'] as const;
export type McpServerWorkingDirectoryMode = (typeof mcpServerWorkingDirectoryModes)[number];

export const mcpServerConnectionStates = ['disconnected', 'connecting', 'connected', 'error'] as const;
export type McpServerConnectionState = (typeof mcpServerConnectionStates)[number];

export const mcpServerToolDiscoveryStates = ['idle', 'discovering', 'ready', 'error'] as const;
export type McpServerToolDiscoveryState = (typeof mcpServerToolDiscoveryStates)[number];

export interface McpDiscoveredToolRecord {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

export interface McpServerRecord {
    id: string;
    label: string;
    transport: McpServerTransport;
    command: string;
    args: string[];
    workingDirectoryMode: McpServerWorkingDirectoryMode;
    fixedWorkingDirectory?: string;
    timeoutMs?: number;
    enabled: boolean;
    connectionState: McpServerConnectionState;
    lastError?: string;
    connectedAt?: string;
    updatedAt: string;
    toolDiscoveryState: McpServerToolDiscoveryState;
    tools: McpDiscoveredToolRecord[];
    envKeys: string[];
}

export interface McpServerUpsertFields {
    label: string;
    command: string;
    args: string[];
    workingDirectoryMode: McpServerWorkingDirectoryMode;
    fixedWorkingDirectory?: string;
    timeoutMs?: number;
    enabled: boolean;
}

export type McpCreateServerInput = McpServerUpsertFields;

export interface McpUpdateServerInput extends McpServerUpsertFields {
    serverId: string;
}

export interface McpDeleteServerInput {
    serverId: string;
}

export interface McpGetServerInput {
    serverId: string;
}

export interface McpConnectInput extends ProfileInput {
    serverId: string;
    workspaceFingerprint?: string;
}

export interface McpDisconnectInput {
    serverId: string;
}

export interface McpEnvSecretInput {
    key: string;
    value: string;
}

export interface McpSetEnvSecretsInput {
    serverId: string;
    values: McpEnvSecretInput[];
    clearKeys?: string[];
}

import {
    createParser,
    readArray,
    readBoolean,
    readEnumValue,
    readObject,
    readOptionalNumber,
    readOptionalString,
    readProfileId,
    readString,
    readStringArray,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import {
    mcpServerWorkingDirectoryModes,
    type McpConnectInput,
    type McpCreateServerInput,
    type McpDeleteServerInput,
    type McpDisconnectInput,
    type McpEnvSecretInput,
    type McpGetServerInput,
    type McpSetEnvSecretsInput,
    type McpUpdateServerInput,
} from '@/app/backend/runtime/contracts/types/mcp';

function readMcpServerUpsertFields(source: Record<string, unknown>, field: string): McpCreateServerInput {
    const workingDirectoryMode = readEnumValue(
        source.workingDirectoryMode,
        `${field}.workingDirectoryMode`,
        mcpServerWorkingDirectoryModes
    );
    const fixedWorkingDirectory = readOptionalString(source.fixedWorkingDirectory, `${field}.fixedWorkingDirectory`);
    if (workingDirectoryMode === 'fixed_path' && !fixedWorkingDirectory) {
        throw new Error(
            `Invalid "${field}.fixedWorkingDirectory": required when workingDirectoryMode is "fixed_path".`
        );
    }
    if (workingDirectoryMode !== 'fixed_path' && fixedWorkingDirectory) {
        throw new Error(
            `Invalid "${field}.fixedWorkingDirectory": only allowed when workingDirectoryMode is "fixed_path".`
        );
    }

    const timeoutMs = readOptionalNumber(source.timeoutMs, `${field}.timeoutMs`);
    if (timeoutMs !== undefined && timeoutMs <= 0) {
        throw new Error(`Invalid "${field}.timeoutMs": expected a positive number.`);
    }

    return {
        label: readString(source.label, `${field}.label`),
        command: readString(source.command, `${field}.command`),
        args: source.args === undefined ? [] : readStringArray(source.args, `${field}.args`),
        workingDirectoryMode,
        ...(fixedWorkingDirectory ? { fixedWorkingDirectory } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        enabled: readBoolean(source.enabled, `${field}.enabled`),
    };
}

function readMcpEnvSecretEntry(value: unknown, field: string): McpEnvSecretInput {
    const source = readObject(value, field);
    return {
        key: readString(source.key, `${field}.key`),
        value: readString(source.value, `${field}.value`),
    };
}

export function parseMcpGetServerInput(input: unknown): McpGetServerInput {
    const source = readObject(input, 'input');
    return {
        serverId: readString(source.serverId, 'serverId'),
    };
}

export function parseMcpCreateServerInput(input: unknown): McpCreateServerInput {
    const source = readObject(input, 'input');
    return readMcpServerUpsertFields(source, 'input');
}

export function parseMcpUpdateServerInput(input: unknown): McpUpdateServerInput {
    const source = readObject(input, 'input');
    return {
        serverId: readString(source.serverId, 'serverId'),
        ...readMcpServerUpsertFields(source, 'input'),
    };
}

export function parseMcpDeleteServerInput(input: unknown): McpDeleteServerInput {
    const source = readObject(input, 'input');
    return {
        serverId: readString(source.serverId, 'serverId'),
    };
}

export function parseMcpConnectInput(input: unknown): McpConnectInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    return {
        profileId: readProfileId(source),
        serverId: readString(source.serverId, 'serverId'),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parseMcpDisconnectInput(input: unknown): McpDisconnectInput {
    const source = readObject(input, 'input');
    return {
        serverId: readString(source.serverId, 'serverId'),
    };
}

export function parseMcpSetEnvSecretsInput(input: unknown): McpSetEnvSecretsInput {
    const source = readObject(input, 'input');
    const values = readArray(source.values, 'values').map((entry, index) =>
        readMcpEnvSecretEntry(entry, `values[${String(index)}]`)
    );
    const clearKeys = source.clearKeys === undefined ? undefined : readStringArray(source.clearKeys, 'clearKeys');

    return {
        serverId: readString(source.serverId, 'serverId'),
        values,
        ...(clearKeys ? { clearKeys } : {}),
    };
}

export const mcpGetServerInputSchema = createParser(parseMcpGetServerInput);
export const mcpCreateServerInputSchema = createParser(parseMcpCreateServerInput);
export const mcpUpdateServerInputSchema = createParser(parseMcpUpdateServerInput);
export const mcpDeleteServerInputSchema = createParser(parseMcpDeleteServerInput);
export const mcpConnectInputSchema = createParser(parseMcpConnectInput);
export const mcpDisconnectInputSchema = createParser(parseMcpDisconnectInput);
export const mcpSetEnvSecretsInputSchema = createParser(parseMcpSetEnvSecretsInput);

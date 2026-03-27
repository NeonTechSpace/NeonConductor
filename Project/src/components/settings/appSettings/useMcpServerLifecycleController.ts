import { parseArgs, parseTimeout, type McpServerDraft } from '@/web/components/settings/appSettings/mcpSection.shared';
import { trpc } from '@/web/trpc/client';

import type { McpServerRecord } from '@/shared/contracts/types/mcp';

export function useMcpServerLifecycleController(input: {
    profileId: string;
    currentWorkspaceFingerprint: string | undefined;
    editorMode: 'create' | 'edit';
    editingServerId: string | undefined;
    draft: McpServerDraft;
    servers: McpServerRecord[];
    onServerCreated: () => void;
    onServerDeleted: (serverId: string) => void;
}) {
    const utils = trpc.useUtils();
    const createServerMutation = trpc.mcp.createServer.useMutation();
    const updateServerMutation = trpc.mcp.updateServer.useMutation();
    const deleteServerMutation = trpc.mcp.deleteServer.useMutation();
    const connectMutation = trpc.mcp.connect.useMutation();
    const disconnectMutation = trpc.mcp.disconnect.useMutation();
    const setEnvSecretsMutation = trpc.mcp.setEnvSecrets.useMutation();

    const selectedServer = input.editingServerId
        ? input.servers.find((server) => server.id === input.editingServerId)
        : undefined;

    async function invalidateMcpQueries() {
        await Promise.all([utils.mcp.listServers.invalidate(), utils.mcp.getServer.invalidate()]);
    }

    async function submitDraft(): Promise<string> {
        const parsedTimeout = parseTimeout(input.draft.timeoutText);
        const payload = {
            label: input.draft.label.trim(),
            command: input.draft.command.trim(),
            args: parseArgs(input.draft.argsText),
            workingDirectoryMode: input.draft.workingDirectoryMode,
            ...(input.draft.workingDirectoryMode === 'fixed_path'
                ? { fixedWorkingDirectory: input.draft.fixedWorkingDirectory.trim() }
                : {}),
            ...(parsedTimeout !== undefined ? { timeoutMs: parsedTimeout } : {}),
            enabled: input.draft.enabled,
        } as const;
        const values = input.draft.envEntries
            .map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
            .filter((entry) => entry.key.length > 0 && entry.value.length > 0);

        if (input.editorMode === 'create') {
            const created = await createServerMutation.mutateAsync(payload);
            if (values.length > 0) {
                await setEnvSecretsMutation.mutateAsync({ serverId: created.server.id, values });
            }
            await invalidateMcpQueries();
            input.onServerCreated();
            return `Created "${created.server.label}".`;
        }

        if (!selectedServer) {
            return 'Selected MCP server no longer exists.';
        }

        const clearKeys = selectedServer.envKeys.filter(
            (existingKey) => !input.draft.envEntries.some((entry) => entry.key.trim() === existingKey)
        );
        const updated = await updateServerMutation.mutateAsync({ serverId: selectedServer.id, ...payload });
        if (!updated.updated) {
            return 'Selected MCP server no longer exists.';
        }
        if (values.length > 0 || clearKeys.length > 0) {
            await setEnvSecretsMutation.mutateAsync({
                serverId: selectedServer.id,
                values,
                ...(clearKeys.length > 0 ? { clearKeys } : {}),
            });
        }
        await invalidateMcpQueries();
        return `Updated "${updated.server.label}".`;
    }

    async function connectServer(server: McpServerRecord): Promise<void> {
        await connectMutation.mutateAsync({
            profileId: input.profileId,
            serverId: server.id,
            ...(input.currentWorkspaceFingerprint ? { workspaceFingerprint: input.currentWorkspaceFingerprint } : {}),
        });
        await invalidateMcpQueries();
    }

    async function disconnectServer(serverId: string): Promise<void> {
        await disconnectMutation.mutateAsync({ serverId });
        await invalidateMcpQueries();
    }

    async function deleteServer(deleteTarget: { id: string; label: string }): Promise<void> {
        await deleteServerMutation.mutateAsync({ serverId: deleteTarget.id });
        await invalidateMcpQueries();
        input.onServerDeleted(deleteTarget.id);
    }

    return {
        submitDraft,
        connectServer,
        disconnectServer,
        deleteServer,
        isBusy:
            createServerMutation.isPending ||
            updateServerMutation.isPending ||
            deleteServerMutation.isPending ||
            connectMutation.isPending ||
            disconnectMutation.isPending ||
            setEnvSecretsMutation.isPending,
        deletePending: deleteServerMutation.isPending,
        errorMessage:
            createServerMutation.error?.message ??
            updateServerMutation.error?.message ??
            deleteServerMutation.error?.message ??
            connectMutation.error?.message ??
            disconnectMutation.error?.message ??
            setEnvSecretsMutation.error?.message,
    };
}

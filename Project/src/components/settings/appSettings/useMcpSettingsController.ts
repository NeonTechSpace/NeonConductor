import { useState } from 'react';

import {
    createDraftFromServer,
    createEmptyDraft,
    parseArgs,
    parseTimeout,
    type McpServerDraft,
} from '@/web/components/settings/appSettings/mcpSection.shared';
import { trpc } from '@/web/trpc/client';

import type { McpServerRecord } from '@/shared/contracts/types/mcp';

interface McpSettingsControllerInput {
    profileId: string;
    currentWorkspaceFingerprint?: string;
}

export function useMcpSettingsController({ profileId, currentWorkspaceFingerprint }: McpSettingsControllerInput) {
    const utils = trpc.useUtils();
    const serversQuery = trpc.mcp.listServers.useQuery();
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [editingServerId, setEditingServerId] = useState<string | undefined>(undefined);
    const [draft, setDraft] = useState<McpServerDraft>(() => createEmptyDraft());
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | undefined>(undefined);

    const servers = serversQuery.data?.servers ?? [];
    const selectedServer = editingServerId ? servers.find((server) => server.id === editingServerId) : undefined;

    async function invalidateMcpQueries() {
        await Promise.all([utils.mcp.listServers.invalidate(), utils.mcp.getServer.invalidate()]);
    }

    function startCreateServerDraft(options?: { preserveStatusMessage?: boolean }) {
        setEditorMode('create');
        setEditingServerId(undefined);
        setDraft(createEmptyDraft());
        if (!options?.preserveStatusMessage) {
            setStatusMessage(undefined);
        }
    }

    function startEditServerDraft(server: McpServerRecord) {
        setEditorMode('edit');
        setEditingServerId(server.id);
        setDraft(createDraftFromServer(server));
        setStatusMessage(undefined);
    }

    const createServerMutation = trpc.mcp.createServer.useMutation();
    const updateServerMutation = trpc.mcp.updateServer.useMutation();
    const deleteServerMutation = trpc.mcp.deleteServer.useMutation();
    const connectMutation = trpc.mcp.connect.useMutation();
    const disconnectMutation = trpc.mcp.disconnect.useMutation();
    const setEnvSecretsMutation = trpc.mcp.setEnvSecrets.useMutation();

    const isBusy =
        createServerMutation.isPending ||
        updateServerMutation.isPending ||
        deleteServerMutation.isPending ||
        connectMutation.isPending ||
        disconnectMutation.isPending ||
        setEnvSecretsMutation.isPending;

    async function submitDraft() {
        try {
            const parsedTimeout = parseTimeout(draft.timeoutText);
            const payload = {
                label: draft.label.trim(),
                command: draft.command.trim(),
                args: parseArgs(draft.argsText),
                workingDirectoryMode: draft.workingDirectoryMode,
                ...(draft.workingDirectoryMode === 'fixed_path'
                    ? { fixedWorkingDirectory: draft.fixedWorkingDirectory.trim() }
                    : {}),
                ...(parsedTimeout !== undefined ? { timeoutMs: parsedTimeout } : {}),
                enabled: draft.enabled,
            } as const;
            const values = draft.envEntries
                .map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
                .filter((entry) => entry.key.length > 0 && entry.value.length > 0);

            if (editorMode === 'create') {
                const created = await createServerMutation.mutateAsync(payload);
                if (values.length > 0) {
                    await setEnvSecretsMutation.mutateAsync({ serverId: created.server.id, values });
                }
                await invalidateMcpQueries();
                startCreateServerDraft({ preserveStatusMessage: true });
                setStatusMessage(`Created "${created.server.label}".`);
                return;
            }

            if (!selectedServer) {
                return;
            }

            const clearKeys = selectedServer.envKeys.filter(
                (existingKey) => !draft.envEntries.some((entry) => entry.key.trim() === existingKey)
            );
            const updated = await updateServerMutation.mutateAsync({ serverId: selectedServer.id, ...payload });
            if (!updated.updated) {
                setStatusMessage('Selected MCP server no longer exists.');
                return;
            }
            if (values.length > 0 || clearKeys.length > 0) {
                await setEnvSecretsMutation.mutateAsync({
                    serverId: selectedServer.id,
                    values,
                    ...(clearKeys.length > 0 ? { clearKeys } : {}),
                });
            }
            await invalidateMcpQueries();
            setStatusMessage(`Updated "${updated.server.label}".`);
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'MCP server could not be saved.');
        }
    }

    async function connectServer(server: McpServerRecord) {
        try {
            await connectMutation.mutateAsync({
                profileId,
                serverId: server.id,
                ...(currentWorkspaceFingerprint ? { workspaceFingerprint: currentWorkspaceFingerprint } : {}),
            });
            await invalidateMcpQueries();
        } catch {
            return;
        }
    }

    async function disconnectServer(serverId: string) {
        try {
            await disconnectMutation.mutateAsync({ serverId });
            await invalidateMcpQueries();
        } catch {
            return;
        }
    }

    async function confirmDeleteServer() {
        if (!deleteTarget) {
            return;
        }

        try {
            await deleteServerMutation.mutateAsync({ serverId: deleteTarget.id });
            await invalidateMcpQueries();
            if (editingServerId === deleteTarget.id) {
                startCreateServerDraft();
            }
            setDeleteTarget(undefined);
        } catch {
            return;
        }
    }

    return {
        servers,
        editorMode,
        draft,
        statusMessage,
        deleteTarget,
        isBusy,
        currentWorkspaceFingerprint,
        deletePending: deleteServerMutation.isPending,
        setDraft,
        setDeleteTarget,
        startCreateServerDraft,
        startEditServerDraft,
        submitDraft,
        connectServer,
        disconnectServer,
        confirmDeleteServer,
    };
}

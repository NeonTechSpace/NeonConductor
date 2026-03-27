import { useState } from 'react';

import { useMcpServerDraftState } from '@/web/components/settings/appSettings/useMcpServerDraftState';
import { useMcpServerLifecycleController } from '@/web/components/settings/appSettings/useMcpServerLifecycleController';
import { trpc } from '@/web/trpc/client';

interface McpSettingsControllerInput {
    profileId: string;
    currentWorkspaceFingerprint?: string;
}

export function useMcpSettingsController({ profileId, currentWorkspaceFingerprint }: McpSettingsControllerInput) {
    const serversQuery = trpc.mcp.listServers.useQuery();
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const servers = serversQuery.data?.servers ?? [];
    const draftState = useMcpServerDraftState();
    const lifecycleController = useMcpServerLifecycleController({
        profileId,
        currentWorkspaceFingerprint,
        editorMode: draftState.state.editorMode,
        editingServerId: draftState.state.editingServerId,
        draft: draftState.state.draft,
        servers,
        onServerCreated: () => {
            draftState.startCreateServerDraft();
        },
        onServerDeleted: (serverId) => {
            if (draftState.state.editingServerId === serverId) {
                draftState.startCreateServerDraft();
            }
            draftState.setDeleteTarget(undefined);
        },
    });

    return {
        servers,
        editorMode: draftState.state.editorMode,
        draft: draftState.state.draft,
        statusMessage: lifecycleController.errorMessage ?? statusMessage,
        deleteTarget: draftState.state.deleteTarget,
        isBusy: lifecycleController.isBusy,
        currentWorkspaceFingerprint,
        deletePending: lifecycleController.deletePending,
        setDraft: draftState.setDraft,
        setDeleteTarget: draftState.setDeleteTarget,
        startCreateServerDraft: () => {
            draftState.startCreateServerDraft();
            setStatusMessage(undefined);
        },
        startEditServerDraft: (server: Parameters<typeof draftState.startEditServerDraft>[0]) => {
            draftState.startEditServerDraft(server);
            setStatusMessage(undefined);
        },
        submitDraft: async () => {
            try {
                setStatusMessage(await lifecycleController.submitDraft());
            } catch (error) {
                setStatusMessage(error instanceof Error ? error.message : 'MCP server could not be saved.');
            }
        },
        connectServer: async (server: Parameters<typeof lifecycleController.connectServer>[0]) => {
            try {
                await lifecycleController.connectServer(server);
                setStatusMessage(undefined);
            } catch {
                return;
            }
        },
        disconnectServer: async (serverId: string) => {
            try {
                await lifecycleController.disconnectServer(serverId);
                setStatusMessage(undefined);
            } catch {
                return;
            }
        },
        confirmDeleteServer: async () => {
            if (!draftState.state.deleteTarget) {
                return;
            }

            try {
                await lifecycleController.deleteServer(draftState.state.deleteTarget);
                setStatusMessage(undefined);
            } catch {
                return;
            }
        },
    };
}

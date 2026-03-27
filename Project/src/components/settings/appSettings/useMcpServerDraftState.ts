import { useState } from 'react';

import { createDraftFromServer, createEmptyDraft, type McpServerDraft } from '@/web/components/settings/appSettings/mcpSection.shared';

import type { McpServerRecord } from '@/shared/contracts/types/mcp';

export interface McpServerDraftState {
    editorMode: 'create' | 'edit';
    editingServerId: string | undefined;
    draft: McpServerDraft;
    deleteTarget: { id: string; label: string } | undefined;
}

export function useMcpServerDraftState() {
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [editingServerId, setEditingServerId] = useState<string | undefined>(undefined);
    const [draft, setDraft] = useState<McpServerDraft>(() => createEmptyDraft());
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | undefined>(undefined);

    return {
        state: {
            editorMode,
            editingServerId,
            draft,
            deleteTarget,
        } satisfies McpServerDraftState,
        setDraft,
        setDeleteTarget,
        startCreateServerDraft: () => {
            setEditorMode('create');
            setEditingServerId(undefined);
            setDraft(createEmptyDraft());
        },
        startEditServerDraft: (server: McpServerRecord) => {
            setEditorMode('edit');
            setEditingServerId(server.id);
            setDraft(createDraftFromServer(server));
        },
    };
}

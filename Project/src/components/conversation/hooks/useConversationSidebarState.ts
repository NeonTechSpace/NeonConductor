import { useState } from 'react';

import type { TopLevelTab } from '@/shared/contracts';

interface CreateThreadInput {
    scope: 'detached' | 'workspace';
    workspacePath?: string;
    title: string;
}

interface UseConversationSidebarStateInput {
    topLevelTab: TopLevelTab;
    isCreatingThread: boolean;
    onCreateThread: (input: CreateThreadInput) => Promise<void>;
}

function modeLabel(topLevelTab: TopLevelTab): string {
    if (topLevelTab === 'chat') {
        return 'Chat';
    }
    if (topLevelTab === 'agent') {
        return 'Agent';
    }
    return 'Orchestrator';
}

export function useConversationSidebarState(input: UseConversationSidebarStateInput) {
    const [newThreadTitle, setNewThreadTitle] = useState('');
    const [newThreadScope, setNewThreadScope] = useState<'detached' | 'workspace'>('detached');
    const [newThreadWorkspace, setNewThreadWorkspace] = useState('');

    async function createThread(): Promise<void> {
        if (input.isCreatingThread) {
            return;
        }

        const generatedTitle =
            newThreadTitle.trim().length > 0
                ? newThreadTitle.trim()
                : `New ${modeLabel(input.topLevelTab).toLowerCase()} thread`;
        if (newThreadScope === 'workspace' && newThreadWorkspace.trim().length === 0) {
            return;
        }
        if (newThreadScope === 'detached' && input.topLevelTab !== 'chat') {
            return;
        }

        await input.onCreateThread({
            scope: newThreadScope,
            title: generatedTitle,
            ...(newThreadScope === 'workspace' && newThreadWorkspace.trim().length > 0
                ? { workspacePath: newThreadWorkspace.trim() }
                : {}),
        });
        setNewThreadTitle('');
    }

    return {
        newThreadTitle,
        setNewThreadTitle,
        newThreadScope,
        setNewThreadScope,
        newThreadWorkspace,
        setNewThreadWorkspace,
        createThread,
    };
}


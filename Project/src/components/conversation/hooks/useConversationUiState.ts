import { useEffect, useState } from 'react';

import type { Dispatch, SetStateAction } from 'react';

type ScopeFilter = 'all' | 'workspace' | 'detached';
type ThreadSort = 'latest' | 'alphabetical';

interface StoredConversationUiState {
    scopeFilter?: ScopeFilter;
    workspaceFilter?: string;
    sort?: ThreadSort;
    selectedThreadId?: string;
    selectedSessionId?: string;
    selectedRunId?: string;
    selectedTagId?: string;
}

export interface ConversationUiState {
    scopeFilter: ScopeFilter;
    workspaceFilter: string | undefined;
    sort: ThreadSort | null;
    selectedThreadId: string | undefined;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    selectedTagId: string | undefined;
    setScopeFilter: Dispatch<SetStateAction<ScopeFilter>>;
    setWorkspaceFilter: Dispatch<SetStateAction<string | undefined>>;
    setSort: Dispatch<SetStateAction<ThreadSort | null>>;
    setSelectedThreadId: Dispatch<SetStateAction<string | undefined>>;
    setSelectedSessionId: Dispatch<SetStateAction<string | undefined>>;
    setSelectedRunId: Dispatch<SetStateAction<string | undefined>>;
    setSelectedTagId: Dispatch<SetStateAction<string | undefined>>;
}

function readStoredState(profileId: string): StoredConversationUiState {
    if (typeof window === 'undefined') {
        return {};
    }

    const key = `neonconductor.conversation.ui.${profileId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return parsed as StoredConversationUiState;
    } catch {
        return {};
    }
}

function persistState(profileId: string, input: StoredConversationUiState): void {
    if (typeof window === 'undefined') {
        return;
    }

    const key = `neonconductor.conversation.ui.${profileId}`;
    window.localStorage.setItem(key, JSON.stringify(input));
}

export function useConversationUiState(profileId: string): ConversationUiState {
    const stored = readStoredState(profileId);

    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(stored.scopeFilter ?? 'all');
    const [workspaceFilter, setWorkspaceFilter] = useState<string | undefined>(stored.workspaceFilter);
    const [sort, setSort] = useState<ThreadSort | null>(stored.sort ?? null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(stored.selectedThreadId);
    const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(stored.selectedSessionId);
    const [selectedRunId, setSelectedRunId] = useState<string | undefined>(stored.selectedRunId);
    const [selectedTagId, setSelectedTagId] = useState<string | undefined>(stored.selectedTagId);
    const [hydratedProfileId, setHydratedProfileId] = useState(profileId);

    useEffect(() => {
        if (profileId === hydratedProfileId) {
            return;
        }

        const nextStored = readStoredState(profileId);
        setScopeFilter(nextStored.scopeFilter ?? 'all');
        setWorkspaceFilter(nextStored.workspaceFilter);
        setSort(nextStored.sort ?? null);
        setSelectedThreadId(nextStored.selectedThreadId);
        setSelectedSessionId(nextStored.selectedSessionId);
        setSelectedRunId(nextStored.selectedRunId);
        setSelectedTagId(nextStored.selectedTagId);
        setHydratedProfileId(profileId);
    }, [hydratedProfileId, profileId]);

    useEffect(() => {
        if (hydratedProfileId !== profileId) {
            return;
        }

        persistState(profileId, {
            scopeFilter,
            ...(workspaceFilter ? { workspaceFilter } : {}),
            ...(sort ? { sort } : {}),
            ...(selectedThreadId ? { selectedThreadId } : {}),
            ...(selectedSessionId ? { selectedSessionId } : {}),
            ...(selectedRunId ? { selectedRunId } : {}),
            ...(selectedTagId ? { selectedTagId } : {}),
        });
    }, [
        profileId,
        scopeFilter,
        workspaceFilter,
        sort,
        selectedThreadId,
        selectedSessionId,
        selectedRunId,
        selectedTagId,
        hydratedProfileId,
    ]);

    return {
        scopeFilter,
        workspaceFilter,
        sort,
        selectedThreadId,
        selectedSessionId,
        selectedRunId,
        selectedTagId,
        setScopeFilter,
        setWorkspaceFilter,
        setSort,
        setSelectedThreadId,
        setSelectedSessionId,
        setSelectedRunId,
        setSelectedTagId,
    };
}

import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';

interface ConversationSyncInput {
    uiState: ConversationUiState;
    threads:
        | {
              sort?: 'latest' | 'alphabetical';
              showAllModes?: boolean;
              groupView?: 'workspace' | 'branch';
              threads: ThreadListRecord[];
          }
        | undefined;
    tags: TagRecord[] | undefined;
    buckets: ConversationRecord[] | undefined;
}

export interface ConversationUiSyncPatch {
    sort?: ConversationUiState['sort'];
    showAllModes?: boolean;
    groupView?: ConversationUiState['groupView'];
    selectedTagIds?: string[];
    workspaceFilter?: string | undefined;
}

export function buildConversationUiSyncPatch(input: ConversationSyncInput): ConversationUiSyncPatch | undefined {
    const patch: ConversationUiSyncPatch = {};

    if (!input.uiState.sort && input.threads?.sort) {
        patch.sort = input.threads.sort;
    }

    if (input.threads?.showAllModes !== undefined && input.uiState.showAllModes !== input.threads.showAllModes) {
        patch.showAllModes = input.threads.showAllModes;
    }

    if (input.threads?.groupView && input.uiState.groupView !== input.threads.groupView) {
        patch.groupView = input.threads.groupView;
    }

    if (input.uiState.selectedTagIds.length > 0) {
        const availableTagIds = new Set((input.tags ?? []).map((tag) => tag.id));
        const nextSelectedTagIds = input.uiState.selectedTagIds.filter((tagId) => availableTagIds.has(tagId));
        if (nextSelectedTagIds.length !== input.uiState.selectedTagIds.length) {
            patch.selectedTagIds = nextSelectedTagIds;
        }
    }

    if (input.uiState.workspaceFilter) {
        const workspaceExists = (input.buckets ?? [])
            .filter((bucket) => bucket.scope === 'workspace')
            .some((bucket) => bucket.workspaceFingerprint === input.uiState.workspaceFilter);
        if (!workspaceExists) {
            patch.workspaceFilter = undefined;
        }
    }

    return Object.keys(patch).length > 0 ? patch : undefined;
}

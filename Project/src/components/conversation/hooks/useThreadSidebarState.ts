import type { ThreadListRecord, ThreadTagRecord } from '@/app/backend/persistence/types';

interface UseThreadSidebarStateInput {
    threads: ThreadListRecord[];
    threadTags: ThreadTagRecord[];
    selectedTagIds: string[];
}

export interface ThreadSidebarState {
    threadTagIdsByThread: Map<string, string[]>;
    visibleThreads: ThreadListRecord[];
}

export interface VisibleThreadSelectionResolution {
    resolvedThreadId: string | undefined;
    shouldSelectFallbackThread: boolean;
    shouldClearSelection: boolean;
}

export function filterThreadsBySelectedTagIds(input: {
    threads: ThreadListRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    selectedTagIds: string[];
}): ThreadListRecord[] {
    if (input.selectedTagIds.length === 0) {
        return input.threads;
    }

    return input.threads.filter((thread) => {
        const tagIds = new Set(input.threadTagIdsByThread.get(thread.id) ?? []);
        return input.selectedTagIds.every((tagId) => tagIds.has(tagId));
    });
}

export function resolveVisibleThreadSelection(input: {
    visibleThreads: ThreadListRecord[];
    selectedThreadId: string | undefined;
}): VisibleThreadSelectionResolution {
    if (input.visibleThreads.length === 0) {
        return {
            resolvedThreadId: undefined,
            shouldSelectFallbackThread: false,
            shouldClearSelection: input.selectedThreadId !== undefined,
        };
    }

    if (input.selectedThreadId && input.visibleThreads.some((thread) => thread.id === input.selectedThreadId)) {
        return {
            resolvedThreadId: input.selectedThreadId,
            shouldSelectFallbackThread: false,
            shouldClearSelection: false,
        };
    }

    return {
        resolvedThreadId: input.visibleThreads[0]?.id,
        shouldSelectFallbackThread: true,
        shouldClearSelection: false,
    };
}

export function useThreadSidebarState(input: UseThreadSidebarStateInput): ThreadSidebarState {
    const threadTagIdsByThread = new Map<string, string[]>();
    for (const relation of input.threadTags) {
        const existing = threadTagIdsByThread.get(relation.threadId) ?? [];
        existing.push(relation.tagId);
        threadTagIdsByThread.set(relation.threadId, existing);
    }

    const visibleThreads = filterThreadsBySelectedTagIds({
        threads: input.threads,
        threadTagIdsByThread,
        selectedTagIds: input.selectedTagIds,
    });

    return {
        threadTagIdsByThread,
        visibleThreads,
    };
}

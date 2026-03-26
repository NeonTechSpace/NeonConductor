import { useSessionRunSelection } from '@/web/components/conversation/hooks/useSessionRunSelection';
import {
    filterThreadsBySelectedTagIds,
    resolveVisibleThreadSelection,
} from '@/web/components/conversation/hooks/useThreadSidebarState';
import { buildConversationSelectionSyncPatch } from '@/web/components/conversation/shell/selectionSync';

import type {
    MessagePartRecord,
    MessageRecord,
    RunRecord,
    SessionSummaryRecord,
    ThreadListRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';

interface UseConversationShellSelectionStateInput {
    threads: ThreadListRecord[];
    threadTags: ThreadTagRecord[];
    selectedTagIds: string[];
    selectedThreadId: string | undefined;
    allSessions: SessionSummaryRecord[];
    allRuns: RunRecord[];
    allMessages: MessageRecord[];
    allMessageParts: MessagePartRecord[];
    selectedSessionId: SessionSummaryRecord['id'] | undefined;
    selectedRunId: RunRecord['id'] | undefined;
}

export interface ShellSelectionState {
    threadTagIdsByThread: Map<string, string[]>;
    visibleThreads: ThreadListRecord[];
    selectedThread: ThreadListRecord | undefined;
    selectedSession: SessionSummaryRecord | undefined;
    selectedRun: RunRecord | undefined;
    selectionSyncPatch:
        | {
              selectedThreadId?: string | undefined;
              selectedSessionId?: string | undefined;
              selectedRunId?: string | undefined;
          }
        | undefined;
    sessionRunSelection: ReturnType<typeof useSessionRunSelection>;
}

export function useConversationShellSelectionState(
    input: UseConversationShellSelectionStateInput
): ShellSelectionState {
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
    const threadSelection = resolveVisibleThreadSelection({
        visibleThreads,
        selectedThreadId: input.selectedThreadId,
    });
    const selectedThread = threadSelection.resolvedThreadId
        ? visibleThreads.find((thread) => thread.id === threadSelection.resolvedThreadId)
        : undefined;
    const sessionRunSelection = useSessionRunSelection({
        allSessions: input.allSessions,
        allRuns: input.allRuns,
        allMessages: input.allMessages,
        allMessageParts: input.allMessageParts,
        selectedThreadId: selectedThread?.id,
        selectedSessionId: input.selectedSessionId,
        selectedRunId: input.selectedRunId,
    });
    const selectedSession = sessionRunSelection.selection.resolvedSessionId
        ? sessionRunSelection.sessions.find((session) => session.id === sessionRunSelection.selection.resolvedSessionId)
        : undefined;
    const selectedRun = sessionRunSelection.selection.resolvedRunId
        ? sessionRunSelection.runs.find((run) => run.id === sessionRunSelection.selection.resolvedRunId)
        : undefined;

    return {
        threadTagIdsByThread,
        visibleThreads,
        selectedThread,
        selectedSession,
        selectedRun,
        selectionSyncPatch: buildConversationSelectionSyncPatch({
            selectedThreadId: input.selectedThreadId,
            threadSelection,
            sessionSelection: sessionRunSelection.selection,
        }),
        sessionRunSelection,
    };
}

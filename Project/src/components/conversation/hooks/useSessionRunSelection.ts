import type {
    MessagePartRecord,
    MessageRecord,
    RunRecord,
    SessionSummaryRecord,
} from '@/app/backend/persistence/types';

interface UseSessionRunSelectionInput {
    allSessions: SessionSummaryRecord[];
    allRuns: RunRecord[];
    allMessages: MessageRecord[];
    allMessageParts: MessagePartRecord[];
    selectedThreadId: string | undefined;
    selectedSessionId: SessionSummaryRecord['id'] | undefined;
    selectedRunId: RunRecord['id'] | undefined;
}

export interface SelectionResolutionState {
    resolvedSessionId: string | undefined;
    resolvedRunId: string | undefined;
    shouldUpdateSessionSelection: boolean;
    shouldUpdateRunSelection: boolean;
}

export interface SessionRunSelectionState {
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    selection: SelectionResolutionState;
}

function resolveSelectedId<TRecord extends { id: string }>(
    records: TRecord[],
    selectedId: TRecord['id'] | undefined
): TRecord['id'] | undefined {
    if (records.length === 0) {
        return undefined;
    }

    if (selectedId && records.some((record) => record.id === selectedId)) {
        return selectedId;
    }

    return records[0]?.id;
}

export function useSessionRunSelection(input: UseSessionRunSelectionInput): SessionRunSelectionState {
    const sessions = !input.selectedThreadId
        ? []
        : input.allSessions
              .filter((session) => session.threadId === input.selectedThreadId)
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const resolvedSessionId = resolveSelectedId(sessions, input.selectedSessionId);

    const runs = !resolvedSessionId
        ? []
        : input.allRuns
              .filter((run) => run.sessionId === resolvedSessionId)
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const resolvedRunId = resolveSelectedId(runs, input.selectedRunId);

    const messages = !resolvedSessionId
        ? []
        : input.allMessages
              .filter((message) => {
                  if (message.sessionId !== resolvedSessionId) {
                      return false;
                  }

                  if (!resolvedRunId) {
                      return true;
                  }

                  return message.runId === resolvedRunId;
              })
              .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const partsByMessageId = new Map<string, MessagePartRecord[]>();
    const selectedMessageIds = new Set(messages.map((message) => message.id));

    for (const part of input.allMessageParts) {
        if (!selectedMessageIds.has(part.messageId)) {
            continue;
        }

        const existing = partsByMessageId.get(part.messageId) ?? [];
        existing.push(part);
        partsByMessageId.set(part.messageId, existing);
    }

    for (const parts of partsByMessageId.values()) {
        parts.sort((left, right) => left.sequence - right.sequence);
    }

    return {
        sessions,
        runs,
        messages,
        partsByMessageId,
        selection: {
            resolvedSessionId,
            resolvedRunId,
            shouldUpdateSessionSelection: resolvedSessionId !== input.selectedSessionId,
            shouldUpdateRunSelection: resolvedRunId !== input.selectedRunId,
        },
    };
}

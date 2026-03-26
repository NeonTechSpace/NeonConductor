import { describe, expect, it } from 'vitest';

import { useSessionRunSelection } from '@/web/components/conversation/hooks/useSessionRunSelection';

import type {
    MessagePartRecord,
    MessageRecord,
    RunRecord,
    SessionSummaryRecord,
} from '@/app/backend/persistence/types';

function createSession(overrides: Partial<SessionSummaryRecord> = {}): SessionSummaryRecord {
    return {
        id: 'sess_default',
        profileId: 'profile_default',
        conversationId: 'conv_default',
        threadId: 'thr_default',
        kind: 'local',
        runStatus: 'completed',
        turnCount: 1,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

function createRun(overrides: Partial<RunRecord> = {}): RunRecord {
    return {
        id: 'run_default',
        sessionId: 'sess_default',
        profileId: 'profile_default',
        prompt: 'Prompt',
        status: 'completed',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

function createMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
    return {
        id: 'msg_default',
        profileId: 'profile_default',
        sessionId: 'sess_default',
        runId: 'run_default',
        role: 'assistant',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

function createMessagePart(overrides: Partial<MessagePartRecord> = {}): MessagePartRecord {
    return {
        id: 'part_default',
        messageId: 'msg_default',
        sequence: 1,
        partType: 'text',
        payload: {},
        createdAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

describe('useSessionRunSelection', () => {
    it('resolves the newest valid session and run when the current selection is stale', () => {
        const result = useSessionRunSelection({
            selectedThreadId: 'thr_primary',
            selectedSessionId: 'sess_missing',
            selectedRunId: 'run_missing',
            allSessions: [
                createSession({
                    id: 'sess_old',
                    threadId: 'thr_primary',
                    updatedAt: '2026-03-10T09:00:00.000Z',
                }),
                createSession({
                    id: 'sess_new',
                    threadId: 'thr_primary',
                    updatedAt: '2026-03-10T11:00:00.000Z',
                }),
                createSession({
                    id: 'sess_other_thread',
                    threadId: 'thr_other',
                    updatedAt: '2026-03-10T12:00:00.000Z',
                }),
            ],
            allRuns: [
                createRun({
                    id: 'run_old',
                    sessionId: 'sess_new',
                    createdAt: '2026-03-10T10:30:00.000Z',
                }),
                createRun({
                    id: 'run_new',
                    sessionId: 'sess_new',
                    createdAt: '2026-03-10T11:30:00.000Z',
                }),
                createRun({
                    id: 'run_other_session',
                    sessionId: 'sess_old',
                    createdAt: '2026-03-10T11:45:00.000Z',
                }),
            ],
            allMessages: [
                createMessage({
                    id: 'msg_second',
                    sessionId: 'sess_new',
                    runId: 'run_new',
                    createdAt: '2026-03-10T11:32:00.000Z',
                }),
                createMessage({
                    id: 'msg_first',
                    sessionId: 'sess_new',
                    runId: 'run_new',
                    createdAt: '2026-03-10T11:31:00.000Z',
                }),
                createMessage({
                    id: 'msg_ignored_run',
                    sessionId: 'sess_new',
                    runId: 'run_old',
                    createdAt: '2026-03-10T11:29:00.000Z',
                }),
            ],
            allMessageParts: [
                createMessagePart({
                    id: 'part_second',
                    messageId: 'msg_first',
                    sequence: 2,
                }),
                createMessagePart({
                    id: 'part_first',
                    messageId: 'msg_first',
                    sequence: 1,
                }),
                createMessagePart({
                    id: 'part_other_message',
                    messageId: 'msg_second',
                    sequence: 1,
                }),
                createMessagePart({
                    id: 'part_ignored',
                    messageId: 'msg_ignored_run',
                    sequence: 1,
                }),
            ],
        });

        expect(result.sessions.map((session) => session.id)).toEqual(['sess_new', 'sess_old']);
        expect(result.runs.map((run) => run.id)).toEqual(['run_new', 'run_old']);
        expect(result.messages.map((message) => message.id)).toEqual(['msg_first', 'msg_second']);
        expect(result.partsByMessageId.get('msg_first')?.map((part) => part.id)).toEqual([
            'part_first',
            'part_second',
        ]);
        expect(result.partsByMessageId.has('msg_ignored_run')).toBe(false);
        expect(result.selection).toEqual({
            resolvedSessionId: 'sess_new',
            resolvedRunId: 'run_new',
            shouldUpdateSessionSelection: true,
            shouldUpdateRunSelection: true,
        });
    });

    it('keeps a valid selection without forcing an update', () => {
        const result = useSessionRunSelection({
            selectedThreadId: 'thr_primary',
            selectedSessionId: 'sess_primary',
            selectedRunId: 'run_primary',
            allSessions: [
                createSession({
                    id: 'sess_primary',
                    threadId: 'thr_primary',
                    updatedAt: '2026-03-10T11:00:00.000Z',
                }),
            ],
            allRuns: [
                createRun({
                    id: 'run_primary',
                    sessionId: 'sess_primary',
                    createdAt: '2026-03-10T11:30:00.000Z',
                }),
            ],
            allMessages: [
                createMessage({
                    id: 'msg_primary',
                    sessionId: 'sess_primary',
                    runId: 'run_primary',
                }),
            ],
            allMessageParts: [
                createMessagePart({
                    id: 'part_primary',
                    messageId: 'msg_primary',
                }),
            ],
        });

        expect(result.selection).toEqual({
            resolvedSessionId: 'sess_primary',
            resolvedRunId: 'run_primary',
            shouldUpdateSessionSelection: false,
            shouldUpdateRunSelection: false,
        });
        expect(result.messages.map((message) => message.id)).toEqual(['msg_primary']);
        expect(result.partsByMessageId.get('msg_primary')?.map((part) => part.id)).toEqual(['part_primary']);
    });

    it('keeps session-scoped messages when the selected session has no runs', () => {
        const result = useSessionRunSelection({
            selectedThreadId: 'thr_primary',
            selectedSessionId: 'sess_primary',
            selectedRunId: undefined,
            allSessions: [
                createSession({
                    id: 'sess_primary',
                    threadId: 'thr_primary',
                }),
            ],
            allRuns: [],
            allMessages: [
                createMessage({
                    id: 'msg_without_run',
                    sessionId: 'sess_primary',
                    runId: 'run_orphaned',
                }),
            ],
            allMessageParts: [
                createMessagePart({
                    id: 'part_without_run',
                    messageId: 'msg_without_run',
                }),
            ],
        });

        expect(result.selection).toEqual({
            resolvedSessionId: 'sess_primary',
            resolvedRunId: undefined,
            shouldUpdateSessionSelection: false,
            shouldUpdateRunSelection: false,
        });
        expect(result.messages.map((message) => message.id)).toEqual(['msg_without_run']);
        expect(result.partsByMessageId.get('msg_without_run')?.map((part) => part.id)).toEqual([
            'part_without_run',
        ]);
    });
});

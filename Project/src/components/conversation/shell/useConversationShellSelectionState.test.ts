import { describe, expect, it } from 'vitest';

import { useConversationShellSelectionState } from '@/web/components/conversation/shell/useConversationShellSelectionState';

import type {
    MessagePartRecord,
    MessageRecord,
    RunRecord,
    SessionSummaryRecord,
    ThreadListRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';

function createThread(overrides: Partial<ThreadListRecord> = {}): ThreadListRecord {
    return {
        id: 'thr_default',
        profileId: 'profile_default',
        conversationId: 'conv_default',
        title: 'Default Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_default',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        scope: 'workspace',
        workspaceFingerprint: 'ws_default',
        anchorKind: 'workspace',
        anchorId: 'ws_default',
        sessionCount: 1,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
        ...overrides,
    };
}

function createSession(overrides: Partial<SessionSummaryRecord> = {}): SessionSummaryRecord {
    return {
        id: 'sess_default',
        profileId: 'profile_default',
        conversationId: 'conv_default',
        threadId: 'thr_default',
        kind: 'local',
        runStatus: 'completed',
        turnCount: 1,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
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
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
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
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
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
        createdAt: '2026-03-20T10:00:00.000Z',
        ...overrides,
    };
}

describe('useConversationShellSelectionState', () => {
    it('repairs stale thread, session, and run selection from one boundary', () => {
        const result = useConversationShellSelectionState({
            threads: [
                createThread({ id: 'thr_primary', updatedAt: '2026-03-20T11:00:00.000Z' }),
                createThread({ id: 'thr_secondary', updatedAt: '2026-03-20T10:00:00.000Z' }),
            ],
            threadTags: [] satisfies ThreadTagRecord[],
            selectedTagIds: [],
            selectedThreadId: 'thr_missing',
            allSessions: [
                createSession({
                    id: 'sess_primary',
                    threadId: 'thr_primary',
                    updatedAt: '2026-03-20T11:00:00.000Z',
                }),
            ],
            allRuns: [
                createRun({
                    id: 'run_primary',
                    sessionId: 'sess_primary',
                    createdAt: '2026-03-20T11:01:00.000Z',
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
            selectedSessionId: 'sess_missing',
            selectedRunId: 'run_missing',
        });

        expect(result.selectedThread?.id).toBe('thr_primary');
        expect(result.selectedSession?.id).toBe('sess_primary');
        expect(result.selectedRun?.id).toBe('run_primary');
        expect(result.selectionSyncPatch).toEqual({
            selectedThreadId: 'thr_primary',
            selectedSessionId: 'sess_primary',
            selectedRunId: 'run_primary',
        });
        expect(result.sessionRunSelection.messages.map((message) => message.id)).toEqual(['msg_primary']);
    });

    it('clears selection when shell filters leave no visible threads', () => {
        const result = useConversationShellSelectionState({
            threads: [createThread({ id: 'thr_primary' })],
            threadTags: [
                {
                    profileId: 'profile_default',
                    threadId: 'thr_primary',
                    tagId: 'tag_existing',
                    createdAt: '2026-03-20T10:00:00.000Z',
                },
            ],
            selectedTagIds: ['tag_missing'],
            selectedThreadId: 'thr_primary',
            allSessions: [
                createSession({
                    id: 'sess_primary',
                    threadId: 'thr_primary',
                }),
            ],
            allRuns: [
                createRun({
                    id: 'run_primary',
                    sessionId: 'sess_primary',
                }),
            ],
            allMessages: [],
            allMessageParts: [],
            selectedSessionId: 'sess_primary',
            selectedRunId: 'run_primary',
        });

        expect(result.visibleThreads).toEqual([]);
        expect(result.selectedThread).toBeUndefined();
        expect(result.selectedSession).toBeUndefined();
        expect(result.selectedRun).toBeUndefined();
        expect(result.selectionSyncPatch).toEqual({
            selectedThreadId: undefined,
            selectedSessionId: undefined,
            selectedRunId: undefined,
        });
    });
});

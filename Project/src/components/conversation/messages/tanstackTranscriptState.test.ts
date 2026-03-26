import { describe, expect, it } from 'vitest';

import {
    applyMessagePartUpsertToTanstackTranscriptState,
    applyRuntimeEventToTanstackTranscriptState,
    hydrateTanstackTranscriptState,
    projectTanstackTranscriptState,
} from '@/web/components/conversation/messages/tanstackTranscriptState';

import type { MessagePartRecord, MessageRecord, RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

function createMessage(input: {
    id: string;
    sessionId?: string;
    runId?: string;
    role: MessageRecord['role'];
    createdAt?: string;
    updatedAt?: string;
}): MessageRecord {
    return {
        id: input.id as MessageRecord['id'],
        profileId: 'profile_test',
        sessionId: (input.sessionId ?? 'sess_test') as MessageRecord['sessionId'],
        runId: (input.runId ?? 'run_test') as MessageRecord['runId'],
        role: input.role,
        createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
        updatedAt: input.updatedAt ?? input.createdAt ?? '2026-01-01T00:00:00.000Z',
    };
}

function createPart(input: {
    id: string;
    messageId: string;
    sequence?: number;
    partType: MessagePartRecord['partType'];
    payload: Record<string, unknown>;
}): MessagePartRecord {
    return {
        id: input.id as MessagePartRecord['id'],
        messageId: input.messageId as MessagePartRecord['messageId'],
        sequence: input.sequence ?? 0,
        partType: input.partType,
        payload: input.payload,
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

function createRuntimeEvent(input: {
    sequence: number;
    domain: RuntimeEventRecordV1['domain'];
    operation: RuntimeEventRecordV1['operation'];
    eventType: string;
    entityType: RuntimeEventRecordV1['entityType'];
    entityId: string;
    payload: Record<string, unknown>;
}): RuntimeEventRecordV1 {
    return {
        sequence: input.sequence,
        eventId: `evt_${String(input.sequence)}`,
        entityType: input.entityType,
        domain: input.domain,
        operation: input.operation,
        entityId: input.entityId,
        eventType: input.eventType,
        payload: input.payload,
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('tanstack transcript state', () => {
    it('hydrates transcript messages from persisted backend state', () => {
        const userMessage = createMessage({ id: 'msg_user', role: 'user' });
        const assistantMessage = createMessage({
            id: 'msg_assistant',
            role: 'assistant',
            createdAt: '2026-01-01T00:00:01.000Z',
        });
        const assistantParts = [
            createPart({
                id: 'part_reasoning',
                messageId: assistantMessage.id,
                partType: 'reasoning_summary',
                payload: { text: 'Reasoning summary' },
            }),
            createPart({
                id: 'part_text',
                messageId: assistantMessage.id,
                sequence: 1,
                partType: 'text',
                payload: { text: 'Assistant reply' },
            }),
        ];

        const state = hydrateTanstackTranscriptState(
            [userMessage, assistantMessage],
            new Map([[assistantMessage.id, assistantParts]])
        );

        const projected = projectTanstackTranscriptState(state);
        expect(projected).toHaveLength(2);
        expect(projected[1]?.renderParts.map((part) => part.kind)).toEqual(['reasoning', 'text']);
        expect(projected[1]?.uiMessage.parts.map((part) => part.type)).toEqual(['thinking', 'text']);
    });

    it('upserts message parts without rebuilding unrelated transcript entries', () => {
        const assistantMessage = createMessage({ id: 'msg_assistant', role: 'assistant' });
        const initialState = hydrateTanstackTranscriptState([assistantMessage], new Map());

        const nextState = applyMessagePartUpsertToTanstackTranscriptState(
            initialState,
            createPart({
                id: 'part_text',
                messageId: assistantMessage.id,
                partType: 'text',
                payload: { text: 'Streaming body' },
            })
        );

        const projected = projectTanstackTranscriptState(nextState);
        expect(projected[0]?.renderParts).toEqual([
            {
                key: 'part_text',
                kind: 'text',
                text: 'Streaming body',
            },
        ]);
    });

    it('applies runtime message and messagePart events for the active session', () => {
        const state = hydrateTanstackTranscriptState([], new Map());
        const assistantMessage = createMessage({ id: 'msg_assistant', role: 'assistant' });

        const afterMessage = applyRuntimeEventToTanstackTranscriptState(
            hydrateTanstackTranscriptState([assistantMessage], new Map()),
            createRuntimeEvent({
                sequence: 1,
                domain: 'messagePart',
                operation: 'upsert',
                entityType: 'messagePart',
                entityId: 'part_text',
                eventType: 'messagePart.upserted',
                payload: {
                    part: createPart({
                        id: 'part_text',
                        messageId: assistantMessage.id,
                        partType: 'text',
                        payload: { text: 'Hello live stream' },
                    }),
                },
            })
        );

        expect(afterMessage).not.toBe('resync');
        const projected = projectTanstackTranscriptState(
            afterMessage as ReturnType<typeof hydrateTanstackTranscriptState>
        );
        expect(projected[0]?.uiMessage.parts).toEqual([
            {
                type: 'text',
                content: 'Hello live stream',
            },
        ]);

        const ignoredState = applyRuntimeEventToTanstackTranscriptState(
            state,
            createRuntimeEvent({
                sequence: 2,
                domain: 'message',
                operation: 'upsert',
                entityType: 'message',
                entityId: 'msg_other',
                eventType: 'message.upserted',
                payload: {
                    message: createMessage({
                        id: 'msg_other',
                        sessionId: 'sess_other',
                        role: 'assistant',
                    }),
                },
            })
        );

        expect(
            projectTanstackTranscriptState(ignoredState as ReturnType<typeof hydrateTanstackTranscriptState>)
        ).toHaveLength(0);
    });

    it('requests a resync for runtime reset events', () => {
        const assistantMessage = createMessage({ id: 'msg_assistant', role: 'assistant' });
        const state = hydrateTanstackTranscriptState([assistantMessage], new Map());

        const nextState = applyRuntimeEventToTanstackTranscriptState(
            state,
            createRuntimeEvent({
                sequence: 10,
                domain: 'runtime',
                operation: 'reset',
                entityType: 'runtime',
                entityId: 'runtime',
                eventType: 'runtime.reset',
                payload: {},
            })
        );

        expect(nextState).toBe('resync');
    });
});

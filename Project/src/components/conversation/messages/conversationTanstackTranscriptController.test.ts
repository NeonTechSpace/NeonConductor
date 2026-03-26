import { describe, expect, it } from 'vitest';

import {
    applyRuntimeEventsToConversationTranscript,
    buildConversationTranscriptBaselineKey,
    projectConversationTranscriptMessages,
} from '@/web/components/conversation/messages/conversationTanstackTranscriptController';
import { hydrateTanstackTranscriptState } from '@/web/components/conversation/messages/tanstackTranscriptState';

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

describe('conversation tanstack transcript controller', () => {
    it('builds a stable baseline key from session and digest', () => {
        const state = hydrateTanstackTranscriptState([createMessage({ id: 'msg_1', role: 'user' })], new Map());

        expect(buildConversationTranscriptBaselineKey(state)).toContain('sess_test');
        expect(buildConversationTranscriptBaselineKey(state)).toContain(state.digest);
    });

    it('applies incremental runtime events without resetting when the sequence is contiguous', () => {
        const assistantMessage = createMessage({ id: 'msg_assistant', role: 'assistant' });
        const baselineState = hydrateTanstackTranscriptState([assistantMessage], new Map());

        const result = applyRuntimeEventsToConversationTranscript({
            currentState: baselineState,
            baselineState,
            lastAppliedSequence: 0,
            runtimeEvents: [
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
                }),
            ],
        });

        expect(result.resetToBaseline).toBe(false);
        expect(result.didChange).toBe(true);
        expect(result.lastAppliedSequence).toBe(1);
        expect(
            projectConversationTranscriptMessages({ transcriptState: result.nextState })[0]?.uiMessage.parts
        ).toEqual([
            {
                type: 'text',
                content: 'Hello live stream',
            },
        ]);
    });

    it('forces a resync when runtime event sequences skip ahead', () => {
        const assistantMessage = createMessage({ id: 'msg_assistant', role: 'assistant' });
        const baselineState = hydrateTanstackTranscriptState([assistantMessage], new Map());

        const result = applyRuntimeEventsToConversationTranscript({
            currentState: baselineState,
            baselineState,
            lastAppliedSequence: 1,
            runtimeEvents: [
                createRuntimeEvent({
                    sequence: 3,
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
                }),
            ],
        });

        expect(result.resetToBaseline).toBe(true);
        expect(result.nextState).toBe(baselineState);
        expect(result.lastAppliedSequence).toBe(3);
    });

    it('appends optimistic user messages only when the optimistic session matches the transcript session', () => {
        const transcriptState = hydrateTanstackTranscriptState(
            [createMessage({ id: 'msg_1', role: 'user' })],
            new Map()
        );

        const matchingMessages = projectConversationTranscriptMessages({
            transcriptState,
            optimisticUserMessage: {
                id: 'optimistic_msg_1',
                runId: 'optimistic_run_1',
                sessionId: 'sess_test',
                createdAt: '2026-03-12T09:00:00.000Z',
                prompt: 'Ship it',
            },
        });
        const mismatchedMessages = projectConversationTranscriptMessages({
            transcriptState,
            optimisticUserMessage: {
                id: 'optimistic_msg_2',
                runId: 'optimistic_run_2',
                sessionId: 'sess_other',
                createdAt: '2026-03-12T09:00:00.000Z',
                prompt: 'Do not append',
            },
        });

        expect(matchingMessages).toHaveLength(2);
        expect(matchingMessages[1]?.deliveryState).toBe('sending');
        expect(mismatchedMessages).toHaveLength(1);
    });
});

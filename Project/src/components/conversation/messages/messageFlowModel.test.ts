import { describe, expect, it } from 'vitest';

import {
    buildMessageFlowTurns,
    isWithinBottomThreshold,
} from '@/web/components/conversation/messages/messageFlowModel';

import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';

function createMessage(input: {
    id: string;
    runId: string;
    role: MessageRecord['role'];
    createdAt?: string;
}): MessageRecord {
    const createdAt = input.createdAt ?? '2026-01-01T00:00:00.000Z';
    return {
        id: input.id as MessageRecord['id'],
        profileId: 'profile_test',
        sessionId: 'sess_test' as MessageRecord['sessionId'],
        runId: input.runId as MessageRecord['runId'],
        role: input.role,
        createdAt,
        updatedAt: createdAt,
    };
}

function createPart(input: {
    id: string;
    messageId: string;
    partType: MessagePartRecord['partType'];
    text?: string;
    payload?: Record<string, unknown>;
    sequence?: number;
}): MessagePartRecord {
    return {
        id: input.id as MessagePartRecord['id'],
        messageId: input.messageId as MessagePartRecord['messageId'],
        sequence: input.sequence ?? 0,
        partType: input.partType,
        payload: input.payload ?? (input.text ? { text: input.text } : {}),
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('message flow model', () => {
    it('groups user and assistant messages into run turns while preserving reasoning parts', () => {
        const firstUser = createMessage({
            id: 'msg_user_1',
            runId: 'run_1',
            role: 'user',
            createdAt: '2026-01-01T00:00:00.000Z',
        });
        const firstAssistant = createMessage({
            id: 'msg_assistant_1',
            runId: 'run_1',
            role: 'assistant',
            createdAt: '2026-01-01T00:00:01.000Z',
        });
        const secondUser = createMessage({
            id: 'msg_user_2',
            runId: 'run_2',
            role: 'user',
            createdAt: '2026-01-01T00:01:00.000Z',
        });

        const turns = buildMessageFlowTurns(
            [firstUser, firstAssistant, secondUser],
            new Map([
                [
                    firstUser.id,
                    [
                        createPart({
                            id: 'part_user_1',
                            messageId: firstUser.id,
                            partType: 'text',
                            text: 'First prompt',
                        }),
                    ],
                ],
                [
                    firstAssistant.id,
                    [
                        createPart({
                            id: 'part_assistant_1',
                            messageId: firstAssistant.id,
                            partType: 'text',
                            text: 'First answer',
                        }),
                        createPart({
                            id: 'part_reasoning_1',
                            messageId: firstAssistant.id,
                            partType: 'reasoning_summary',
                            text: 'Reasoning summary',
                            sequence: 1,
                        }),
                    ],
                ],
                [
                    secondUser.id,
                    [
                        createPart({
                            id: 'part_user_2',
                            messageId: secondUser.id,
                            partType: 'text',
                            text: 'Second prompt',
                        }),
                    ],
                ],
            ])
        );

        expect(turns).toHaveLength(2);
        expect(turns[0]?.messages.map((message) => message.id)).toEqual(['msg_user_1', 'msg_assistant_1']);
        expect(turns[0]?.messages[1]?.body[1]).toMatchObject({
            type: 'assistant_reasoning',
            providerLimitedReasoning: true,
        });
        expect(turns[1]?.messages[0]?.plainCopyText).toBe('Second prompt');
    });

    it('returns true when within the default bottom threshold and false when far away', () => {
        expect(
            isWithinBottomThreshold({
                scrollHeight: 3000,
                scrollTop: 2050,
                clientHeight: 900,
            })
        ).toBe(true);

        expect(
            isWithinBottomThreshold({
                scrollHeight: 3000,
                scrollTop: 1500,
                clientHeight: 900,
            })
        ).toBe(false);
    });
});

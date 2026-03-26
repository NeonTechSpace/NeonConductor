import { describe, expect, it } from 'vitest';

import {
    buildTimelineEntries,
    isWithinBottomThreshold,
} from '@/web/components/conversation/messages/messageTimelineModel';
import { projectConversationTanstackMessages } from '@/web/components/conversation/messages/tanstackMessageBridge';

import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';

function createMessage(input: { id: string; role: MessageRecord['role']; createdAt?: string }): MessageRecord {
    const createdAt = input.createdAt ?? '2026-01-01T00:00:00.000Z';
    return {
        id: input.id as MessageRecord['id'],
        profileId: 'profile_test',
        sessionId: 'sess_test' as MessageRecord['sessionId'],
        runId: 'run_test' as MessageRecord['runId'],
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
}): MessagePartRecord {
    return {
        id: input.id as MessagePartRecord['id'],
        messageId: input.messageId as MessagePartRecord['messageId'],
        sequence: 0,
        partType: input.partType,
        payload: input.payload ?? (input.text ? { text: input.text } : {}),
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('message timeline model', () => {
    it('projects assistant text and reasoning parts while omitting encrypted reasoning', () => {
        const message = createMessage({ id: 'msg_assistant', role: 'assistant' });
        const parts = [
            createPart({
                id: 'part_text',
                messageId: message.id,
                partType: 'text',
                text: ['Answer body', '', '```ts', 'const total = 7', '```'].join('\n'),
            }),
            createPart({ id: 'part_reasoning', messageId: message.id, partType: 'reasoning', text: 'Thinking steps' }),
            createPart({
                id: 'part_summary',
                messageId: message.id,
                partType: 'reasoning_summary',
                text: 'Reasoning summary',
            }),
            createPart({
                id: 'part_encrypted',
                messageId: message.id,
                partType: 'reasoning_encrypted',
                payload: { opaque: 'cipher' },
            }),
        ];

        const entries = buildTimelineEntries(
            projectConversationTanstackMessages([message], new Map([[message.id, parts]]))
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]?.body.map((item) => item.id)).toEqual(['part_text', 'part_reasoning', 'part_summary']);
        expect(entries[0]?.body[2]).toMatchObject({
            type: 'assistant_reasoning',
            providerLimitedReasoning: true,
        });
        expect(entries[0]?.plainCopyText).toContain('const total = 7');
        expect(entries[0]?.rawCopyText).toContain('```ts');
    });

    it('projects user message text parts only', () => {
        const message = createMessage({ id: 'msg_user', role: 'user' });
        const parts = [
            createPart({ id: 'part_user_text', messageId: message.id, partType: 'text', text: 'User prompt' }),
            createPart({ id: 'part_empty', messageId: message.id, partType: 'text', text: '    ' }),
            createPart({ id: 'part_no_text', messageId: message.id, partType: 'text', payload: { notText: true } }),
        ];

        const entries = buildTimelineEntries(
            projectConversationTanstackMessages([message], new Map([[message.id, parts]]))
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]?.body).toHaveLength(1);
        expect(entries[0]?.body[0]).toMatchObject({
            type: 'user_text',
            text: 'User prompt',
        });
        expect(entries[0]?.plainCopyText).toBe('User prompt');
        expect(entries[0]?.rawCopyText).toBe('User prompt');
    });

    it('returns true when within the default bottom threshold and false when far away', () => {
        const nearBottom = isWithinBottomThreshold({
            scrollHeight: 3000,
            scrollTop: 2050,
            clientHeight: 900,
        });
        expect(nearBottom).toBe(true);

        const farFromBottom = isWithinBottomThreshold({
            scrollHeight: 3000,
            scrollTop: 1500,
            clientHeight: 900,
        });
        expect(farFromBottom).toBe(false);
    });

    it('keeps tool-result timeline entries after TanStack projection', () => {
        const message = createMessage({ id: 'msg_tool', role: 'tool' });
        const entries = buildTimelineEntries(
            projectConversationTanstackMessages(
                [message],
                new Map([
                    [
                        message.id,
                        [
                            createPart({
                                id: 'part_tool_result',
                                messageId: message.id,
                                partType: 'tool_result',
                                payload: {
                                    callId: 'call_1',
                                    toolName: 'search_workspace',
                                    outputText: '{"ok":true}',
                                    isError: false,
                                },
                            }),
                        ],
                    ],
                ])
            )
        );

        expect(entries[0]?.role).toBe('tool');
        expect(entries[0]?.body[0]).toMatchObject({
            type: 'tool_result',
            text: '{"ok":true}',
        });
    });

    it('surfaces assistant lifecycle status rows until renderable output arrives', () => {
        const message = createMessage({ id: 'msg_assistant_status', role: 'assistant' });

        const pendingEntries = buildTimelineEntries(
            projectConversationTanstackMessages(
                [message],
                new Map([
                    [
                        message.id,
                        [
                            createPart({
                                id: 'part_received',
                                messageId: message.id,
                                partType: 'status',
                                payload: {
                                    code: 'received',
                                    label: 'Agent received message',
                                },
                            }),
                        ],
                    ],
                ])
            )
        );

        expect(pendingEntries[0]?.body).toEqual([
            {
                id: 'part_received',
                type: 'assistant_status',
                code: 'received',
                label: 'Agent received message',
            },
        ]);

        const streamedEntries = buildTimelineEntries(
            projectConversationTanstackMessages(
                [message],
                new Map([
                    [
                        message.id,
                        [
                            createPart({
                                id: 'part_received',
                                messageId: message.id,
                                partType: 'status',
                                payload: {
                                    code: 'received',
                                    label: 'Agent received message',
                                },
                            }),
                            createPart({
                                id: 'part_text',
                                messageId: message.id,
                                partType: 'text',
                                text: 'Real output',
                            }),
                        ],
                    ],
                ])
            )
        );

        expect(streamedEntries[0]?.body).toEqual([
            {
                id: 'part_text',
                type: 'assistant_text',
                text: 'Real output',
                providerLimitedReasoning: false,
            },
        ]);
    });
});

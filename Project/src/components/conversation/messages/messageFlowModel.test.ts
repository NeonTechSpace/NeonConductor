import { describe, expect, it } from 'vitest';

import {
    buildMessageFlowTurns,
    isWithinBottomThreshold,
} from '@/web/components/conversation/messages/messageFlowModel';
import { projectConversationTanstackMessages } from '@/web/components/conversation/messages/tanstackMessageBridge';

import type { MessagePartRecord, MessageRecord, RunRecord } from '@/app/backend/persistence/types';

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
        sessionId: 'sess_test',
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
            projectConversationTanstackMessages(
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
            )
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

    it('keeps tool-result messages renderable after TanStack projection', () => {
        const toolMessage = createMessage({
            id: 'msg_tool_1',
            runId: 'run_1',
            role: 'tool',
        });

        const turns = buildMessageFlowTurns(
            projectConversationTanstackMessages(
                [toolMessage],
                new Map([
                    [
                        toolMessage.id,
                        [
                            createPart({
                                id: 'part_tool_result_1',
                                messageId: toolMessage.id,
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

        expect(turns[0]?.messages[0]).toMatchObject({
            role: 'tool',
        });
        expect(turns[0]?.messages[0]?.body[0]).toMatchObject({
            type: 'tool_result',
            text: '{"ok":true}',
            messagePartId: 'part_tool_result_1',
            artifactized: false,
            artifactAvailable: false,
        });
    });

    it('keeps artifact metadata on projected tool results', () => {
        const toolMessage = createMessage({
            id: 'msg_tool_artifact',
            runId: 'run_1',
            role: 'tool',
        });

        const turns = buildMessageFlowTurns(
            projectConversationTanstackMessages(
                [toolMessage],
                new Map([
                    [
                        toolMessage.id,
                        [
                            createPart({
                                id: 'part_tool_artifact',
                                messageId: toolMessage.id,
                                partType: 'tool_result',
                                payload: {
                                    callId: 'call_artifact',
                                    toolName: 'run_command',
                                    outputText: 'preview',
                                    isError: false,
                                    artifactized: true,
                                    artifactAvailable: true,
                                    artifactKind: 'command_output',
                                    previewStrategy: 'head_tail',
                                    totalBytes: 4096,
                                    totalLines: 220,
                                    omittedBytes: 3072,
                                    summaryMode: 'utility_ai',
                                    summaryProviderId: 'zai',
                                    summaryModelId: 'zai/glm-4.5-air',
                                },
                            }),
                        ],
                    ],
                ])
            )
        );

        expect(turns[0]?.messages[0]?.body[0]).toMatchObject({
            type: 'tool_result',
            messagePartId: 'part_tool_artifact',
            artifactized: true,
            artifactAvailable: true,
            artifactKind: 'command_output',
            totalBytes: 4096,
            totalLines: 220,
            omittedBytes: 3072,
            summaryMode: 'utility_ai',
            summaryProviderId: 'zai',
            summaryModelId: 'zai/glm-4.5-air',
        });
    });

    it('keeps only the latest assistant lifecycle status before first output and drops it once content exists', () => {
        const assistantMessage = createMessage({
            id: 'msg_assistant_status',
            runId: 'run_status',
            role: 'assistant',
        });

        const pendingTurns = buildMessageFlowTurns(
            projectConversationTanstackMessages(
                [assistantMessage],
                new Map([
                    [
                        assistantMessage.id,
                        [
                            createPart({
                                id: 'part_received',
                                messageId: assistantMessage.id,
                                partType: 'status',
                                payload: {
                                    code: 'received',
                                    label: 'Agent received message',
                                },
                            }),
                            createPart({
                                id: 'part_stalled',
                                messageId: assistantMessage.id,
                                partType: 'status',
                                payload: {
                                    code: 'stalled',
                                    label: 'Still waiting for the first response chunk...',
                                },
                                sequence: 1,
                            }),
                        ],
                    ],
                ])
            )
        );

        expect(pendingTurns[0]?.messages[0]?.body).toEqual([
            {
                id: 'part_stalled',
                workbenchItemId: 'msg_assistant_status:part_stalled:status',
                type: 'assistant_status',
                code: 'stalled',
                label: 'Still waiting for the first response chunk...',
                status: 'pending',
                severity: 'warning',
                icon: 'activity',
                title: 'Still waiting for the first response chunk...',
                defaultCollapsed: false,
                summary: 'Still waiting for the first response chunk...',
            },
        ]);

        const streamedTurns = buildMessageFlowTurns(
            projectConversationTanstackMessages(
                [assistantMessage],
                new Map([
                    [
                        assistantMessage.id,
                        [
                            createPart({
                                id: 'part_received',
                                messageId: assistantMessage.id,
                                partType: 'status',
                                payload: {
                                    code: 'received',
                                    label: 'Agent received message',
                                },
                            }),
                            createPart({
                                id: 'part_text',
                                messageId: assistantMessage.id,
                                partType: 'text',
                                text: 'Streaming answer',
                                sequence: 1,
                            }),
                        ],
                    ],
                ])
            )
        );

        expect(streamedTurns[0]?.messages[0]?.body).toEqual([
            {
                id: 'part_text',
                type: 'assistant_text',
                text: 'Streaming answer',
                providerLimitedReasoning: false,
            },
        ]);
    });

    it('adds selected-run context rows without creating synthetic messages', () => {
        const userMessage = createMessage({
            id: 'msg_user_context',
            runId: 'run_context',
            role: 'user',
        });
        const run = {
            id: 'run_context',
            sessionId: 'sess_test',
            profileId: 'profile_test',
            prompt: 'Do context work',
            status: 'running',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:01.000Z',
        } as RunRecord;

        const turns = buildMessageFlowTurns(
            projectConversationTanstackMessages(
                [userMessage],
                new Map([
                    [
                        userMessage.id,
                        [
                            createPart({
                                id: 'part_user_context',
                                messageId: userMessage.id,
                                partType: 'text',
                                text: 'Do context work',
                            }),
                        ],
                    ],
                ])
            ),
            {
                runs: [run],
                selectedRunId: run.id,
            }
        );

        expect(turns).toHaveLength(1);
        expect(turns[0]?.messages).toHaveLength(1);
        expect(turns[0]?.timelineItems).toEqual([
            expect.objectContaining({
                kind: 'run_state',
                status: 'running',
                title: 'Run running',
            }),
        ]);
    });
});

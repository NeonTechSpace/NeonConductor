import { describe, expect, it } from 'vitest';

import {
    projectConversationTanstackMessages,
    projectOptimisticConversationUserMessage,
} from '@/web/components/conversation/messages/tanstackMessageBridge';

import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';

function createMessage(input: {
    id: string;
    role: MessageRecord['role'];
    runId?: string;
    createdAt?: string;
}): MessageRecord {
    const createdAt = input.createdAt ?? '2026-01-01T00:00:00.000Z';

    return {
        id: input.id as MessageRecord['id'],
        profileId: 'profile_test',
        sessionId: 'sess_test' as MessageRecord['sessionId'],
        runId: (input.runId ?? 'run_test') as MessageRecord['runId'],
        role: input.role,
        createdAt,
        updatedAt: createdAt,
    };
}

function createPart(input: {
    id: string;
    messageId: string;
    partType: MessagePartRecord['partType'];
    payload: Record<string, unknown>;
    sequence?: number;
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

describe('tanstack message bridge', () => {
    it('projects backend reasoning, tool calls, and tool results into TanStack-friendly ui messages', () => {
        const assistantMessage = createMessage({ id: 'msg_assistant', role: 'assistant' });
        const toolMessage = createMessage({ id: 'msg_tool', role: 'tool' });

        const projected = projectConversationTanstackMessages(
            [assistantMessage, toolMessage],
            new Map([
                [
                    assistantMessage.id,
                    [
                        createPart({
                            id: 'part_reasoning',
                            messageId: assistantMessage.id,
                            partType: 'reasoning_summary',
                            payload: { text: 'Reasoning summary' },
                        }),
                        createPart({
                            id: 'part_text',
                            messageId: assistantMessage.id,
                            partType: 'text',
                            payload: { text: 'Assistant answer' },
                        }),
                        createPart({
                            id: 'part_tool_call',
                            messageId: assistantMessage.id,
                            partType: 'tool_call',
                            payload: {
                                callId: 'call_1',
                                toolName: 'search_workspace',
                                argumentsText: '{"query":"tanstack"}',
                            },
                        }),
                    ],
                ],
                [
                    toolMessage.id,
                    [
                        createPart({
                            id: 'part_tool_result',
                            messageId: toolMessage.id,
                            partType: 'tool_result',
                            payload: {
                                callId: 'call_1',
                                toolName: 'search_workspace',
                                outputText: '{"ok":true}',
                                isError: false,
                                artifactized: true,
                                artifactAvailable: true,
                                artifactKind: 'command_output',
                                previewStrategy: 'head_tail',
                                totalBytes: 2048,
                                totalLines: 120,
                                omittedBytes: 1024,
                                summaryMode: 'utility_ai',
                                summaryProviderId: 'zai',
                                summaryModelId: 'zai/glm-4.5-air',
                            },
                        }),
                    ],
                ],
            ])
        );

        expect(projected[0]?.uiMessage.role).toBe('assistant');
        expect(projected[0]?.uiMessage.parts.map((part) => part.type)).toEqual(['thinking', 'text', 'tool-call']);
        expect(projected[1]?.role).toBe('tool');
        expect(projected[1]?.uiMessage.role).toBe('assistant');
        expect(projected[1]?.uiMessage.parts[0]).toMatchObject({
            type: 'tool-result',
            toolCallId: 'call_1',
            content: '{"ok":true}',
            state: 'complete',
        });
        expect(projected[1]?.renderParts[0]).toMatchObject({
            kind: 'tool_result',
            messagePartId: 'part_tool_result',
            toolName: 'search_workspace',
            artifactized: true,
            artifactAvailable: true,
            artifactKind: 'command_output',
            previewStrategy: 'head_tail',
            totalBytes: 2048,
            totalLines: 120,
            omittedBytes: 1024,
            summaryMode: 'utility_ai',
            summaryProviderId: 'zai',
            summaryModelId: 'zai/glm-4.5-air',
        });
    });

    it('parses assistant lifecycle status parts for transcript rendering', () => {
        const assistantMessage = createMessage({ id: 'msg_assistant_status', role: 'assistant' });

        const projected = projectConversationTanstackMessages(
            [assistantMessage],
            new Map([
                [
                    assistantMessage.id,
                    [
                        createPart({
                            id: 'part_status',
                            messageId: assistantMessage.id,
                            partType: 'status',
                            payload: {
                                code: 'received',
                                label: 'Agent received message',
                            },
                        }),
                    ],
                ],
            ])
        );

        expect(projected[0]?.renderParts).toEqual([
            {
                key: 'part_status',
                kind: 'status',
                code: 'received',
                label: 'Agent received message',
            },
        ]);
        expect(projected[0]?.uiMessage.parts).toEqual([]);
    });

    it('projects external context capture message parts as user-visible text', () => {
        const userMessage = createMessage({ id: 'msg_user_external', role: 'user' });

        const projected = projectConversationTanstackMessages(
            [userMessage],
            new Map([
                [
                    userMessage.id,
                    [
                        createPart({
                            id: 'part_external',
                            messageId: userMessage.id,
                            partType: 'external_context_capture',
                            payload: {
                                sourceLabel: 'Build log excerpt',
                                sourceType: 'log_excerpt',
                                text: 'failed test output',
                            },
                        }),
                    ],
                ],
            ])
        );

        expect(projected[0]?.uiMessage.parts).toEqual([
            {
                type: 'text',
                content: 'External context capture: Build log excerpt\nSource type: log excerpt\n\nfailed test output',
            },
        ]);
    });

    it('projects optimistic user messages with a sending delivery state', () => {
        const projected = projectOptimisticConversationUserMessage({
            id: 'optimistic_msg_1',
            runId: 'optimistic_run_1',
            sessionId: 'sess_test',
            createdAt: '2026-03-12T09:00:00.000Z',
            prompt: 'Ship it',
        });

        expect(projected.role).toBe('user');
        expect(projected.deliveryState).toBe('sending');
        expect(projected.isOptimistic).toBe(true);
        expect(projected.uiMessage.parts).toEqual([{ type: 'text', content: 'Ship it' }]);
    });
});

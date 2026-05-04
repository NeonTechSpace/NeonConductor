import { describe, expect, it } from 'vitest';

import { projectConversationTanstackMessages } from '@/web/components/conversation/messages/tanstackMessageBridge';
import {
    buildWorkbenchTimelineItems,
    buildWorkbenchTimelineMessages,
    workbenchTimelineItemKinds,
} from '@/web/components/conversation/messages/workbenchTimelineModel';

import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';

function createMessage(input: {
    id: string;
    runId?: string;
    role: MessageRecord['role'];
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

function project(input: { messages: MessageRecord[]; partsByMessageId: Map<string, MessagePartRecord[]> }) {
    return buildWorkbenchTimelineMessages(projectConversationTanstackMessages(input.messages, input.partsByMessageId));
}

describe('workbench timeline model', () => {
    it('projects message text, reasoning, and tool calls into stable typed items', () => {
        const assistant = createMessage({ id: 'msg_assistant', role: 'assistant' });
        const messages = project({
            messages: [assistant],
            partsByMessageId: new Map([
                [
                    assistant.id,
                    [
                        createPart({
                            id: 'part_text',
                            messageId: assistant.id,
                            partType: 'text',
                            text: 'Answer body',
                        }),
                        createPart({
                            id: 'part_reasoning',
                            messageId: assistant.id,
                            partType: 'reasoning_summary',
                            text: 'Reasoning summary',
                            sequence: 1,
                        }),
                        createPart({
                            id: 'part_call',
                            messageId: assistant.id,
                            partType: 'tool_call',
                            payload: {
                                callId: 'call_1',
                                toolName: 'read_file',
                                argumentsText: '{"path":"README.md"}',
                            },
                            sequence: 2,
                        }),
                    ],
                ],
            ]),
        });

        expect(messages[0]?.items.map((item) => item.kind)).toEqual(['message', 'reasoning', 'tool_call']);
        expect(messages[0]?.items[0]).toMatchObject({
            id: 'msg_assistant:part_text:message',
            status: 'completed',
            severity: 'neutral',
            icon: 'message',
            title: 'Assistant message',
            defaultCollapsed: false,
        });
        expect(messages[0]?.items[1]).toMatchObject({
            kind: 'reasoning',
            providerLimitedReasoning: true,
            defaultCollapsed: true,
            summary: 'Reasoning summary',
        });
        expect(messages[0]?.items[2]).toMatchObject({
            kind: 'tool_call',
            toolName: 'read_file',
            argumentsText: '{"path":"README.md"}',
            defaultCollapsed: true,
        });
    });

    it('projects status rows and failed-before-output as an error row only until renderable output exists', () => {
        const pendingAssistant = createMessage({ id: 'msg_pending', role: 'assistant' });
        const failedAssistant = createMessage({ id: 'msg_failed', role: 'assistant', runId: 'run_failed' });

        const messages = project({
            messages: [pendingAssistant, failedAssistant],
            partsByMessageId: new Map([
                [
                    pendingAssistant.id,
                    [
                        createPart({
                            id: 'part_received',
                            messageId: pendingAssistant.id,
                            partType: 'status',
                            payload: { code: 'received', label: 'Agent received message' },
                        }),
                        createPart({
                            id: 'part_text',
                            messageId: pendingAssistant.id,
                            partType: 'text',
                            text: 'Real output',
                            sequence: 1,
                        }),
                    ],
                ],
                [
                    failedAssistant.id,
                    [
                        createPart({
                            id: 'part_failed',
                            messageId: failedAssistant.id,
                            partType: 'status',
                            payload: {
                                code: 'failed_before_output',
                                label: 'Run failed before output',
                                elapsedMs: 250,
                            },
                        }),
                    ],
                ],
            ]),
        });

        expect(messages[0]?.items).toHaveLength(1);
        expect(messages[0]?.items[0]).toMatchObject({ kind: 'message', text: 'Real output' });
        expect(messages[1]?.items).toEqual([
            expect.objectContaining({
                id: 'msg_failed:part_failed:error',
                kind: 'error',
                status: 'failed',
                severity: 'error',
                defaultCollapsed: false,
                label: 'Run failed before output',
                elapsedMs: 250,
            }),
        ]);
    });

    it('classifies command output separately from other artifactized tool results', () => {
        const commandTool = createMessage({ id: 'msg_command', runId: 'run_1', role: 'tool' });
        const fileTool = createMessage({ id: 'msg_file', runId: 'run_1', role: 'tool' });

        const items = buildWorkbenchTimelineItems(
            projectConversationTanstackMessages(
                [commandTool, fileTool],
                new Map([
                    [
                        commandTool.id,
                        [
                            createPart({
                                id: 'part_command',
                                messageId: commandTool.id,
                                partType: 'tool_result',
                                payload: {
                                    callId: 'call_command',
                                    toolName: 'run_command',
                                    outputText: 'exit code 0',
                                    isError: false,
                                    artifactized: true,
                                    artifactAvailable: true,
                                    artifactKind: 'command_output',
                                    previewStrategy: 'head_tail',
                                    totalBytes: 1024,
                                    totalLines: 20,
                                },
                            }),
                        ],
                    ],
                    [
                        fileTool.id,
                        [
                            createPart({
                                id: 'part_file',
                                messageId: fileTool.id,
                                partType: 'tool_result',
                                payload: {
                                    callId: 'call_file',
                                    toolName: 'read_file',
                                    outputText: 'file preview',
                                    isError: false,
                                    artifactized: true,
                                    artifactAvailable: true,
                                    artifactKind: 'file_read',
                                    previewStrategy: 'head_only',
                                    omittedBytes: 512,
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

        expect(items[0]).toMatchObject({
            kind: 'command',
            icon: 'terminal',
            title: 'Command: run_command',
            artifactRef: {
                messagePartId: 'part_command',
                artifactKind: 'command_output',
                totalBytes: 1024,
                totalLines: 20,
            },
        });
        expect(items[1]).toMatchObject({
            kind: 'artifact',
            icon: 'artifact',
            title: 'Tool Result: read_file',
            artifactRef: {
                messagePartId: 'part_file',
                artifactKind: 'file_read',
                omittedBytes: 512,
                summaryMode: 'utility_ai',
                summaryProviderId: 'zai',
                summaryModelId: 'zai/glm-4.5-air',
            },
        });
    });

    it('declares future item kinds without fabricating rows for unsupported transcript parts', () => {
        expect(workbenchTimelineItemKinds).toEqual(
            expect.arrayContaining(['approval', 'file_change', 'diff', 'plan_step', 'web_research', 'queued_followup'])
        );

        const toolMessage = createMessage({ id: 'msg_generic_tool', role: 'tool' });
        const items = buildWorkbenchTimelineItems(
            projectConversationTanstackMessages(
                [toolMessage],
                new Map([
                    [
                        toolMessage.id,
                        [
                            createPart({
                                id: 'part_generic',
                                messageId: toolMessage.id,
                                partType: 'tool_result',
                                payload: {
                                    callId: 'call_generic',
                                    toolName: 'custom_tool',
                                    outputText: 'generic output',
                                    isError: false,
                                },
                            }),
                        ],
                    ],
                ])
            )
        );

        expect(items.map((item) => item.kind)).toEqual(['artifact']);
        expect(items.map((item) => item.kind)).not.toEqual(
            expect.arrayContaining(['approval', 'file_change', 'diff', 'plan_step', 'web_research', 'queued_followup'])
        );
    });
});

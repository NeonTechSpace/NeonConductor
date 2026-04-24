import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MessageFlowTurnView } from '@/web/components/conversation/messages/messageFlow';

describe('message flow rendering', () => {
    it('renders reasoning above assistant content and hides branching for placeholder assistant turns', () => {
        const populatedAssistantHtml = renderToStaticMarkup(
            createElement(MessageFlowTurnView, {
                profileId: 'profile_default',
                turn: {
                    id: 'run_default',
                    runId: 'run_default',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    messages: [
                        {
                            id: 'msg_user',
                            runId: 'run_default',
                            role: 'user',
                            createdAt: '2026-03-12T09:00:00.000Z',
                            body: [],
                            editableText: 'hello',
                            plainCopyText: 'hello',
                            rawCopyText: 'hello',
                        },
                        {
                            id: 'msg_assistant',
                            runId: 'run_default',
                            role: 'assistant',
                            createdAt: '2026-03-12T09:00:01.000Z',
                            body: [
                                {
                                    id: 'part_reasoning',
                                    type: 'assistant_reasoning',
                                    text: 'Think first',
                                    providerLimitedReasoning: true,
                                },
                                {
                                    id: 'part_assistant',
                                    type: 'assistant_text',
                                    text: 'Answer body',
                                    providerLimitedReasoning: false,
                                },
                            ],
                            plainCopyText: 'Answer body',
                            rawCopyText: 'Answer body',
                        },
                    ],
                },
                run: {
                    id: 'run_default',
                    sessionId: 'sess_default',
                    profileId: 'profile_default',
                    prompt: 'hello',
                    status: 'running',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    updatedAt: '2026-03-12T09:00:01.000Z',
                },
                onBranchFromMessage: () => undefined,
                onPromoteMessage: () => undefined,
            })
        );

        const pendingAssistantHtml = renderToStaticMarkup(
            createElement(MessageFlowTurnView, {
                profileId: 'profile_default',
                turn: {
                    id: 'run_pending',
                    runId: 'run_pending',
                    createdAt: '2026-03-12T09:05:00.000Z',
                    messages: [
                        {
                            id: 'msg_assistant_pending',
                            runId: 'run_pending',
                            role: 'assistant',
                            createdAt: '2026-03-12T09:05:01.000Z',
                            body: [
                                {
                                    id: 'part_status_pending',
                                    type: 'assistant_status',
                                    code: 'received',
                                    label: 'Agent received message',
                                },
                            ],
                        },
                    ],
                },
                run: {
                    id: 'run_pending',
                    sessionId: 'sess_default',
                    profileId: 'profile_default',
                    prompt: 'hello',
                    status: 'running',
                    createdAt: '2026-03-12T09:05:00.000Z',
                    updatedAt: '2026-03-12T09:05:01.000Z',
                },
            })
        );

        expect(populatedAssistantHtml).toContain('Reasoning');
        expect(populatedAssistantHtml).toContain('Copy');
        expect(populatedAssistantHtml).toContain('Branch');
        expect(populatedAssistantHtml).toContain('Promote');
        expect(populatedAssistantHtml).not.toContain('Regenerate');
        expect(populatedAssistantHtml.indexOf('Reasoning')).toBeLessThan(populatedAssistantHtml.indexOf('Answer body'));
        expect(pendingAssistantHtml).toContain('Agent received message');
        expect(pendingAssistantHtml).not.toContain('Branch');
    });

    it('renders a sending affordance for optimistic user messages', () => {
        const html = renderToStaticMarkup(
            createElement(MessageFlowTurnView, {
                profileId: 'profile_default',
                turn: {
                    id: 'optimistic_run',
                    runId: 'optimistic_run',
                    createdAt: '2026-03-12T09:10:00.000Z',
                    messages: [
                        {
                            id: 'optimistic_msg',
                            runId: 'optimistic_run',
                            role: 'user',
                            createdAt: '2026-03-12T09:10:00.000Z',
                            body: [
                                {
                                    id: 'part_user',
                                    type: 'user_text',
                                    text: 'Ship it',
                                    providerLimitedReasoning: false,
                                },
                            ],
                            plainCopyText: 'Ship it',
                            rawCopyText: 'Ship it',
                            editableText: 'Ship it',
                            deliveryState: 'sending',
                            isOptimistic: true,
                        },
                    ],
                },
                run: undefined,
            })
        );

        expect(html).toContain('Ship it');
        expect(html).toContain('Sending...');
    });

    it('keeps user controls in bounds instead of positioning them below the message card', () => {
        const html = renderToStaticMarkup(
            createElement(MessageFlowTurnView, {
                profileId: 'profile_default',
                turn: {
                    id: 'run_user',
                    runId: 'run_user',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    messages: [
                        {
                            id: 'msg_user',
                            runId: 'run_user',
                            role: 'user',
                            createdAt: '2026-03-12T09:00:00.000Z',
                            body: [
                                {
                                    id: 'part_user',
                                    type: 'user_text',
                                    text: 'hello',
                                    providerLimitedReasoning: false,
                                },
                            ],
                            editableText: 'hello',
                            plainCopyText: 'hello',
                            rawCopyText: 'hello',
                        },
                    ],
                },
                run: undefined,
                onEditMessage: () => undefined,
                onBranchFromMessage: () => undefined,
            })
        );

        expect(html).toContain('min-h-14');
        expect(html).not.toContain('-bottom-5');
    });

    it('renders an artifact viewer affordance for artifactized tool results', () => {
        const html = renderToStaticMarkup(
            createElement(MessageFlowTurnView, {
                profileId: 'profile_default',
                turn: {
                    id: 'run_tool_artifact',
                    runId: 'run_tool_artifact',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    messages: [
                        {
                            id: 'msg_tool_artifact',
                            runId: 'run_tool_artifact',
                            role: 'tool',
                            createdAt: '2026-03-12T09:00:01.000Z',
                            body: [
                                {
                                    id: 'part_tool_artifact',
                                    type: 'tool_result',
                                    text: 'preview',
                                    providerLimitedReasoning: false,
                                    displayLabel: 'Tool Result',
                                    messagePartId: 'part_tool_artifact',
                                    toolName: 'run_command',
                                    artifactized: true,
                                    artifactAvailable: true,
                                    artifactKind: 'command_output',
                                    previewStrategy: 'head_tail',
                                    totalBytes: 4096,
                                    totalLines: 220,
                                    omittedBytes: 3072,
                                    summaryMode: 'utility_ai',
                                },
                            ],
                        },
                    ],
                },
                run: undefined,
                onOpenToolArtifact: () => undefined,
            })
        );

        expect(html).toContain('Stored full output available');
        expect(html).toContain('Open full output');
        expect(html).toContain('AI summary');
    });
});

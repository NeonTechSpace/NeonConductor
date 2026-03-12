import { describe, expect, it } from 'vitest';

import {
    consumeKiloAnthropicRoutedStreamResponse,
    createKiloAnthropicRoutedStreamState,
    finalizeKiloAnthropicRoutedStream,
    parseKiloAnthropicRoutedPayload,
    parseKiloAnthropicRoutedStreamEvent,
} from '@/app/backend/providers/adapters/kilo/anthropicRouted';

describe('Kilo Anthropic routed runtime', () => {
    it('rejects malformed SSE frames instead of silently swallowing them', async () => {
        const result = await consumeKiloAnthropicRoutedStreamResponse({
            response: new Response('bogus\n\ndata: [DONE]\n\n', {
                headers: {
                    'content-type': 'text/event-stream',
                },
            }),
            handlers: {
                onPart: () => undefined,
            },
            startedAt: Date.now(),
            includeEncrypted: false,
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected malformed Anthropic-routed SSE frame to fail closed.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(result.error.message).toContain('malformed SSE line');
    });

    it('emits reasoning and tool-call parts together from mixed Anthropic-routed frames', () => {
        const state = createKiloAnthropicRoutedStreamState();
        const parsed = parseKiloAnthropicRoutedStreamEvent({
            frame: {
                data: JSON.stringify({
                    choices: [
                        {
                            delta: {
                                reasoning_details: [
                                    {
                                        type: 'reasoning.text',
                                        text: 'Plan',
                                    },
                                ],
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: 'call_readme',
                                        function: {
                                            name: 'read_file',
                                            arguments: '{"path":"README.md"}',
                                        },
                                    },
                                ],
                            },
                            finish_reason: 'tool_calls',
                        },
                    ],
                }),
            },
            state,
            includeEncrypted: false,
        });

        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            throw new Error(parsed.error.message);
        }

        expect(parsed.value.parts).toEqual([
            {
                partType: 'reasoning',
                payload: { text: 'Plan' },
            },
            {
                partType: 'tool_call',
                payload: {
                    callId: 'call_readme',
                    toolName: 'read_file',
                    argumentsText: '{"path":"README.md"}',
                    args: {
                        path: 'README.md',
                    },
                },
            },
        ]);
    });

    it('fails closed when the Anthropic-routed stream ends with dangling tool-call chunks', () => {
        const state = createKiloAnthropicRoutedStreamState();
        const parsed = parseKiloAnthropicRoutedStreamEvent({
            frame: {
                data: JSON.stringify({
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: 'call_readme',
                                        function: {
                                            name: 'read_file',
                                            arguments: '{"path":"READ',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
            },
            state,
            includeEncrypted: false,
        });
        expect(parsed.isOk()).toBe(true);

        const finalized = finalizeKiloAnthropicRoutedStream(state);
        expect(finalized.isErr()).toBe(true);
        if (finalized.isOk()) {
            throw new Error('Expected dangling Anthropic-routed tool-call chunks to fail closed.');
        }
        expect(finalized.error.code).toBe('invalid_payload');
        expect(finalized.error.message).toContain('ended before accumulated tool-call arguments');
    });

    it('parses Anthropic reasoning_details from non-stream payloads without duplicating top-level reasoning text', () => {
        const parsed = parseKiloAnthropicRoutedPayload({
            payload: {
                choices: [
                    {
                        message: {
                            reasoning: 'Duplicate reasoning fallback',
                            reasoning_details: [
                                {
                                    type: 'reasoning.text',
                                    text: 'Primary reasoning',
                                },
                                {
                                    type: 'reasoning.summary',
                                    summary: 'Short summary',
                                },
                            ],
                            content: 'Claude via Kilo',
                            tool_calls: [
                                {
                                    id: 'call_claude',
                                    function: {
                                        name: 'read_file',
                                        arguments: '{"path":"CLAUDE.md"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 8,
                    total_tokens: 20,
                },
            },
            includeEncrypted: false,
        });

        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            throw new Error(parsed.error.message);
        }

        expect(parsed.value.parts).toEqual([
            {
                partType: 'reasoning',
                payload: { text: 'Primary reasoning' },
            },
            {
                partType: 'reasoning_summary',
                payload: { text: 'Short summary' },
            },
            {
                partType: 'text',
                payload: { text: 'Claude via Kilo' },
            },
            {
                partType: 'tool_call',
                payload: {
                    callId: 'call_claude',
                    toolName: 'read_file',
                    argumentsText: '{"path":"CLAUDE.md"}',
                    args: {
                        path: 'CLAUDE.md',
                    },
                },
            },
        ]);
        expect(parsed.value.usage).toMatchObject({
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
        });
    });
});

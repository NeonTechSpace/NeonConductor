import { describe, expect, it } from 'vitest';

import {
    consumeChatCompletionsStreamResponse,
    parseChatCompletionsStreamChunk,
    parseResponsesStreamChunk,
} from '@/app/backend/providers/adapters/streaming';
import { parseChatCompletionsPayload } from '@/app/backend/providers/adapters/runtimePayload';

describe('provider streaming parsers', () => {
    it('parses chat completion text deltas and usage', () => {
        const parsed = parseChatCompletionsStreamChunk({
            choices: [
                {
                    delta: {
                        content: 'Hello',
                    },
                },
            ],
            usage: {
                prompt_tokens: 12,
                completion_tokens: 4,
                total_tokens: 16,
            },
        });

        expect(parsed.parts).toEqual([
            {
                partType: 'text',
                payload: { text: 'Hello' },
            },
        ]);
        expect(parsed.usage).toMatchObject({
            inputTokens: 12,
            outputTokens: 4,
            totalTokens: 16,
        });
    });

    it('parses responses reasoning summary deltas', () => {
        const parsed = parseResponsesStreamChunk({
            eventName: 'response.reasoning_summary_text.delta',
            payload: {
                delta: 'Working through the steps',
            },
        });

        expect(parsed.parts).toEqual([
            {
                partType: 'reasoning_summary',
                payload: { text: 'Working through the steps' },
            },
        ]);
    });

    it('parses native chat completion tool calls from non-stream payloads and ignores pseudo-tool text', () => {
        const parsed = parseChatCompletionsPayload({
            choices: [
                {
                    message: {
                        content: '<minimax:tool_call><invoke name="Write">',
                        tool_calls: [
                            {
                                id: 'call_readme',
                                type: 'function',
                                function: {
                                    name: 'read_file',
                                    arguments: '{"path":"README.md"}',
                                },
                            },
                        ],
                    },
                },
            ],
        });

        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            throw new Error(parsed.error.message);
        }

        expect(parsed.value.parts).toEqual([
            {
                partType: 'text',
                payload: { text: '<minimax:tool_call><invoke name="Write">' },
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

    it('assembles streamed chat completion tool call deltas into a structured tool_call part', async () => {
        const parts: Array<{ partType: string; payload: Record<string, unknown> }> = [];
        const frames = [
            {
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
            },
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: {
                                        arguments: 'ME.md"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
            {
                choices: [
                    {
                        delta: {},
                        finish_reason: 'tool_calls',
                    },
                ],
            },
        ];
        const response = new Response(
            [
                ...frames.flatMap((frame) => [`data: ${JSON.stringify(frame)}`, '']),
                'data: [DONE]',
                '',
            ].join('\n'),
            {
                headers: {
                    'content-type': 'text/event-stream',
                },
            }
        );

        const result = await consumeChatCompletionsStreamResponse({
            response,
            handlers: {
                onPart: (part) => {
                    parts.push(part);
                },
            },
            startedAt: Date.now(),
        });

        expect(result.isOk()).toBe(true);
        expect(parts).toEqual([
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
});

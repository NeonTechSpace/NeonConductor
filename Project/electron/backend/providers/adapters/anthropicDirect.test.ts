import { describe, expect, it, vi } from 'vitest';

import {
    buildDirectAnthropicBody,
    consumeDirectAnthropicStreamResponse,
    parseDirectAnthropicPayload,
    supportsDirectAnthropicRuntimeContext,
} from '@/app/backend/providers/adapters/anthropicDirect';
import { parseKiloAnthropicRoutedPayload } from '@/app/backend/providers/adapters/kilo/anthropicRouted';
import type { ProviderRuntimeInput, ProviderRuntimePart } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_local_default',
        sessionId: 'sess_direct_anthropic',
        runId: 'run_direct_anthropic',
        providerId: 'openai',
        modelId: 'openai/claude-custom',
        runtime: {
            toolProtocol: 'anthropic_messages',
            apiFamily: 'anthropic_messages',
        },
        promptText: 'Inspect the workspace',
        contextMessages: [
            {
                role: 'system',
                parts: [
                    {
                        type: 'text',
                        text: 'System prompt',
                    },
                ],
            },
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        text: 'Inspect the workspace',
                    },
                ],
            },
        ],
        tools: [
            {
                id: 'list_files',
                description: 'List files',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
        ],
        runtimeOptions: {
            reasoning: {
                effort: 'low',
                summary: 'none',
                includeEncrypted: true,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
            execution: {},
        },
        cache: {
            strategy: 'auto',
            applied: false,
        },
        authMethod: 'api_key',
        apiKey: 'test-key',
        signal: new AbortController().signal,
        ...overrides,
    };
}

describe('anthropicDirect', () => {
    it('recognizes Anthropic-compatible direct runtime contexts', () => {
        expect(
            supportsDirectAnthropicRuntimeContext({
                providerId: 'openai',
                resolvedBaseUrl: 'https://api.anthropic.com/v1',
            })
        ).toBe(true);
        expect(
            supportsDirectAnthropicRuntimeContext({
                providerId: 'openai',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            })
        ).toBe(false);
    });

    it('builds Anthropic-native request bodies from backend context messages', () => {
        const input = createRuntimeInput({
            contextMessages: [
                {
                    role: 'system',
                    parts: [{ type: 'text', text: 'System prompt' }],
                },
                {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'reasoning',
                            text: 'Need to inspect files',
                            detailSignature: 'sig_123',
                        },
                        {
                            type: 'tool_call',
                            callId: 'call_1',
                            toolName: 'list_files',
                            argumentsText: '{}',
                        },
                    ],
                },
                {
                    role: 'tool',
                    parts: [
                        {
                            type: 'tool_result',
                            callId: 'call_1',
                            toolName: 'list_files',
                            outputText: '{"files":[]}',
                            isError: false,
                        },
                    ],
                },
                {
                    role: 'user',
                    parts: [{ type: 'text', text: 'Continue' }],
                },
            ],
        });

        const body = buildDirectAnthropicBody(input, 'openai/');
        expect(body['model']).toBe('claude-custom');
        expect(body['system']).toBe('System prompt');
        expect(body['tools']).toEqual([
            {
                name: 'list_files',
                description: 'List files',
                input_schema: {
                    type: 'object',
                    properties: {},
                },
            },
        ]);
        expect(body['tool_choice']).toEqual({ type: 'auto' });
        expect(body['thinking']).toEqual({
            type: 'enabled',
            budget_tokens: 2048,
        });
        const messages = body['messages'] as Array<Record<string, unknown>>;
        expect(messages[0]?.['role']).toBe('assistant');
        expect(messages[1]?.['role']).toBe('user');
    });

    it('parses direct Anthropic payloads into runtime parts', () => {
        const parsed = parseDirectAnthropicPayload({
            payload: {
                id: 'msg_123',
                type: 'message',
                content: [
                    {
                        type: 'thinking',
                        thinking: 'Reasoning block',
                        signature: 'sig_123',
                    },
                    {
                        type: 'tool_use',
                        id: 'call_1',
                        name: 'list_files',
                        input: {},
                    },
                    {
                        type: 'text',
                        text: 'Done',
                    },
                ],
                usage: {
                    input_tokens: 10,
                    output_tokens: 5,
                },
            },
            includeEncrypted: true,
        });

        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            throw new Error(parsed.error.message);
        }
        expect(parsed.value.parts.map((part) => part.partType)).toEqual(['reasoning', 'tool_call', 'text']);
        expect(parsed.value.parts[0]?.payload['detailSignature']).toBe('sig_123');
        expect(parsed.value.usage.totalTokens).toBe(15);
    });

    it('matches routed Anthropic normalization for equivalent reasoning, tool, and text payloads', () => {
        const directParsed = parseDirectAnthropicPayload({
            payload: {
                content: [
                    {
                        type: 'thinking',
                        thinking: 'Primary reasoning',
                    },
                    {
                        type: 'tool_use',
                        id: 'call_1',
                        name: 'list_files',
                        input: {},
                    },
                    {
                        type: 'text',
                        text: 'Done',
                    },
                ],
            },
            includeEncrypted: false,
        });
        const routedParsed = parseKiloAnthropicRoutedPayload({
            payload: {
                choices: [
                    {
                        message: {
                            reasoning_details: [
                                {
                                    type: 'reasoning.text',
                                    text: 'Primary reasoning',
                                },
                            ],
                            tool_calls: [
                                {
                                    id: 'call_1',
                                    function: {
                                        name: 'list_files',
                                        arguments: '{}',
                                    },
                                },
                            ],
                            content: 'Done',
                        },
                    },
                ],
            },
            includeEncrypted: false,
        });

        expect(directParsed.isOk()).toBe(true);
        expect(routedParsed.isOk()).toBe(true);
        if (directParsed.isErr() || routedParsed.isErr()) {
            throw new Error('Expected equivalent Anthropic payloads to parse successfully.');
        }

        expect(directParsed.value.parts.map((part) => part.partType).sort()).toEqual(
            routedParsed.value.parts.map((part) => part.partType).sort()
        );
        expect(directParsed.value.parts.find((part) => part.partType === 'reasoning')?.payload['text']).toBe(
            'Primary reasoning'
        );
        expect(routedParsed.value.parts.find((part) => part.partType === 'reasoning')?.payload['text']).toBe(
            'Primary reasoning'
        );
        expect(directParsed.value.parts.find((part) => part.partType === 'tool_call')?.payload['callId']).toBe(
            'call_1'
        );
        expect(routedParsed.value.parts.find((part) => part.partType === 'tool_call')?.payload['callId']).toBe(
            'call_1'
        );
        expect(directParsed.value.parts.find((part) => part.partType === 'text')?.payload['text']).toBe('Done');
        expect(routedParsed.value.parts.find((part) => part.partType === 'text')?.payload['text']).toBe('Done');
    });

    it('assembles Anthropic stream events into normalized runtime parts', async () => {
        const emittedParts: ProviderRuntimePart[] = [];
        const usageSpy = vi.fn();
        const response = new Response(
            [
                'event: message_start',
                'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}',
                '',
                'event: content_block_start',
                'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}',
                '',
                'event: content_block_delta',
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Need a file list"}}',
                '',
                'event: content_block_delta',
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig_abc"}}',
                '',
                'event: content_block_stop',
                'data: {"type":"content_block_stop","index":0}',
                '',
                'event: content_block_start',
                'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_1","name":"list_files"}}',
                '',
                'event: content_block_delta',
                'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}',
                '',
                'event: content_block_stop',
                'data: {"type":"content_block_stop","index":1}',
                '',
                'event: message_delta',
                'data: {"type":"message_delta","usage":{"output_tokens":7}}',
                '',
                'event: message_stop',
                'data: {"type":"message_stop"}',
                '',
            ].join('\n'),
            {
                headers: {
                    'content-type': 'text/event-stream',
                },
            }
        );

        const result = await consumeDirectAnthropicStreamResponse({
            response,
            handlers: {
                onPart: (part) => {
                    emittedParts.push(part);
                },
                onUsage: usageSpy,
            },
            startedAt: Date.now(),
            includeEncrypted: true,
        });

        expect(result.isOk()).toBe(true);
        expect(emittedParts.map((part) => part.partType)).toEqual(['reasoning', 'tool_call']);
        expect(emittedParts[0]?.payload['detailSignature']).toBe('sig_abc');
        expect(usageSpy).toHaveBeenCalled();
    });

    it('fails closed on malformed Anthropic stream payloads', async () => {
        const response = new Response(
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{"}}\n\n',
            {
                headers: {
                    'content-type': 'text/event-stream',
                },
            }
        );

        const result = await consumeDirectAnthropicStreamResponse({
            response,
            handlers: {
                onPart: () => undefined,
            },
            startedAt: Date.now(),
            includeEncrypted: true,
        });

        expect(result.isErr()).toBe(true);
    });
});

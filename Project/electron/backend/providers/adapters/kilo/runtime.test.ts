import { describe, expect, it, vi } from 'vitest';

import { streamKiloRuntime } from '@/app/backend/providers/adapters/kilo/runtime';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_local_default',
        sessionId: 'sess_test',
        runId: 'run_test',
        providerId: 'kilo',
        modelId: 'openai/gpt-5',
        toolProtocol: 'kilo_gateway',
        routedApiFamily: 'openai_compatible',
        promptText: 'Hello',
        runtimeOptions: {
            reasoning: {
                effort: 'none',
                summary: 'none',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
        },
        cache: {
            strategy: 'auto',
            applied: false,
        },
        authMethod: 'api_key',
        apiKey: 'kilo-test-key',
        signal: new AbortController().signal,
        ...overrides,
    };
}

function createHandlers(): ProviderRuntimeHandlers {
    return {
        onPart: vi.fn(),
        onUsage: vi.fn(),
        onTransportSelected: vi.fn(),
        onCacheResolved: vi.fn(),
    };
}

function createJsonResponse(payload: unknown): Response {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
            get(name: string) {
                return name.toLowerCase() === 'content-type' ? 'application/json' : null;
            },
        },
        json: async () => payload,
    } as Response;
}

describe('streamKiloRuntime', () => {
    it('adds Anthropic-specific Kilo request shaping for routed Anthropic models', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createJsonResponse({
                choices: [
                    {
                        message: {
                            content: 'Claude via Kilo',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 8,
                    total_tokens: 18,
                },
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const input = createRuntimeInput({
            modelId: 'anthropic/claude-sonnet-4.5',
            routedApiFamily: 'anthropic_messages',
            tools: [
                {
                    id: 'read_file',
                    description: 'Read a file',
                    inputSchema: {
                        type: 'object',
                    },
                },
            ],
            toolChoice: 'auto',
        });

        const result = await streamKiloRuntime(input, createHandlers());

        expect(result.isOk()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
        expect(requestInit).toBeDefined();
        expect((requestInit?.headers as Record<string, string>)['x-anthropic-beta']).toBe(
            'fine-grained-tool-streaming-2025-05-14'
        );
        const body = typeof requestInit?.body === 'string' ? JSON.parse(requestInit.body) : undefined;
        expect(body?.provider?.require_parameters).toBe(true);
    });

    it('fails closed for unsupported routed Kilo provider-native families without making a request', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await streamKiloRuntime(
            createRuntimeInput({
                modelId: 'kilo/provider-native',
                routedApiFamily: 'provider_native',
            }),
            createHandlers()
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected unsupported routed Kilo family to fail closed.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uses the Gemini-routed request builder and parser for routed Gemini models', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createJsonResponse({
                choices: [
                    {
                        message: {
                            reasoning_details: [
                                {
                                    type: 'reasoning.summary',
                                    summary: 'Need the README first',
                                    id: 'call_readme',
                                    format: 'google-gemini-v1',
                                    index: 0,
                                },
                            ],
                            content: 'Gemini via Kilo',
                            tool_calls: [
                                {
                                    id: 'call_readme',
                                    function: {
                                        name: 'read_file',
                                        arguments: '{"path":"README.md"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 11,
                    completion_tokens: 9,
                    total_tokens: 20,
                },
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const input = createRuntimeInput({
            modelId: 'google/gemini-2.5-pro',
            routedApiFamily: 'google_generativeai',
            tools: [
                {
                    id: 'read_file',
                    description: 'Read a file',
                    inputSchema: {
                        type: 'object',
                    },
                },
            ],
            toolChoice: 'auto',
            contextMessages: [
                {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'tool_call',
                            callId: 'call_readme',
                            toolName: 'read_file',
                            argumentsText: '{"path":"README.md"}',
                        },
                        {
                            type: 'reasoning_summary',
                            text: 'Need the README first',
                            detailId: 'call_readme',
                            detailIndex: 0,
                        },
                    ],
                },
            ],
        });
        const onPart = vi.fn();

        const result = await streamKiloRuntime(input, {
            ...createHandlers(),
            onPart,
        });

        expect(result.isOk()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
        expect(requestInit).toBeDefined();
        const body = typeof requestInit?.body === 'string' ? JSON.parse(requestInit.body) : undefined;
        expect(body?.provider?.require_parameters).toBe(true);
        expect(body?.messages).toEqual([
            {
                role: 'assistant',
                content: '',
                reasoning_details: [
                    {
                        type: 'reasoning.encrypted',
                        data: 'skip_thought_signature_validator',
                        id: 'call_readme',
                        format: 'google-gemini-v1',
                        index: 0,
                    },
                    {
                        type: 'reasoning.summary',
                        summary: 'Need the README first',
                        id: 'call_readme',
                        index: 0,
                    },
                ],
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
        ]);
        expect(onPart.mock.calls).toEqual([
            [
                {
                    partType: 'reasoning_summary',
                    payload: {
                        text: 'Need the README first',
                        detailType: 'reasoning.summary',
                        detailId: 'call_readme',
                        detailFormat: 'google-gemini-v1',
                        detailIndex: 0,
                    },
                },
            ],
            [
                {
                    partType: 'text',
                    payload: {
                        text: 'Gemini via Kilo',
                    },
                },
            ],
            [
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
            ],
        ]);
    });

    it('uses the Anthropic-routed stream parser for Kilo event streams', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    [
                        `data: ${JSON.stringify({
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
                            usage: {
                                prompt_tokens: 9,
                                completion_tokens: 7,
                                total_tokens: 16,
                            },
                        })}`,
                        '',
                        'data: [DONE]',
                        '',
                    ].join('\n'),
                    {
                        headers: {
                            'content-type': 'text/event-stream',
                        },
                    }
                )
            )
        );

        const onPart = vi.fn();
        const onUsage = vi.fn();
        const result = await streamKiloRuntime(
            createRuntimeInput({
                modelId: 'anthropic/claude-sonnet-4.5',
                routedApiFamily: 'anthropic_messages',
            }),
            {
                onPart,
                onUsage,
            }
        );

        expect(result.isOk()).toBe(true);
        expect(onPart.mock.calls).toEqual([
            [
                {
                    partType: 'reasoning',
                    payload: { text: 'Plan' },
                },
            ],
            [
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
            ],
        ]);
        expect(onUsage).toHaveBeenCalledTimes(1);
    });

    it('emits transport selection before cache resolution', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createJsonResponse({
                choices: [
                    {
                        message: {
                            content: 'Kilo callback order response',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 3,
                    completion_tokens: 4,
                    total_tokens: 7,
                },
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const lifecycleEvents: string[] = [];
        const result = await streamKiloRuntime(createRuntimeInput(), {
            onPart: vi.fn(),
            onTransportSelected: async () => {
                lifecycleEvents.push('transport');
            },
            onCacheResolved: async () => {
                lifecycleEvents.push('cache');
            },
        });

        expect(result.isOk()).toBe(true);
        expect(lifecycleEvents).toEqual(['transport', 'cache']);
    });
});

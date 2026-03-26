import { describe, expect, it, vi } from 'vitest';

import {
    buildDirectGeminiBody,
    consumeDirectGeminiStreamResponse,
    parseDirectGeminiPayload,
    supportsDirectGeminiRuntimeContext,
} from '@/app/backend/providers/adapters/geminiDirect';
import { parseKiloGeminiRoutedPayload } from '@/app/backend/providers/adapters/kilo/geminiRouted';
import type { ProviderRuntimeInput, ProviderRuntimePart } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_local_default',
        sessionId: 'sess_direct_gemini',
        runId: 'run_direct_gemini',
        providerId: 'openai',
        modelId: 'openai/gemini-custom',
        runtime: {
            toolProtocol: 'google_generativeai',
            apiFamily: 'google_generativeai',
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

describe('geminiDirect', () => {
    it('recognizes Gemini-compatible direct runtime contexts', () => {
        expect(
            supportsDirectGeminiRuntimeContext({
                providerId: 'openai',
                resolvedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            })
        ).toBe(true);
        expect(
            supportsDirectGeminiRuntimeContext({
                providerId: 'openai',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            })
        ).toBe(false);
    });

    it('builds Gemini-native request bodies from backend context messages', () => {
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
                            type: 'reasoning_summary',
                            text: 'Need to inspect files',
                            detailId: 'call_1',
                        },
                        {
                            type: 'reasoning_encrypted',
                            opaque: 'sig_123',
                            detailId: 'call_1',
                            detailFormat: 'google_gemini_v1',
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

        const body = buildDirectGeminiBody(input, 'openai/');
        expect(body['model']).toBe('gemini-custom');
        expect(body['systemInstruction']).toEqual({
            parts: [{ text: 'System prompt' }],
        });
        expect(body['tools']).toEqual([
            {
                functionDeclarations: [
                    {
                        name: 'list_files',
                        description: 'List files',
                        parameters: {
                            type: 'object',
                            properties: {},
                        },
                    },
                ],
            },
        ]);
        expect(body['toolConfig']).toEqual({
            functionCallingConfig: {
                mode: 'AUTO',
            },
        });
        expect(body['generationConfig']).toEqual({
            thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 2048,
            },
        });

        const contents = body['contents'] as Array<Record<string, unknown>>;
        expect(contents[0]).toEqual({
            role: 'model',
            parts: [
                {
                    text: 'Need to inspect files',
                    thought: true,
                },
                {
                    functionCall: {
                        name: 'list_files',
                        args: {},
                    },
                    thoughtSignature: 'sig_123',
                },
            ],
        });
        expect(contents[1]).toEqual({
            role: 'tool',
            parts: [
                {
                    functionResponse: {
                        name: 'list_files',
                        response: {
                            files: [],
                        },
                    },
                },
            ],
        });
        expect(contents[2]).toEqual({
            role: 'user',
            parts: [{ text: 'Continue' }],
        });
    });

    it('parses direct Gemini payloads into runtime parts', () => {
        const parsed = parseDirectGeminiPayload({
            payload: {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'Need to inspect files',
                                    thought: true,
                                    thoughtSignature: 'sig_123',
                                },
                                {
                                    functionCall: {
                                        name: 'list_files',
                                        args: {},
                                    },
                                },
                                {
                                    text: 'Done',
                                },
                            ],
                        },
                    },
                ],
                usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                    totalTokenCount: 15,
                    thoughtsTokenCount: 2,
                },
            },
            includeEncrypted: true,
        });

        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            throw new Error(parsed.error.message);
        }

        expect(parsed.value.parts.map((part) => part.partType)).toEqual([
            'reasoning_summary',
            'reasoning_encrypted',
            'tool_call',
            'text',
        ]);
        expect(parsed.value.usage.totalTokens).toBe(15);
        expect(parsed.value.usage.reasoningTokens).toBe(2);
    });

    it('matches routed Gemini normalization for equivalent reasoning, tool, and text payloads', () => {
        const directParsed = parseDirectGeminiPayload({
            payload: {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'Primary reasoning',
                                    thought: true,
                                },
                                {
                                    functionCall: {
                                        id: 'call_1',
                                        name: 'list_files',
                                        args: {},
                                    },
                                },
                                {
                                    text: 'Done',
                                },
                            ],
                        },
                    },
                ],
            },
            includeEncrypted: false,
        });
        const routedParsed = parseKiloGeminiRoutedPayload({
            payload: {
                choices: [
                    {
                        message: {
                            reasoning_details: [
                                {
                                    type: 'reasoning.summary',
                                    summary: 'Primary reasoning',
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
            throw new Error('Expected equivalent Gemini payloads to parse successfully.');
        }

        expect(directParsed.value.parts.map((part) => part.partType).sort()).toEqual(
            routedParsed.value.parts.map((part) => part.partType).sort()
        );
        expect(directParsed.value.parts.find((part) => part.partType === 'reasoning_summary')?.payload['text']).toBe(
            'Primary reasoning'
        );
        expect(routedParsed.value.parts.find((part) => part.partType === 'reasoning_summary')?.payload['text']).toBe(
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

    it('assembles direct Gemini stream events into normalized runtime parts', async () => {
        const emittedParts: ProviderRuntimePart[] = [];
        const usageSpy = vi.fn();
        const response = new Response(
            [
                `data: ${JSON.stringify({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: 'Need to inspect files',
                                        thought: true,
                                        thoughtSignature: 'sig_abc',
                                    },
                                ],
                            },
                        },
                    ],
                    usageMetadata: {
                        promptTokenCount: 12,
                        candidatesTokenCount: 3,
                        totalTokenCount: 15,
                    },
                })}`,
                '',
                `data: ${JSON.stringify({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        functionCall: {
                                            name: 'list_files',
                                            args: {},
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                })}`,
                '',
            ].join('\n'),
            {
                headers: {
                    'content-type': 'text/event-stream',
                },
            }
        );

        const result = await consumeDirectGeminiStreamResponse({
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
        expect(emittedParts.map((part) => part.partType)).toEqual([
            'reasoning_summary',
            'reasoning_encrypted',
            'tool_call',
        ]);
        expect(usageSpy).toHaveBeenCalled();
    });

    it('fails closed on malformed Gemini stream payloads', async () => {
        const response = new Response(
            'data: {"candidates":[{"content":{"parts":[{"functionCall":{"args":{}}}]}}]}\n\n',
            {
                headers: {
                    'content-type': 'text/event-stream',
                },
            }
        );

        const result = await consumeDirectGeminiStreamResponse({
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

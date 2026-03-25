import { describe, expect, it } from 'vitest';

import {
    buildKiloGeminiRoutedBody,
    consumeKiloGeminiRoutedStreamResponse,
    createKiloGeminiRoutedStreamState,
    finalizeKiloGeminiRoutedStream,
    parseKiloGeminiRoutedPayload,
    parseKiloGeminiRoutedStreamEvent,
} from '@/app/backend/providers/adapters/kilo/geminiRouted';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_local_default',
        sessionId: 'sess_test',
        runId: 'run_test',
        providerId: 'kilo',
        modelId: 'google/gemini-2.5-pro',
        runtime: {
            toolProtocol: 'kilo_gateway',
            apiFamily: 'kilo_gateway',
            routedApiFamily: 'google_generativeai',
        },
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
            execution: {},
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

describe('Kilo Gemini routed runtime', () => {
    it('sanitizes Gemini request history and injects the compatibility shim only for surviving tool calls', () => {
        const body = buildKiloGeminiRoutedBody(
            createRuntimeInput({
                contextMessages: [
                    {
                        role: 'assistant',
                        parts: [
                            {
                                type: 'text',
                                text: 'I called two tools',
                            },
                            {
                                type: 'tool_call',
                                callId: 'call_keep',
                                toolName: 'read_file',
                                argumentsText: '{"path":"README.md"}',
                            },
                            {
                                type: 'tool_call',
                                callId: 'call_drop',
                                toolName: 'read_file',
                                argumentsText: '{"path":"NOTES.md"}',
                            },
                            {
                                type: 'reasoning_summary',
                                text: 'Need the README first',
                                detailId: 'call_keep',
                                detailIndex: 1,
                            },
                            {
                                type: 'reasoning',
                                text: 'Legacy planning detail',
                            },
                        ],
                    },
                    {
                        role: 'tool',
                        parts: [
                            {
                                type: 'tool_result',
                                callId: 'call_keep',
                                toolName: 'read_file',
                                outputText: '{"ok":true}',
                                isError: false,
                            },
                        ],
                    },
                    {
                        role: 'tool',
                        parts: [
                            {
                                type: 'tool_result',
                                callId: 'call_drop',
                                toolName: 'read_file',
                                outputText: '{"ok":false}',
                                isError: true,
                            },
                        ],
                    },
                ],
            })
        );

        const assistantMessage = Array.isArray(body['messages']) ? body['messages'][0] : null;
        const keptToolMessage = Array.isArray(body['messages']) ? body['messages'][1] : null;
        const droppedToolMessage = Array.isArray(body['messages']) ? body['messages'][2] : null;

        expect(assistantMessage).toMatchObject({
            role: 'assistant',
            content: 'I called two tools',
            tool_calls: [
                {
                    id: 'call_keep',
                    function: {
                        name: 'read_file',
                        arguments: '{"path":"README.md"}',
                    },
                },
            ],
        });
        expect(assistantMessage).toHaveProperty('reasoning_details');
        const reasoningDetails = (assistantMessage as { reasoning_details?: Array<Record<string, unknown>> }).reasoning_details;
        expect(reasoningDetails).toEqual([
            {
                type: 'reasoning.encrypted',
                data: 'skip_thought_signature_validator',
                id: 'call_keep',
                format: 'google-gemini-v1',
                index: 0,
            },
            {
                type: 'reasoning.summary',
                summary: 'Need the README first',
                id: 'call_keep',
                index: 1,
            },
            {
                type: 'reasoning.text',
                text: 'Legacy planning detail',
            },
        ]);
        expect(keptToolMessage).toMatchObject({
            role: 'tool',
            tool_call_id: 'call_keep',
        });
        expect(droppedToolMessage).toBeUndefined();
    });

    it('rejects malformed SSE frames instead of silently swallowing them', async () => {
        const result = await consumeKiloGeminiRoutedStreamResponse({
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
            throw new Error('Expected malformed Gemini-routed SSE frame to fail closed.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(result.error.message).toContain('malformed SSE line');
    });

    it('emits Gemini reasoning_details and tool-call parts together from mixed routed frames', () => {
        const state = createKiloGeminiRoutedStreamState();
        const parsed = parseKiloGeminiRoutedStreamEvent({
            frame: {
                data: JSON.stringify({
                    choices: [
                        {
                            delta: {
                                reasoning_details: [
                                    {
                                        type: 'reasoning.summary',
                                        summary: 'Plan',
                                        id: 'call_readme',
                                        format: 'google-gemini-v1',
                                        index: 0,
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
                partType: 'reasoning_summary',
                payload: {
                    text: 'Plan',
                    detailType: 'reasoning.summary',
                    detailId: 'call_readme',
                    detailFormat: 'google-gemini-v1',
                    detailIndex: 0,
                },
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

    it('fails closed when the Gemini-routed stream ends with dangling tool-call chunks', () => {
        const state = createKiloGeminiRoutedStreamState();
        const parsed = parseKiloGeminiRoutedStreamEvent({
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

        const finalized = finalizeKiloGeminiRoutedStream(state);
        expect(finalized.isErr()).toBe(true);
        if (finalized.isOk()) {
            throw new Error('Expected dangling Gemini-routed tool-call chunks to fail closed.');
        }
        expect(finalized.error.code).toBe('invalid_payload');
        expect(finalized.error.message).toContain('ended before accumulated tool-call arguments');
    });

    it('parses Gemini reasoning_details from non-stream payloads without duplicating top-level reasoning text', () => {
        const parsed = parseKiloGeminiRoutedPayload({
            payload: {
                choices: [
                    {
                        message: {
                            reasoning: 'Duplicate reasoning fallback',
                            reasoning_details: [
                                {
                                    type: 'reasoning.text',
                                    text: 'Primary reasoning',
                                    id: 'call_gemini',
                                    format: 'google-gemini-v1',
                                    index: 0,
                                },
                                {
                                    type: 'reasoning.encrypted',
                                    data: 'encrypted-thought',
                                    id: 'call_gemini',
                                    format: 'google-gemini-v1',
                                    index: 0,
                                },
                            ],
                            content: 'Gemini via Kilo',
                            tool_calls: [
                                {
                                    id: 'call_gemini',
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
                    prompt_tokens: 12,
                    completion_tokens: 8,
                    total_tokens: 20,
                },
            },
            includeEncrypted: true,
        });

        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            throw new Error(parsed.error.message);
        }

        expect(parsed.value.parts).toEqual([
            {
                partType: 'reasoning',
                payload: {
                    text: 'Primary reasoning',
                    detailType: 'reasoning.text',
                    detailId: 'call_gemini',
                    detailFormat: 'google-gemini-v1',
                    detailIndex: 0,
                },
            },
            {
                partType: 'reasoning_encrypted',
                payload: {
                    opaque: 'encrypted-thought',
                    detailType: 'reasoning.encrypted',
                    detailId: 'call_gemini',
                    detailFormat: 'google-gemini-v1',
                    detailIndex: 0,
                },
            },
            {
                partType: 'text',
                payload: { text: 'Gemini via Kilo' },
            },
            {
                partType: 'tool_call',
                payload: {
                    callId: 'call_gemini',
                    toolName: 'read_file',
                    argumentsText: '{"path":"README.md"}',
                    args: {
                        path: 'README.md',
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

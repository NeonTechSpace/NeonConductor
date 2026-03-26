import { describe, expect, it, vi, beforeEach } from 'vitest';

const { getModelMock, resolveProviderRuntimePathContextMock } = vi.hoisted(() => ({
    getModelMock: vi.fn(),
    resolveProviderRuntimePathContextMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    providerCatalogStore: {
        getModel: getModelMock,
    },
}));

vi.mock('@/app/backend/providers/runtimePathContext', () => ({
    resolveProviderRuntimePathContext: resolveProviderRuntimePathContextMock,
}));

import { streamProviderNativeRuntime } from '@/app/backend/providers/adapters/providerNative';
import { miniMaxOpenAICompatibilitySpecialization } from '@/app/backend/providers/adapters/providerNative/minimax';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'prof_test',
        sessionId: 'sess_test',
        runId: 'run_test',
        providerId: 'openai',
        modelId: 'openai/minimax-native',
        runtime: {
            toolProtocol: 'provider_native',
            apiFamily: 'provider_native',
            providerNativeId: 'minimax_openai_compat',
        },
        promptText: 'Read the README',
        runtimeOptions: {
            reasoning: {
                effort: 'medium',
                summary: 'auto',
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
            reason: 'disabled',
        },
        authMethod: 'api_key',
        apiKey: 'test-key',
        signal: new AbortController().signal,
        ...overrides,
    };
}

describe('provider-native runtime hardening', () => {
    beforeEach(() => {
        getModelMock.mockReset();
        resolveProviderRuntimePathContextMock.mockReset();
        resolveProviderRuntimePathContextMock.mockResolvedValue({
            isErr: () => false,
            value: {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.minimax.io/v1',
            },
        });
        getModelMock.mockResolvedValue({
            modelId: 'openai/minimax-native',
            sourceProvider: 'minimax',
            runtime: {
                toolProtocol: 'provider_native',
                apiFamily: 'provider_native',
                providerNativeId: 'minimax_openai_compat',
            },
        });
    });

    it('rejects malformed SSE frames instead of silently swallowing them', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('bogus\n\ndata: [DONE]\n\n', {
                    headers: {
                        'content-type': 'text/event-stream',
                    },
                })
            )
        );

        const result = await streamProviderNativeRuntime(createRuntimeInput(), {
            onPart: () => undefined,
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected malformed SSE frame to fail closed.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(result.error.message).toContain('malformed SSE line');
    });

    it('fails closed when the stream ends with dangling native tool-call chunks', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    `data: ${JSON.stringify({
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
                    })}\n\n`,
                    {
                        headers: {
                            'content-type': 'text/event-stream',
                        },
                    }
                )
            )
        );

        const result = await streamProviderNativeRuntime(createRuntimeInput(), {
            onPart: () => undefined,
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected dangling provider-native tool-call chunks to fail closed.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(result.error.message).toContain('ended before accumulated tool-call arguments');
    });

    it('matches MiniMax only from trusted specialization metadata and compatible context', () => {
        expect(
            miniMaxOpenAICompatibilitySpecialization.matchContext({
                providerId: 'openai',
                modelId: 'openai/minimax-native',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.minimax.io/v1',
                sourceProvider: 'minimax',
                apiFamily: 'provider_native',
                providerNativeId: 'minimax_openai_compat',
            })
        ).toBe('trusted');

        expect(
            miniMaxOpenAICompatibilitySpecialization.matchContext({
                providerId: 'openai',
                modelId: 'openai/minimax-legacy',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.minimax.io/v1',
                apiFamily: 'provider_native',
                sourceProvider: 'minimax',
                providerNativeId: 'missing',
            })
        ).toBeNull();
    });

    it('fails closed when a MiniMax-looking model lacks trusted provider-native metadata', async () => {
        getModelMock.mockResolvedValueOnce({
            modelId: 'openai/minimax-legacy',
            sourceProvider: 'minimax',
            runtime: {
                toolProtocol: 'provider_native',
                apiFamily: 'provider_native',
                providerNativeId: 'missing',
            },
        });
        vi.stubGlobal('fetch', vi.fn());

        const result = await streamProviderNativeRuntime(
            createRuntimeInput({
                modelId: 'openai/minimax-legacy',
            }),
            {
                onPart: () => undefined,
            }
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected untrusted provider-native model to fail closed.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(result.error.message).toContain('provider-native runtime specialization');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('fails on duplicate terminal frames', () => {
        const state = miniMaxOpenAICompatibilitySpecialization.createStreamState();
        const firstResult = miniMaxOpenAICompatibilitySpecialization.parseStreamEvent({
            frame: { data: '[DONE]' },
            state,
        });
        expect(firstResult.isOk()).toBe(true);

        const duplicateResult = miniMaxOpenAICompatibilitySpecialization.parseStreamEvent({
            frame: { data: '[DONE]' },
            state,
        });
        expect(duplicateResult.isErr()).toBe(true);
        if (duplicateResult.isOk()) {
            throw new Error('Expected duplicate terminal frame to fail.');
        }
        expect(duplicateResult.error.code).toBe('invalid_payload');
        expect(duplicateResult.error.message).toContain('duplicate terminal frame');
    });

    it('fails when the stream reuses a native tool-call id across tool indices', () => {
        const state = miniMaxOpenAICompatibilitySpecialization.createStreamState();
        const parsed = miniMaxOpenAICompatibilitySpecialization.parseStreamEvent({
            frame: {
                data: JSON.stringify({
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: 'call_duplicate',
                                        function: {
                                            name: 'read_file',
                                            arguments: '{"path":"README.md"}',
                                        },
                                    },
                                    {
                                        index: 1,
                                        id: 'call_duplicate',
                                        function: {
                                            name: 'read_file',
                                            arguments: '{"path":"package.json"}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
            },
            state,
        });

        expect(parsed.isErr()).toBe(true);
        if (parsed.isOk()) {
            throw new Error('Expected duplicate tool-call ids to be rejected.');
        }
        expect(parsed.error.code).toBe('invalid_payload');
        expect(parsed.error.message).toContain('duplicate tool call id');
    });

    it('emits reasoning and tool-call parts together when a native frame mixes them', () => {
        const state = miniMaxOpenAICompatibilitySpecialization.createStreamState();
        const mixedFrame = {
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
        };

        const parsed = miniMaxOpenAICompatibilitySpecialization.parseStreamEvent({
            frame: mixedFrame,
            state,
        });

        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            throw new Error(parsed.error.message);
        }

        const parts = parsed.value.parts;
        expect(parts).toEqual([
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
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeOpenAICompatibleProtocol } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleProtocolExecutor';
import type { OpenAICompatibleExecutionContext } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleRuntime.types';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(
    overrides?: Partial<ProviderRuntimeInput>,
    protocol: 'openai_responses' | 'openai_chat_completions' = 'openai_responses'
): ProviderRuntimeInput {
    return {
        profileId: 'profile_default',
        sessionId: 'sess_openai_compat',
        runId: 'run_openai_compat',
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        runtime: {
            toolProtocol: protocol,
            apiFamily: 'openai_compatible',
        },
        promptText: 'Inspect the workspace',
        contextMessages: [
            {
                role: 'user',
                parts: [{ type: 'text', text: 'Inspect the workspace' }],
            },
        ],
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
        },
        authMethod: 'api_key',
        apiKey: 'test-key',
        signal: new AbortController().signal,
        ...overrides,
    };
}

function createExecutionContext(
    overrides?: Partial<OpenAICompatibleExecutionContext>,
    protocol: 'openai_responses' | 'openai_chat_completions' = 'openai_responses'
): OpenAICompatibleExecutionContext {
    return {
        runtimeInput: createRuntimeInput(undefined, protocol),
        handlers: {
            onPart: () => undefined,
        },
        config: {
            providerId: 'openai',
            modelPrefix: 'openai/',
            label: 'OpenAI',
            resolveEndpoints: () => ({
                chatCompletionsUrl: 'https://api.openai.com/v1/chat/completions',
                responsesUrl: 'https://api.openai.com/v1/responses',
                baseUrl: 'https://api.openai.com/v1',
            }),
        },
        token: 'test-key',
        startedAt: Date.now() - 10,
        endpoints: {
            chatCompletionsUrl: 'https://api.openai.com/v1/chat/completions',
            responsesUrl: 'https://api.openai.com/v1/responses',
            baseUrl: 'https://api.openai.com/v1',
        },
        ...overrides,
    };
}

describe('openAICompatibleProtocolExecutor', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits transport selection before cache resolution and parsed payload output', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        output: [
                            {
                                type: 'message',
                                content: [
                                    {
                                        type: 'output_text',
                                        text: 'Done',
                                    },
                                ],
                            },
                        ],
                        usage: {
                            input_tokens: 10,
                            output_tokens: 4,
                            total_tokens: 14,
                        },
                    }),
                    {
                        headers: {
                            'content-type': 'application/json',
                        },
                    }
                )
            )
        );

        const events: string[] = [];
        const result = await executeOpenAICompatibleProtocol({
            executionBranch: 'openai_responses',
            executionContext: createExecutionContext({
                handlers: {
                    onTransportSelected: () => {
                        events.push('transport');
                    },
                    onCacheResolved: () => {
                        events.push('cache');
                    },
                    onPart: () => {
                        events.push('part');
                    },
                    onUsage: () => {
                        events.push('usage');
                    },
                },
            }),
        });

        expect(result.isOk()).toBe(true);
        expect(events).toEqual(['transport', 'cache', 'part', 'usage']);
    });

    it('maps HTTP fallback failures through the shared runtime failure vocabulary', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('{}', {
                    status: 500,
                    statusText: 'Internal Server Error',
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            )
        );

        const result = await executeOpenAICompatibleProtocol({
            executionBranch: 'openai_chat_completions',
            executionContext: createExecutionContext(undefined, 'openai_chat_completions'),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected HTTP failure to fail.');
        }
        expect(result.error.code).toBe('provider_request_failed');
        expect(result.error.message).toContain('chat completion failed');
    });
});

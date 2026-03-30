import { describe, expect, it } from 'vitest';

import { resolveOpenAICompatibleExecutionBranch } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleExecutionBranchResolver';
import type { OpenAICompatibleRuntimeConfig } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleRuntime.types';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_default',
        sessionId: 'sess_openai_compat',
        runId: 'run_openai_compat',
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        runtime: {
            toolProtocol: 'openai_responses',
            apiFamily: 'openai_compatible',
        },
        promptText: 'Inspect the workspace',
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

function createConfig(overrides?: Partial<OpenAICompatibleRuntimeConfig>): OpenAICompatibleRuntimeConfig {
    return {
        providerId: 'openai',
        modelPrefix: 'openai/',
        label: 'OpenAI',
        resolveEndpoints: () => ({
            chatCompletionsUrl: 'https://api.openai.com/v1/chat/completions',
            responsesUrl: 'https://api.openai.com/v1/responses',
            baseUrl: 'https://api.openai.com/v1',
        }),
        ...overrides,
    };
}

describe('openAICompatibleExecutionBranchResolver', () => {
    it('routes provider-native protocols through the provider-native branch', () => {
        const branch = resolveOpenAICompatibleExecutionBranch({
            runtimeInput: createRuntimeInput({
                runtime: {
                    toolProtocol: 'provider_native',
                    apiFamily: 'provider_native',
                    providerNativeId: 'native_test',
                },
            }),
            config: createConfig(),
        });

        expect(branch).toBe('provider_native');
    });

    it('routes direct-family protocols through the direct-family branch', () => {
        const branch = resolveOpenAICompatibleExecutionBranch({
            runtimeInput: createRuntimeInput({
                runtime: {
                    toolProtocol: 'anthropic_messages',
                    apiFamily: 'anthropic_messages',
                },
            }),
            config: createConfig(),
        });

        expect(branch).toBe('direct_family');
    });

    it('routes OpenAI realtime mode to the websocket branch only for the OpenAI wrapper', () => {
        const runtimeInput = createRuntimeInput({
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
                execution: {
                    openAIExecutionMode: 'realtime_websocket',
                },
            },
        });

        expect(
            resolveOpenAICompatibleExecutionBranch({
                runtimeInput,
                config: createConfig(),
            })
        ).toBe('realtime_websocket');

        expect(
            resolveOpenAICompatibleExecutionBranch({
                runtimeInput,
                config: createConfig({
                    providerId: 'zai',
                    modelPrefix: 'zai/',
                    label: 'Z.AI',
                }),
            })
        ).toBe('openai_responses');
    });
});

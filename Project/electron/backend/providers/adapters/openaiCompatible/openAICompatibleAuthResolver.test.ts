import { describe, expect, it } from 'vitest';

import { resolveOpenAICompatibleAuthToken } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleAuthResolver';
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

describe('openAICompatibleAuthResolver', () => {
    it('requires an OAuth access token for Codex', () => {
        const runtimeInput = createRuntimeInput({
            providerId: 'openai_codex',
        });
        delete runtimeInput.apiKey;
        delete runtimeInput.accessToken;

        const result = resolveOpenAICompatibleAuthToken({
            runtimeInput,
            config: createConfig({
                providerId: 'openai_codex',
                modelPrefix: 'openai_codex/',
                label: 'OpenAI Codex',
            }),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing Codex access token to fail.');
        }
        expect(result.error.code).toBe('auth_missing');
        expect(result.error.message).toContain('OAuth access token');
    });

    it('requires an API key for non-Codex OpenAI-compatible runtimes', () => {
        const runtimeInput = createRuntimeInput();
        delete runtimeInput.apiKey;

        const result = resolveOpenAICompatibleAuthToken({
            runtimeInput,
            config: createConfig(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing API key to fail.');
        }
        expect(result.error.code).toBe('auth_missing');
        expect(result.error.message).toContain('API key');
    });

    it('returns the resolved token when auth is available', () => {
        const result = resolveOpenAICompatibleAuthToken({
            runtimeInput: createRuntimeInput({
                apiKey: 'live-key',
            }),
            config: createConfig(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value).toBe('live-key');
    });
});

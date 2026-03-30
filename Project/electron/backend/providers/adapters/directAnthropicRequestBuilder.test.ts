import { describe, expect, it } from 'vitest';

import {
    buildDirectAnthropicBody,
    supportsDirectAnthropicRuntimeContext,
    validateDirectAnthropicAuth,
} from '@/app/backend/providers/adapters/directAnthropicRequestBuilder';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

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
                parts: [{ type: 'text', text: 'System prompt' }],
            },
            {
                role: 'user',
                parts: [{ type: 'text', text: 'Inspect the workspace' }],
            },
        ],
        tools: [],
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

describe('directAnthropicRequestBuilder', () => {
    it('builds Anthropic request bodies with system and reasoning fields', () => {
        const body = buildDirectAnthropicBody(createRuntimeInput(), 'openai/');
        expect(body['model']).toBe('claude-custom');
        expect(body['system']).toBe('System prompt');
        expect(body['thinking']).toEqual({
            type: 'enabled',
            budget_tokens: 2048,
        });
    });

    it('recognizes Anthropic-compatible runtime paths and validates auth', () => {
        const missingApiKeyInput = createRuntimeInput();
        delete missingApiKeyInput.apiKey;

        expect(
            supportsDirectAnthropicRuntimeContext({
                providerId: 'openai',
                resolvedBaseUrl: 'https://api.anthropic.com/v1',
            })
        ).toBe(true);
        expect(
            validateDirectAnthropicAuth({
                runtimeInput: missingApiKeyInput,
                config: {
                    providerId: 'openai',
                    modelPrefix: 'openai/',
                    label: 'OpenAI',
                },
            }).isErr()
        ).toBe(true);
    });
});

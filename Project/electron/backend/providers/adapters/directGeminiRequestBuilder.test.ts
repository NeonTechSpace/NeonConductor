import { describe, expect, it } from 'vitest';

import {
    buildDirectGeminiBody,
    supportsDirectGeminiRuntimeContext,
    validateDirectGeminiAuth,
} from '@/app/backend/providers/adapters/directGeminiRequestBuilder';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

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

describe('directGeminiRequestBuilder', () => {
    it('builds Gemini request bodies with system instruction and thought config', () => {
        const body = buildDirectGeminiBody(createRuntimeInput(), 'openai/');
        expect(body['model']).toBe('gemini-custom');
        expect(body['systemInstruction']).toEqual({
            parts: [{ text: 'System prompt' }],
        });
        expect(body['generationConfig']).toEqual({
            thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 2048,
            },
        });
    });

    it('recognizes Gemini-compatible paths and validates auth', () => {
        const missingApiKeyInput = createRuntimeInput();
        delete missingApiKeyInput.apiKey;

        expect(
            supportsDirectGeminiRuntimeContext({
                providerId: 'openai',
                resolvedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            })
        ).toBe(true);
        expect(
            validateDirectGeminiAuth({
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

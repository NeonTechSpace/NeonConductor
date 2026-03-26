import { describe, expect, it } from 'vitest';

import {
    resolveDirectFamilyRuntimeHandler,
    streamDirectFamilyRuntime,
} from '@/app/backend/providers/adapters/directFamily/runtime';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_local_default',
        sessionId: 'sess_direct_family',
        runId: 'run_direct_family',
        providerId: 'openai',
        modelId: 'openai/custom-model',
        runtime: {
            toolProtocol: 'anthropic_messages',
            apiFamily: 'anthropic_messages',
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
        apiKey: 'test-key',
        signal: new AbortController().signal,
        ...overrides,
    };
}

describe('directFamily runtime', () => {
    it('resolves Anthropic and Gemini handlers from the registry', () => {
        expect(resolveDirectFamilyRuntimeHandler('anthropic_messages')?.toolProtocol).toBe('anthropic_messages');
        expect(resolveDirectFamilyRuntimeHandler('google_generativeai')?.toolProtocol).toBe('google_generativeai');
    });

    it('fails closed when a model declares an unknown direct-family protocol', async () => {
        const result = await streamDirectFamilyRuntime(
            createRuntimeInput({
                runtime: {
                    toolProtocol: 'openai_responses',
                    apiFamily: 'openai_compatible',
                },
            }),
            {
                onPart: () => undefined,
            },
            {
                providerId: 'openai',
                modelPrefix: 'openai/',
                label: 'OpenAI',
            }
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected unknown direct-family protocol to be rejected.');
        }
        expect(result.error.code).toBe('invalid_payload');
    });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

const { executeHttpFallbackMock } = vi.hoisted(() => ({
    executeHttpFallbackMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/adapters/httpFallback', () => ({
    executeHttpFallback: executeHttpFallbackMock,
}));

import { errProviderAdapter } from '@/app/backend/providers/adapters/errors';
import { executeProviderNativeRuntime } from '@/app/backend/providers/adapters/providerNativeRuntimeExecutor';
import type { ProviderNativeRuntimeExecutionInput } from '@/app/backend/providers/adapters/providerNative.types';

function createExecutionInput(): ProviderNativeRuntimeExecutionInput {
    return {
        runtimeInput: {
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
            },
            authMethod: 'api_key',
            apiKey: 'test-key',
            signal: new AbortController().signal,
        },
        handlers: {
            onPart: () => undefined,
        },
        specialization: {
            id: 'test_specialization',
            providerId: 'openai',
            transportSelection: 'provider_native',
            matchContext: () => 'trusted',
            buildRequest: () => errProviderAdapter('invalid_payload', 'request build failed'),
            createStreamState: () => ({}),
            parseStreamEvent: () => errProviderAdapter('invalid_payload', 'unexpected'),
            finalizeStream: () => errProviderAdapter('invalid_payload', 'unexpected'),
            parseNonStreamPayload: () => errProviderAdapter('invalid_payload', 'unexpected'),
        },
    };
}

describe('providerNativeRuntimeExecutor', () => {
    beforeEach(() => {
        executeHttpFallbackMock.mockReset();
    });

    it('fails closed before dispatch when request building fails', async () => {
        const result = await executeProviderNativeRuntime(createExecutionInput());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected request build failure to propagate.');
        }
        expect(result.error.message).toContain('request build failed');
        expect(executeHttpFallbackMock).not.toHaveBeenCalled();
    });
});

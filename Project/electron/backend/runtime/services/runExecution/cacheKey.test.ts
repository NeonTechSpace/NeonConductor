import { describe, expect, it } from 'vitest';

import { resolveRunCache } from '@/app/backend/runtime/services/runExecution/cacheKey';

const runtimeOptions = {
    reasoning: {
        effort: 'none' as const,
        summary: 'none' as const,
        includeEncrypted: false,
    },
    cache: {
        strategy: 'auto' as const,
    },
        transport: {
            family: 'auto' as const,
        },
};

describe('resolveRunCache', () => {
    it('applies cache keys for prompt-cache-capable kilo gateway models', () => {
        const result = resolveRunCache({
            profileId: 'profile_local_default',
            sessionId: 'sess_test',
            providerId: 'kilo',
            modelId: 'kilo/auto',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                supportsPromptCache: true,
                toolProtocol: 'kilo_gateway',
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            toolProtocol: 'kilo_gateway',
            runtimeOptions,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.applied).toBe(true);
        expect(result.value.key?.startsWith('nc-auto-')).toBe(true);
    });

    it('skips cache application for models without prompt-cache support', () => {
        const result = resolveRunCache({
            profileId: 'profile_local_default',
            sessionId: 'sess_test',
            providerId: 'kilo',
            modelId: 'kilo/no-cache',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                supportsPromptCache: false,
                toolProtocol: 'kilo_gateway',
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            toolProtocol: 'kilo_gateway',
            runtimeOptions,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.applied).toBe(false);
        expect(result.value.reason).toBe('model_unsupported');
    });

    it('does not mark prompt cache as applied for provider-managed OpenAI responses models', () => {
        const result = resolveRunCache({
            profileId: 'profile_local_default',
            sessionId: 'sess_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                supportsPromptCache: true,
                toolProtocol: 'openai_responses',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            toolProtocol: 'openai_responses',
            runtimeOptions,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.applied).toBe(false);
        expect(result.value.reason).toBe('provider_managed');
    });
});

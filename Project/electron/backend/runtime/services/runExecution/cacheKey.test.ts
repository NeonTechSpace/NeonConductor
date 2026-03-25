import { describe, expect, it } from 'vitest';

import { resolveRunCache } from '@/app/backend/runtime/services/runExecution/cacheKey';
import { kiloFrontierModelId } from '@/shared/kiloModels';
import type { ProviderModelCapabilities } from '@/app/backend/providers/types';

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
    function createModelCapabilities(input: ProviderModelCapabilities['features'] & {
        toolProtocol: ProviderModelCapabilities['runtime']['toolProtocol'];
    }): ProviderModelCapabilities {
        return {
            features: {
                supportsTools: input.supportsTools,
                supportsReasoning: input.supportsReasoning,
                supportsVision: input.supportsVision,
                supportsAudioInput: input.supportsAudioInput,
                supportsAudioOutput: input.supportsAudioOutput,
                ...(input.supportsPromptCache !== undefined ? { supportsPromptCache: input.supportsPromptCache } : {}),
                inputModalities: input.inputModalities,
                outputModalities: input.outputModalities,
            },
            runtime:
                input.toolProtocol === 'kilo_gateway'
                    ? {
                          toolProtocol: 'kilo_gateway',
                          apiFamily: 'kilo_gateway',
                          routedApiFamily: 'openai_compatible',
                      }
                    : {
                          toolProtocol: 'openai_responses',
                          apiFamily: 'openai_compatible',
                      },
        };
    }

    it('applies cache keys for prompt-cache-capable kilo gateway models', () => {
        const result = resolveRunCache({
            profileId: 'profile_local_default',
            sessionId: 'sess_test',
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
            modelCapabilities: createModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                supportsPromptCache: true,
                inputModalities: ['text'],
                outputModalities: ['text'],
                toolProtocol: 'kilo_gateway',
            }),
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
            modelCapabilities: createModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                supportsPromptCache: false,
                inputModalities: ['text'],
                outputModalities: ['text'],
                toolProtocol: 'kilo_gateway',
            }),
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
            modelCapabilities: createModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                supportsPromptCache: true,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'openai_responses',
            }),
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

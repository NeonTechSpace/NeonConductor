import { describe, expect, it } from 'vitest';

import { resolveModelOptimizationProfile } from '@/app/backend/runtime/services/modelOptimization/profileRegistry';
import type { ProviderModelCapabilities, ProviderRuntimeDescriptor } from '@/app/backend/providers/types';

function createModelCapabilities(overrides: {
    toolProtocol?: 'openai_responses' | 'openai_chat_completions' | 'kilo_gateway' | 'provider_native' | 'anthropic_messages' | 'google_generativeai';
    supportsReasoning?: boolean;
    supportsPromptCache?: boolean;
} = {}): ProviderModelCapabilities {
    const toolProtocol = overrides.toolProtocol ?? 'openai_responses';
    let runtime: ProviderRuntimeDescriptor;
    if (toolProtocol === 'kilo_gateway') {
        runtime = {
            toolProtocol,
            apiFamily: 'kilo_gateway',
            routedApiFamily: 'anthropic_messages',
        };
    } else if (toolProtocol === 'provider_native') {
        runtime = {
            toolProtocol,
            apiFamily: 'provider_native',
            providerNativeId: 'native-test',
        };
    } else if (toolProtocol === 'openai_responses' || toolProtocol === 'openai_chat_completions') {
        runtime = {
            toolProtocol,
            apiFamily: 'openai_compatible',
        };
    } else if (toolProtocol === 'anthropic_messages') {
        runtime = {
            toolProtocol,
            apiFamily: 'anthropic_messages',
        };
    } else {
        runtime = {
            toolProtocol,
            apiFamily: 'google_generativeai',
        };
    }
    return {
        features: {
            supportsTools: true,
            supportsReasoning: overrides.supportsReasoning ?? true,
            supportsVision: false,
            supportsAudioInput: false,
            supportsAudioOutput: false,
            supportsPromptCache: overrides.supportsPromptCache ?? true,
            inputModalities: ['text' as const],
            outputModalities: ['text' as const],
        },
        runtime,
    };
}

const runtimeOptions = {
    reasoning: {
        effort: 'medium' as const,
        summary: 'auto' as const,
        includeEncrypted: false,
    },
    cache: {
        strategy: 'auto' as const,
    },
    transport: {
        family: 'auto' as const,
    },
};

describe('model optimization profile registry', () => {
    it('resolves runtime-family profiles from typed provider runtime metadata', () => {
        const capabilities = createModelCapabilities({ toolProtocol: 'google_generativeai' });
        const profile = resolveModelOptimizationProfile({
            providerId: 'openai',
            modelId: 'openai/gemini-compatible',
            runtime: capabilities.runtime,
            modelCapabilities: capabilities,
            modelRole: 'planner',
            runtimeOptions,
        });

        expect(profile.family).toBe('gemini');
        expect(profile.modelRole).toBe('planner');
        expect(profile.toolProtocol).toBe('google_generativeai');
    });

    it('surfaces compatibility warnings without silently changing requested runtime options', () => {
        const capabilities = createModelCapabilities({
            toolProtocol: 'openai_chat_completions',
            supportsReasoning: false,
            supportsPromptCache: false,
        });
        const profile = resolveModelOptimizationProfile({
            providerId: 'openai',
            modelId: 'openai/legacy-chat',
            runtime: capabilities.runtime,
            modelCapabilities: capabilities,
            modelRole: 'apply',
            runtimeOptions: {
                ...runtimeOptions,
                cache: {
                    strategy: 'manual',
                    key: 'manual-cache',
                },
            },
        });

        expect(profile.family).toBe('openai_chat_completions');
        expect(profile.warnings.map((warning) => warning.code)).toEqual([
            'reasoning_not_supported',
            'prompt_cache_not_supported',
        ]);
    });
});

import { describe, expect, it } from 'vitest';

import {
    resolveProviderNativeRuntimeSpecializationForContext,
    supportsProviderNativeRuntimeContext,
} from '@/app/backend/providers/adapters/providerNativeSpecializationRegistry';

describe('providerNativeSpecializationRegistry', () => {
    it('matches trusted MiniMax-compatible contexts only', () => {
        const context = {
            providerId: 'openai' as const,
            modelId: 'openai/minimax-native',
            optionProfileId: 'default',
            resolvedBaseUrl: 'https://api.minimax.io/v1',
            sourceProvider: 'minimax',
            apiFamily: 'provider_native' as const,
            providerNativeId: 'minimax_openai_compat',
        };

        expect(supportsProviderNativeRuntimeContext(context)).toBe(true);
        expect(resolveProviderNativeRuntimeSpecializationForContext(context)?.id).toBe(
            'openai:minimax_chat_completions'
        );
    });
});

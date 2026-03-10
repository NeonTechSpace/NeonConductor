import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';

describe('tokenCountingService fallback', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('uses heuristic estimated counting when the tokenizer runtime is unavailable', async () => {
        vi.doMock('@/app/backend/runtime/services/context/tokenizerRuntime', () => ({
            countEncodedTextWithTokenizer: vi.fn(() => Promise.resolve({
                isErr: () => true,
                isOk: () => false,
                error: {
                    code: 'tokenizer_init_failed',
                    message: 'simulated tokenizer failure',
                },
            })),
        }));

        const { tokenCountingService } = await import('@/app/backend/runtime/services/context/tokenCountingService');
        const estimate = await tokenCountingService.estimate({
            profileId: 'profile_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            messages: [createTextMessage('user', 'Count these tokens without the tokenizer runtime.')],
        });

        expect(estimate.mode).toBe('estimated');
        expect(estimate.totalTokens).toBeGreaterThan(0);
        expect(estimate.parts).toHaveLength(1);
    });
});

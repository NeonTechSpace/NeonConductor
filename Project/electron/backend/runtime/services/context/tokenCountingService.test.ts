import { describe, expect, it } from 'vitest';

import { tokenCountingService } from '@/app/backend/runtime/services/context/tokenCountingService';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';

describe('tokenCountingService', () => {
    it('uses estimated counting for providers without a native counter', async () => {
        const estimate = await tokenCountingService.estimate({
            profileId: 'profile_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            messages: [
                createTextMessage('system', 'You are helpful.'),
                createTextMessage('user', 'Explain context compaction.'),
            ],
        });

        expect(estimate.mode).toBe('estimated');
        expect(estimate.totalTokens).toBeGreaterThan(0);
        expect(estimate.parts).toHaveLength(2);
    });

    it('prefers exact counting for zai models', () => {
        expect(
            tokenCountingService.getPreferredMode({
                providerId: 'zai',
                modelId: 'zai/glm-4.5',
            })
        ).toBe('exact');
    });

    it('falls back to the default encoding for unknown model ids', async () => {
        const estimate = await tokenCountingService.estimate({
            profileId: 'profile_test',
            providerId: 'openai',
            modelId: 'openai/not-a-real-model',
            messages: [createTextMessage('user', 'Count these tokens.')],
        });

        expect(estimate.mode).toBe('estimated');
        expect(estimate.totalTokens).toBeGreaterThan(0);
        expect(estimate.parts).toHaveLength(1);
    });
});

import { describe, expect, it } from 'vitest';

import { tokenCountingService } from '@/app/backend/runtime/services/context/tokenCountingService';

describe('tokenCountingService', () => {
    it('uses estimated counting for providers without a native counter', async () => {
        const estimate = await tokenCountingService.estimate({
            profileId: 'profile_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            messages: [
                { role: 'system', text: 'You are helpful.' },
                { role: 'user', text: 'Explain context compaction.' },
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
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    resolveUtilityModelTargetMock,
    resolvePolicyMock,
    estimatePreparedContextMessagesMock,
} = vi.hoisted(() => ({
    resolveUtilityModelTargetMock: vi.fn(),
    resolvePolicyMock: vi.fn(),
    estimatePreparedContextMessagesMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/profile/utilityModel', () => ({
    utilityModelService: {
        resolveUtilityModelTarget: resolveUtilityModelTargetMock,
    },
}));

vi.mock('@/app/backend/runtime/services/context/policyService', () => ({
    contextPolicyService: {
        resolvePolicy: resolvePolicyMock,
    },
}));

vi.mock('@/app/backend/runtime/services/context/sessionContextBudgetEvaluator', () => ({
    estimatePreparedContextMessages: estimatePreparedContextMessagesMock,
}));

import { resolveCompactionSummarizerTarget } from '@/app/backend/runtime/services/context/contextCompactionShared';

describe('contextCompactionShared', () => {
    beforeEach(() => {
        resolveUtilityModelTargetMock.mockReset();
        resolvePolicyMock.mockReset();
        estimatePreparedContextMessagesMock.mockReset();
    });

    it('falls back to the active model when the utility target cannot fit the compaction request', async () => {
        resolveUtilityModelTargetMock.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5-mini',
            source: 'utility',
        });
        resolvePolicyMock.mockResolvedValue({
            enabled: true,
            profileId: 'profile_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5-mini',
            limits: {
                profileId: 'profile_test',
                providerId: 'openai',
                modelId: 'openai/gpt-5-mini',
                modelLimitsKnown: true,
                contextLength: 20_000,
                maxOutputTokens: 2_000,
                contextLengthSource: 'static',
                maxOutputTokensSource: 'static',
                source: 'static',
            },
            mode: 'percent',
            usableInputBudgetTokens: 500,
            thresholdTokens: 400,
            percent: 10,
            safetyBufferTokens: 100,
        });
        estimatePreparedContextMessagesMock.mockResolvedValue({
            estimate: {
                providerId: 'openai',
                modelId: 'openai/gpt-5-mini',
                mode: 'estimated',
                totalTokens: 700,
                parts: [],
            },
        });

        const target = await resolveCompactionSummarizerTarget({
            profileId: 'profile_test',
            fallbackProviderId: 'zai',
            fallbackModelId: 'zai/glm-4.5-air',
            summaryMessages: [
                {
                    role: 'user',
                    parts: [{ type: 'text', text: 'Compaction prompt' }],
                },
            ],
        });

        expect(target).toEqual({
            providerId: 'zai',
            modelId: 'zai/glm-4.5-air',
            source: 'fallback',
        });
    });
});

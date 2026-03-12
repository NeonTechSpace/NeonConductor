import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerStoreMock = vi.hoisted(() => ({
    getDefaults: vi.fn(),
    modelExists: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    providerStore: providerStoreMock,
}));

import { resolveRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunTarget';

describe('resolveRunTarget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        providerStoreMock.getDefaults.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
    });

    it('fails closed when an explicit model is unavailable for the provider', async () => {
        providerStoreMock.modelExists.mockResolvedValue(false);

        const result = await resolveRunTarget({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-missing',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected explicit unavailable model to be rejected.');
        }
        expect(result.error.code).toBe('provider_model_not_available');
        expect(result.error.message).toContain('openai/gpt-missing');
    });

    it('uses the saved default only when the caller omitted both provider and model', async () => {
        providerStoreMock.modelExists.mockResolvedValue(true);

        const result = await resolveRunTarget({
            profileId: 'profile_default',
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
    });
});

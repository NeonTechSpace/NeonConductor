import { describe, expect, it } from 'vitest';

import {
    getDefaultProfileId,
    providerCatalogStore,
    registerPersistenceStoreHooks,
} from '@/app/backend/persistence/__tests__/stores.shared';
import { modelLimitOverrideStore } from '@/app/backend/persistence/stores';
import { modelLimitResolverService } from '@/app/backend/runtime/services/context/modelLimitResolverService';

registerPersistenceStoreHooks();

describe('modelLimitResolverService', () => {
    it('uses curated static limits for static providers by default', async () => {
        const profileId = getDefaultProfileId();

        const limits = await modelLimitResolverService.resolve({
            profileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        expect(limits.contextLength).toBe(400_000);
        expect(limits.maxOutputTokens).toBe(128_000);
        expect(limits.contextLengthSource).toBe('static');
        expect(limits.maxOutputTokensSource).toBe('static');
        expect(limits.source).toBe('static');
        expect(limits.modelLimitsKnown).toBe(true);
    });

    it('applies internal overrides ahead of curated static limits', async () => {
        const profileId = getDefaultProfileId();

        await modelLimitOverrideStore.upsert({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            contextLength: 123_456,
            reason: 'test_override',
        });

        const limits = await modelLimitResolverService.resolve({
            profileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        expect(limits.contextLength).toBe(123_456);
        expect(limits.maxOutputTokens).toBe(128_000);
        expect(limits.contextLengthSource).toBe('override');
        expect(limits.maxOutputTokensSource).toBe('static');
        expect(limits.source).toBe('mixed');
        expect(limits.overrideReason).toBe('test_override');
    });

    it('uses discovery-backed catalog limits for kilo models', async () => {
        const profileId = getDefaultProfileId();

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'kilo/test-model',
                label: 'Test Model',
                source: 'test_discovery',
                contextLength: 200_000,
                pricing: {},
                raw: {
                    max_output_tokens: 8_192,
                },
            },
        ]);

        const limits = await modelLimitResolverService.resolve({
            profileId,
            providerId: 'kilo',
            modelId: 'kilo/test-model',
        });

        expect(limits.contextLength).toBe(200_000);
        expect(limits.maxOutputTokens).toBe(8_192);
        expect(limits.contextLengthSource).toBe('discovery');
        expect(limits.maxOutputTokensSource).toBe('discovery');
        expect(limits.source).toBe('discovery');
    });
});

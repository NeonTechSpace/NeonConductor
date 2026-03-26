import { describe, expect, it } from 'vitest';

import { normalizeCatalogMetadata, toProviderCatalogUpsert } from '@/app/backend/providers/metadata/normalize';
import {
    listStaticModelDefinitions,
    toStaticProviderCatalogModel,
} from '@/app/backend/providers/metadata/staticCatalog/registry';
import {
    createCaller,
    providerCatalogStore,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: provider static catalog flows', () => {
    const profileId = runtimeContractProfileId;

    it('auto-backfills static openai catalogs from the local registry without codex models', async () => {
        const caller = createCaller();

        const staleOnly = listStaticModelDefinitions('openai', 'default')
            .filter((definition) => definition.modelId === 'openai/gpt-5')
            .map((definition) => toStaticProviderCatalogModel(definition, 'default'));
        const normalizedStaleOnly = normalizeCatalogMetadata('openai', staleOnly);
        await providerCatalogStore.replaceModels(
            profileId,
            'openai',
            normalizedStaleOnly.models.map(toProviderCatalogUpsert)
        );

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.some((model) => model.id === 'openai/gpt-5')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5.4')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-nano')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(false);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo-0125')).toBe(false);

        const codexModels = await caller.provider.listModels({ profileId, providerId: 'openai_codex' });
        expect(codexModels.models.some((model) => model.id === 'openai_codex/gpt-5-codex')).toBe(true);
    });

    it('syncs openai api catalog separately from codex model ids', async () => {
        const caller = createCaller();

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBeGreaterThanOrEqual(5);

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.some((model) => model.id === 'openai/gpt-5.4')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo-1106')).toBe(false);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-nano')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(false);
        expect(models.models.some((model) => model.id === 'openai/gpt-5' && model.features.supportsVision)).toBe(true);

        const codexModels = await caller.provider.listModels({ profileId, providerId: 'openai_codex' });
        const codex = codexModels.models.find((model) => model.id === 'openai_codex/gpt-5-codex');
        expect(codex).toBeDefined();
        expect(codex?.promptFamily).toBe('codex');
    });
});

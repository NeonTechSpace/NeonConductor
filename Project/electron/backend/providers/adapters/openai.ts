import type { ProviderAdapter, ProviderCatalogSyncResult } from '@/app/backend/providers/types';

export class OpenAIProviderAdapter implements ProviderAdapter {
    readonly id = 'openai' as const;

    syncCatalog(): Promise<ProviderCatalogSyncResult> {
        return Promise.resolve({
            ok: false,
            providerId: this.id,
            reason: 'not_implemented',
            detail: 'OpenAI catalog sync is deferred; seeded local catalog remains active.',
        });
    }
}

export const openAIProviderAdapter = new OpenAIProviderAdapter();

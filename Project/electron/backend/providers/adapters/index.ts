import { kiloProviderAdapter } from '@/app/backend/providers/adapters/kilo';
import { openAIProviderAdapter } from '@/app/backend/providers/adapters/openai';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { ProviderAdapter } from '@/app/backend/providers/types';

const adapters: Record<string, ProviderAdapter> = {
    kilo: kiloProviderAdapter,
    openai: openAIProviderAdapter,
};

export function getProviderAdapter(providerId: string): ProviderAdapter {
    const supported = assertSupportedProviderId(providerId);
    const adapter = adapters[supported];
    if (!adapter) {
        throw new Error(`Provider adapter not registered: "${supported}".`);
    }

    return adapter;
}

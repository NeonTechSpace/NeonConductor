import { kiloProviderAdapter } from '@/app/backend/providers/adapters/kilo';
import { openAIProviderAdapter } from '@/app/backend/providers/adapters/openai';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { ProviderAdapter } from '@/app/backend/providers/types';

const adapters: Record<FirstPartyProviderId, ProviderAdapter> = {
    kilo: kiloProviderAdapter,
    openai: openAIProviderAdapter,
};

export function getProviderAdapter(providerId: FirstPartyProviderId): ProviderAdapter {
    const supported = assertSupportedProviderId(providerId);
    return adapters[supported];
}

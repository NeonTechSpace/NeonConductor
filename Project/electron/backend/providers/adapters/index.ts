import { kiloProviderAdapter } from '@/app/backend/providers/adapters/kilo';
import { moonshotProviderAdapter } from '@/app/backend/providers/adapters/moonshot';
import { openAIProviderAdapter } from '@/app/backend/providers/adapters/openai';
import { openAICodexProviderAdapter } from '@/app/backend/providers/adapters/openaiCodex';
import { zaiProviderAdapter } from '@/app/backend/providers/adapters/zai';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { ProviderAdapter } from '@/app/backend/providers/types';

const adapters: Record<FirstPartyProviderId, ProviderAdapter> = {
    kilo: kiloProviderAdapter,
    openai: openAIProviderAdapter,
    openai_codex: openAICodexProviderAdapter,
    zai: zaiProviderAdapter,
    moonshot: moonshotProviderAdapter,
};

export function getProviderAdapter(providerId: FirstPartyProviderId): ProviderAdapter {
    const supported = assertSupportedProviderId(providerId);
    return adapters[supported];
}

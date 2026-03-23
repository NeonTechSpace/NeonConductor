import { kiloCatalogBehavior } from '@/app/backend/providers/behaviors/kilo/catalog';
import { kiloRuntimeBehavior } from '@/app/backend/providers/behaviors/kilo/runtime';
import { moonshotCatalogBehavior } from '@/app/backend/providers/behaviors/moonshot/catalog';
import { moonshotRuntimeBehavior } from '@/app/backend/providers/behaviors/moonshot/runtime';
import { openAICatalogBehavior } from '@/app/backend/providers/behaviors/openai/catalog';
import { openAIRuntimeBehavior } from '@/app/backend/providers/behaviors/openai/runtime';
import { openAICodexCatalogBehavior } from '@/app/backend/providers/behaviors/openaiCodex/catalog';
import { openAICodexRuntimeBehavior } from '@/app/backend/providers/behaviors/openaiCodex/runtime';
import type { ProviderCatalogBehavior, ProviderRuntimeBehavior } from '@/app/backend/providers/behaviors/types';
import { zaiCatalogBehavior } from '@/app/backend/providers/behaviors/zai/catalog';
import { zaiRuntimeBehavior } from '@/app/backend/providers/behaviors/zai/runtime';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';

const runtimeBehaviorRegistry: Record<FirstPartyProviderId, ProviderRuntimeBehavior> = {
    kilo: kiloRuntimeBehavior,
    openai: openAIRuntimeBehavior,
    openai_codex: openAICodexRuntimeBehavior,
    zai: zaiRuntimeBehavior,
    moonshot: moonshotRuntimeBehavior,
};

const catalogBehaviorRegistry: Record<FirstPartyProviderId, ProviderCatalogBehavior> = {
    kilo: kiloCatalogBehavior,
    openai: openAICatalogBehavior,
    openai_codex: openAICodexCatalogBehavior,
    zai: zaiCatalogBehavior,
    moonshot: moonshotCatalogBehavior,
};

export function getProviderRuntimeBehavior(providerId: string): ProviderRuntimeBehavior {
    const supportedProviderId = assertSupportedProviderId(providerId);
    return runtimeBehaviorRegistry[supportedProviderId];
}

export function getProviderCatalogBehavior(providerId: string): ProviderCatalogBehavior {
    const supportedProviderId = assertSupportedProviderId(providerId);
    return catalogBehaviorRegistry[supportedProviderId];
}

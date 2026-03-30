import { syncCatalog } from '@/app/backend/providers/service/catalogSync';
import type { ProviderServiceResult } from '@/app/backend/providers/service/errors';
import { providerProfileNormalizationGate } from '@/app/backend/providers/service/providerProfileNormalizationGate';
import type { ProviderMutationContext } from '@/app/backend/providers/service/providerMutationLifecycle.types';
import type { ProviderSyncResult } from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export function createProviderCatalogSyncMutationLifecycle(input = {
    ensureNormalizedProviderProfileState: providerProfileNormalizationGate.ensureNormalized.bind(
        providerProfileNormalizationGate
    ),
    syncCatalog,
}) {
    return {
        async syncCatalog(
            profileId: string,
            providerId: RuntimeProviderId,
            force = false,
            context?: ProviderMutationContext
        ): Promise<ProviderServiceResult<ProviderSyncResult>> {
            await input.ensureNormalizedProviderProfileState(profileId);
            return input.syncCatalog(profileId, providerId, force, context);
        },
    };
}

export const providerCatalogSyncMutationLifecycle = createProviderCatalogSyncMutationLifecycle();

export const { syncCatalog: syncProviderCatalog } = providerCatalogSyncMutationLifecycle;

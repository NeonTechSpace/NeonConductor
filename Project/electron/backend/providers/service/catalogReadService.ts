import { providerStore } from '@/app/backend/persistence/stores';
import type { InvalidProviderModelDiagnostic } from '@/app/backend/persistence/stores/provider/providerCatalogStore';
import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import { resolveProviderCatalogState } from '@/app/backend/providers/service/catalogState';
import { okProviderService, type ProviderServiceResult } from '@/app/backend/providers/service/errors';
import { listModels } from '@/app/backend/providers/service/readService';
import type { ProviderCatalogState } from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export interface ProviderCatalogReadResult {
    models: ProviderModelRecord[];
    invalidDiagnostics: InvalidProviderModelDiagnostic[];
    catalogState: ProviderCatalogState;
}

export async function readProviderCatalog(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<ProviderServiceResult<ProviderCatalogReadResult>> {
    const [modelsResult, invalidDiagnostics] = await Promise.all([
        listModels(profileId, providerId),
        providerStore.listInvalidModelDiagnostics(profileId, providerId),
    ]);

    if (modelsResult.isErr()) {
        const catalogState = await resolveProviderCatalogState({
            profileId,
            providerId,
            validModelCount: 0,
            invalidDiagnostics,
            serviceFailureReason:
                modelsResult.error.code === 'provider_not_supported' ? 'provider_not_found' : 'catalog_sync_failed',
            serviceFailureDetail: modelsResult.error.message,
        });
        return okProviderService({
            models: [],
            invalidDiagnostics,
            catalogState,
        });
    }

    const catalogState = await resolveProviderCatalogState({
        profileId,
        providerId,
        validModelCount: modelsResult.value.length,
        invalidDiagnostics,
    });

    return okProviderService({
        models: modelsResult.value,
        invalidDiagnostics,
        catalogState,
    });
}

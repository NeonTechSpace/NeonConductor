import { readProviderCatalog } from '@/app/backend/providers/service/catalogReadService';
import { okProviderService, type ProviderServiceResult } from '@/app/backend/providers/service/errors';
import {
    getDefaults,
    getSpecialistDefaults,
    getWorkflowRoutingPreferences,
} from '@/app/backend/providers/service/preferenceService';
import { internalModelRoleDiagnosticsService } from '@/app/backend/runtime/services/profile/internalModelRoleDiagnostics';
import { modelRoleDefaultService } from '@/app/backend/runtime/services/profile/modelRoleDefaults';
import { listProviders } from '@/app/backend/providers/service/readService';
import type {
    ProviderControlEntry,
    ProviderControlSnapshot,
    ProviderListItem,
} from '@/app/backend/providers/service/types';

function compareProviderEntries(left: ProviderListItem, right: ProviderListItem): number {
    if (left.id === 'kilo') {
        return -1;
    }

    if (right.id === 'kilo') {
        return 1;
    }

    return left.label.localeCompare(right.label);
}

export async function getProviderControlSnapshot(
    profileId: string
): Promise<ProviderServiceResult<ProviderControlSnapshot>> {
    const [providers, defaults, specialistDefaults, workflowRoutingPreferences, modelRoleDefaults, internalModelRoleDiagnostics] =
        await Promise.all([
        listProviders(profileId),
        getDefaults(profileId),
        getSpecialistDefaults(profileId),
        getWorkflowRoutingPreferences(profileId),
        modelRoleDefaultService.listRoleDefaults(profileId),
        internalModelRoleDiagnosticsService.getDiagnostics(profileId),
    ]);
    const orderedProviders = providers.toSorted(compareProviderEntries);

    const entries = await Promise.all(
        orderedProviders.map(async (provider): Promise<ProviderControlEntry> => {
            const catalogResult = await readProviderCatalog(profileId, provider.id);
            if (catalogResult.isErr()) {
                return {
                    provider,
                    models: [],
                    catalogState: {
                        reason: 'catalog_sync_failed',
                        detail: catalogResult.error.message,
                        invalidModelCount: 0,
                    },
                };
            }

            return {
                provider,
                models: catalogResult.value.models,
                catalogState: catalogResult.value.catalogState,
            };
        })
    );

    return okProviderService({
        entries,
        defaults,
        specialistDefaults,
        workflowRoutingPreferences,
        modelRoleDefaults,
        internalModelRoleDiagnostics,
    });
}

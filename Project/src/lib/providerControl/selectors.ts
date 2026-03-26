import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    ProviderCatalogState,
    ProviderControlEntry,
    ProviderControlSnapshot,
    ProviderListItem,
} from '@/app/backend/providers/service/types';

import type { RuntimeProviderId } from '@/shared/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/shared/contracts/types/provider';


export function listProviderControlEntries(snapshot: ProviderControlSnapshot | undefined): ProviderControlEntry[] {
    return snapshot?.entries ?? [];
}

export function listProviderControlProviders(snapshot: ProviderControlSnapshot | undefined): ProviderListItem[] {
    return listProviderControlEntries(snapshot).map((entry) => entry.provider);
}

export function listProviderControlModels(snapshot: ProviderControlSnapshot | undefined): ProviderModelRecord[] {
    return listProviderControlEntries(snapshot).flatMap((entry) => entry.models);
}

export function findProviderControlEntry(
    snapshot: ProviderControlSnapshot | undefined,
    providerId: RuntimeProviderId | undefined
): ProviderControlEntry | undefined {
    if (!providerId) {
        return undefined;
    }

    return listProviderControlEntries(snapshot).find((entry) => entry.provider.id === providerId);
}

export function getProviderControlDefaults(
    snapshot: ProviderControlSnapshot | undefined
): ProviderControlSnapshot['defaults'] | undefined {
    return snapshot?.defaults;
}

export function getProviderControlSpecialistDefaults(
    snapshot: ProviderControlSnapshot | undefined
): ProviderSpecialistDefaultRecord[] {
    return snapshot?.specialistDefaults ?? [];
}

export function getProviderControlCatalogState(
    snapshot: ProviderControlSnapshot | undefined,
    providerId: RuntimeProviderId | undefined
): ProviderCatalogState | undefined {
    return findProviderControlEntry(snapshot, providerId)?.catalogState;
}


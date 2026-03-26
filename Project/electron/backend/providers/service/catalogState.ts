import { providerCatalogStore } from '@/app/backend/persistence/stores';
import type { InvalidProviderModelDiagnostic } from '@/app/backend/persistence/stores/provider/providerCatalogStore';
import type { ProviderCatalogState } from '@/app/backend/providers/service/types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export async function resolveProviderCatalogState(input: {
    profileId: string;
    providerId: string;
    validModelCount: number;
    invalidDiagnostics: InvalidProviderModelDiagnostic[];
    serviceFailureDetail?: string;
    serviceFailureReason?: 'provider_not_found' | 'catalog_sync_failed';
}): Promise<ProviderCatalogState> {
    if (input.validModelCount > 0) {
        return {
            reason: null,
            invalidModelCount: input.invalidDiagnostics.length,
        };
    }

    if (input.serviceFailureReason) {
        return {
            reason: input.serviceFailureReason,
            ...(input.serviceFailureDetail ? { detail: input.serviceFailureDetail } : {}),
            invalidModelCount: input.invalidDiagnostics.length,
        };
    }

    const snapshots = await providerCatalogStore.listDiscoverySnapshotsByProfile(input.profileId);
    const latestModelError = snapshots
        .filter(
            (snapshot) =>
                snapshot.providerId === input.providerId && snapshot.kind === 'models' && snapshot.status === 'error'
        )
        .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];

    if (!latestModelError) {
        const detail =
            input.invalidDiagnostics.length > 0
                ? `${String(input.invalidDiagnostics.length)} persisted model row(s) were ignored because their runtime metadata is invalid.`
                : undefined;
        return {
            reason: 'catalog_empty_after_normalization',
            ...(detail ? { detail } : {}),
            invalidModelCount: input.invalidDiagnostics.length,
        };
    }

    const payload = isRecord(latestModelError.payload) ? latestModelError.payload : undefined;
    const detail = toOptionalString(payload?.['detail']);
    return {
        reason: 'catalog_sync_failed',
        ...(detail ? { detail } : {}),
        invalidModelCount: input.invalidDiagnostics.length,
    };
}

import { providerManagementService } from '@/app/backend/providers/service';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export async function resolveEmptyCatalogState(
    profileId: string,
    providerId: string
): Promise<{
    reason: 'catalog_sync_failed' | 'catalog_empty_after_normalization';
    detail?: string;
}> {
    const snapshots = await providerManagementService.listDiscoverySnapshots(profileId);
    const latestModelError = snapshots
        .filter(
            (snapshot) =>
                snapshot.providerId === providerId && snapshot.kind === 'models' && snapshot.status === 'error'
        )
        .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];

    if (!latestModelError) {
        return {
            reason: 'catalog_empty_after_normalization',
        };
    }

    const payload = isRecord(latestModelError.payload) ? latestModelError.payload : undefined;
    const detail = toOptionalString(payload?.['detail']);
    return {
        reason: 'catalog_sync_failed',
        ...(detail ? { detail } : {}),
    };
}

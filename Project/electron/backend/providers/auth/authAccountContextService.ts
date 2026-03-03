import { accountSnapshotStore, providerAuthStore } from '@/app/backend/persistence/stores';
import { getAuthState } from '@/app/backend/providers/auth/authStateService';
import { syncKiloAccountContext } from '@/app/backend/providers/auth/kiloAccountSync';
import { readSecretValue } from '@/app/backend/providers/auth/secretRefs';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export async function getAccountContext(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<ProviderAccountContextResult> {
    const authState = await getAuthState(profileId, providerId);
    if (providerId !== 'kilo') {
        return { profileId, providerId, authState };
    }

    return {
        profileId,
        providerId,
        authState,
        kiloAccountContext: await accountSnapshotStore.getByProfile(profileId),
    };
}

export async function setOrganization(
    profileId: string,
    providerId: 'kilo',
    organizationId?: string | null
): Promise<ProviderAccountContextResult> {
    const authState = await getAuthState(profileId, providerId);
    await providerAuthStore.upsert({
        profileId,
        providerId,
        authMethod: authState.authMethod,
        authState: authState.authState,
        ...(authState.accountId ? { accountId: authState.accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(authState.tokenExpiresAt ? { tokenExpiresAt: authState.tokenExpiresAt } : {}),
        ...(authState.lastErrorCode ? { lastErrorCode: authState.lastErrorCode } : {}),
        ...(authState.lastErrorMessage ? { lastErrorMessage: authState.lastErrorMessage } : {}),
    });

    const accessToken =
        (await readSecretValue(profileId, providerId, 'access_token')) ??
        (await readSecretValue(profileId, providerId, 'api_key'));
    if (accessToken) {
        await syncKiloAccountContext({
            profileId,
            accessToken,
            ...(organizationId ? { organizationId } : {}),
        });
    }

    return getAccountContext(profileId, providerId);
}

import {
    accountSnapshotStore,
    providerAuthFlowStore,
    providerAuthStore,
    providerStore,
    secretReferenceStore,
} from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { persistSecretRef } from '@/app/backend/providers/auth/secretRefs';
import type { FlowAuthMethod } from '@/app/backend/providers/auth/types';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { getSecretStore } from '@/app/backend/secrets/store';

function nowIso(): string {
    return new Date().toISOString();
}

export function defaultAuthState(profileId: string, providerId: RuntimeProviderId): ProviderAuthStateRecord {
    return {
        profileId,
        providerId,
        authMethod: 'none',
        authState: 'logged_out',
        updatedAt: nowIso(),
    };
}

export async function ensureProviderExists(providerId: RuntimeProviderId): Promise<void> {
    assertSupportedProviderId(providerId);
    const exists = await providerStore.providerExists(providerId);
    if (!exists) {
        throw new Error(`Provider "${providerId}" is not registered.`);
    }
}

export async function getAuthState(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
    return (
        (await providerAuthStore.getByProfileAndProvider(profileId, providerId)) ??
        defaultAuthState(profileId, providerId)
    );
}

export async function setApiKey(
    profileId: string,
    providerId: RuntimeProviderId,
    apiKey: string
): Promise<ProviderAuthStateRecord> {
    await ensureProviderExists(providerId);
    const normalized = apiKey.trim();
    if (normalized.length === 0) {
        throw new Error('Invalid "apiKey": expected non-empty string.');
    }

    await persistSecretRef({
        profileId,
        providerId,
        secretKind: 'api_key',
        value: normalized,
    });
    await providerAuthStore.upsert({
        profileId,
        providerId,
        authMethod: 'api_key',
        authState: 'configured',
    });

    return getAuthState(profileId, providerId);
}

export async function clearAuth(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<{ cleared: boolean; authState: ProviderAuthStateRecord }> {
    await ensureProviderExists(providerId);
    const refs = await secretReferenceStore.listByProfileAndProvider(profileId, providerId);
    await Promise.allSettled(refs.map((ref) => getSecretStore().delete(ref.secretKeyRef)));
    await secretReferenceStore.deleteByProfileAndProvider(profileId, providerId);
    await providerAuthFlowStore.cancelPendingByProvider(profileId, providerId);

    await providerAuthStore.upsert({
        profileId,
        providerId,
        authMethod: 'none',
        authState: 'logged_out',
    });

    if (providerId === 'kilo') {
        await accountSnapshotStore.upsertAccount({
            profileId,
            displayName: '',
            emailMasked: '',
            authState: 'logged_out',
        });
        await accountSnapshotStore.replaceOrganizations({
            profileId,
            organizations: [],
        });
    }

    return {
        cleared: refs.length > 0,
        authState: await getAuthState(profileId, providerId),
    };
}

export async function persistAuthenticatedState(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    authMethod: FlowAuthMethod;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: string;
    accountId?: string;
    organizationId?: string;
}): Promise<ProviderAuthStateRecord> {
    await persistSecretRef({
        profileId: input.profileId,
        providerId: input.providerId,
        secretKind: 'access_token',
        value: input.accessToken,
    });
    if (input.refreshToken) {
        await persistSecretRef({
            profileId: input.profileId,
            providerId: input.providerId,
            secretKind: 'refresh_token',
            value: input.refreshToken,
        });
    }

    await providerAuthStore.upsert({
        profileId: input.profileId,
        providerId: input.providerId,
        authMethod: input.authMethod,
        authState: 'authenticated',
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.tokenExpiresAt ? { tokenExpiresAt: input.tokenExpiresAt } : {}),
    });

    return getAuthState(input.profileId, input.providerId);
}

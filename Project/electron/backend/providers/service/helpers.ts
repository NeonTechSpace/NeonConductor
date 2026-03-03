import { providerStore, secretReferenceStore } from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { getSecretStore } from '@/app/backend/secrets/store';

export function defaultAuthState(profileId: string, providerId: RuntimeProviderId): ProviderAuthStateRecord {
    return {
        profileId,
        providerId,
        authMethod: 'none',
        authState: 'logged_out',
        updatedAt: new Date().toISOString(),
    };
}

export async function ensureSupportedProvider(providerId: RuntimeProviderId): Promise<RuntimeProviderId> {
    const supportedProviderId = assertSupportedProviderId(providerId);
    const exists = await providerStore.providerExists(supportedProviderId);
    if (!exists) {
        throw new Error(`Provider "${supportedProviderId}" is not registered.`);
    }

    return supportedProviderId;
}

export async function resolveSecret(
    profileId: string,
    providerId: RuntimeProviderId,
    secretKind: 'api_key' | 'access_token'
): Promise<string | undefined> {
    const ref = await secretReferenceStore.getByProfileProviderAndKind(profileId, providerId, secretKind);
    if (!ref) {
        return undefined;
    }

    const value = await getSecretStore().get(ref.secretKeyRef);
    return value ?? undefined;
}

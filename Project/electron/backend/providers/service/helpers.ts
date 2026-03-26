import { providerStore } from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { toSupportedProviderIdResult, type FirstPartyProviderId } from '@/app/backend/providers/registry';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
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

export async function ensureSupportedProvider(
    providerId: RuntimeProviderId
): Promise<ProviderServiceResult<FirstPartyProviderId>> {
    const supportedProviderIdResult = toSupportedProviderIdResult(providerId);
    if (supportedProviderIdResult.isErr()) {
        return errProviderService('provider_not_supported', supportedProviderIdResult.error.message);
    }

    const supportedProviderId = supportedProviderIdResult.value;
    const exists = await providerStore.providerExists(supportedProviderId);
    if (!exists) {
        return errProviderService('provider_not_registered', `Provider "${supportedProviderId}" is not registered.`);
    }

    return okProviderService(supportedProviderId);
}

export async function resolveSecret(
    profileId: string,
    providerId: RuntimeProviderId,
    secretKind: 'api_key' | 'access_token'
): Promise<string | undefined> {
    const value = await getSecretStore().getValue(profileId, providerId, secretKind);
    return value ?? undefined;
}

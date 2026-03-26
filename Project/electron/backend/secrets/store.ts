import { providerSecretStore } from '@/app/backend/persistence/stores';
import type { ProviderSecretKind, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { appLog } from '@/app/main/logging';

export interface ProviderSecretStoreBackend {
    getValue(profileId: string, providerId: RuntimeProviderId, secretKind: ProviderSecretKind): Promise<string | null>;
    setValue(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        secretKind: ProviderSecretKind;
        secretValue: string;
    }): Promise<void>;
    deleteValue(profileId: string, providerId: RuntimeProviderId, secretKind: ProviderSecretKind): Promise<void>;
}

export interface SecretStoreInfo {
    backend: 'database' | 'memory';
    available: boolean;
}

function buildSecretMapKey(profileId: string, providerId: RuntimeProviderId, secretKind: ProviderSecretKind): string {
    return `${profileId}::${providerId}::${secretKind}`;
}

export class InMemorySecretStore implements ProviderSecretStoreBackend {
    private readonly data = new Map<string, string>();

    getValue(profileId: string, providerId: RuntimeProviderId, secretKind: ProviderSecretKind): Promise<string | null> {
        return Promise.resolve(this.data.get(buildSecretMapKey(profileId, providerId, secretKind)) ?? null);
    }

    setValue(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        secretKind: ProviderSecretKind;
        secretValue: string;
    }): Promise<void> {
        this.data.set(buildSecretMapKey(input.profileId, input.providerId, input.secretKind), input.secretValue);
        return Promise.resolve();
    }

    deleteValue(profileId: string, providerId: RuntimeProviderId, secretKind: ProviderSecretKind): Promise<void> {
        this.data.delete(buildSecretMapKey(profileId, providerId, secretKind));
        return Promise.resolve();
    }
}

class DatabaseSecretStore implements ProviderSecretStoreBackend {
    getValue(profileId: string, providerId: RuntimeProviderId, secretKind: ProviderSecretKind): Promise<string | null> {
        return providerSecretStore.getValue(profileId, providerId, secretKind);
    }

    async setValue(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        secretKind: ProviderSecretKind;
        secretValue: string;
    }): Promise<void> {
        await providerSecretStore.upsertValue({
            profileId: input.profileId,
            providerId: input.providerId,
            secretKind: input.secretKind,
            secretValue: input.secretValue,
        });
    }

    async deleteValue(profileId: string, providerId: RuntimeProviderId, secretKind: ProviderSecretKind): Promise<void> {
        await providerSecretStore.deleteByProfileProviderAndKind(profileId, providerId, secretKind);
    }
}

let store: ProviderSecretStoreBackend = new InMemorySecretStore();
let storeInfo: SecretStoreInfo = {
    backend: 'memory',
    available: true,
};

export function getSecretStore(): ProviderSecretStoreBackend {
    return store;
}

export function getSecretStoreInfo(): SecretStoreInfo {
    return storeInfo;
}

export function initializeSecretStore(nextStore?: ProviderSecretStoreBackend): ProviderSecretStoreBackend {
    if (nextStore) {
        store = nextStore;
        storeInfo = {
            backend: 'memory',
            available: true,
        };
        appLog.debug({
            tag: 'secrets.store',
            message: 'Initialized override secret store.',
            backend: storeInfo.backend,
        });
        return store;
    }

    store = new DatabaseSecretStore();
    storeInfo = {
        backend: 'database',
        available: true,
    };
    appLog.info({
        tag: 'secrets.store',
        message: 'Initialized database-backed secret store.',
        backend: storeInfo.backend,
    });

    return store;
}

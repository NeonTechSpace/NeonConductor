import { createKeytarSecretStore, SecretStoreUnavailableError } from '@/app/backend/secrets/keytarStore';
import type { SecretStoreInfo, SecretStoreLike } from '@/app/backend/secrets/keytarStore';

export type SecretStore = SecretStoreLike;
export { SecretStoreUnavailableError };
export type { SecretStoreInfo };

export class InMemorySecretStore implements SecretStore {
    private readonly data = new Map<string, string>();

    get(key: string): Promise<string | null> {
        return Promise.resolve(this.data.get(key) ?? null);
    }

    set(key: string, value: string): Promise<void> {
        this.data.set(key, value);
        return Promise.resolve();
    }

    delete(key: string): Promise<void> {
        this.data.delete(key);
        return Promise.resolve();
    }
}

let store: SecretStore = new InMemorySecretStore();
let storeInfo: SecretStoreInfo = {
    backend: 'memory',
    available: true,
};

function isTestRuntime(): boolean {
    return process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true';
}

export function getSecretStore(): SecretStore {
    return store;
}

export function getSecretStoreInfo(): SecretStoreInfo {
    return storeInfo;
}

export function initializeSecretStore(nextStore?: SecretStore): SecretStore {
    if (nextStore) {
        store = nextStore;
        storeInfo = {
            backend: 'memory',
            available: true,
        };
        return store;
    }

    if (isTestRuntime()) {
        store = new InMemorySecretStore();
        storeInfo = {
            backend: 'memory',
            available: true,
        };
        return store;
    }

    const keytar = createKeytarSecretStore();
    store = keytar.store;
    storeInfo = keytar.info;

    return store;
}

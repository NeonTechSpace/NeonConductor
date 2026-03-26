import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';

const originalNodeEnv = process.env['NODE_ENV'];
const originalVitestFlag = process.env['VITEST'];

describe('secret store', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    afterEach(() => {
        if (originalNodeEnv === undefined) {
            delete process.env['NODE_ENV'];
        } else {
            process.env['NODE_ENV'] = originalNodeEnv;
        }

        if (originalVitestFlag === undefined) {
            delete process.env['VITEST'];
        } else {
            process.env['VITEST'] = originalVitestFlag;
        }

        vi.resetModules();
    });

    it('supports explicit in-memory injection for tests', async () => {
        const { InMemorySecretStore, getSecretStore, getSecretStoreInfo, initializeSecretStore } =
            await import('@/app/backend/secrets/store');
        const injectedStore = new InMemorySecretStore();
        initializeSecretStore(injectedStore);
        const profileId = 'profile_test';

        const secretStore = getSecretStore();
        await secretStore.setValue({
            profileId,
            providerId: 'openai',
            secretKind: 'api_key',
            secretValue: 'token-value',
        });
        await expect(secretStore.getValue(profileId, 'openai', 'api_key')).resolves.toBe('token-value');
        await secretStore.deleteValue(profileId, 'openai', 'api_key');
        await expect(secretStore.getValue(profileId, 'openai', 'api_key')).resolves.toBeNull();

        expect(getSecretStoreInfo()).toEqual({
            backend: 'memory',
            available: true,
        });
    });

    it('uses database-backed provider secrets outside test runtime injection', async () => {
        process.env['NODE_ENV'] = 'production';
        delete process.env['VITEST'];

        vi.resetModules();
        const { resetPersistenceForTests } = await import('@/app/backend/persistence/db');
        const { providerSecretStore } = await import('@/app/backend/persistence/stores');
        const { getSecretStore, getSecretStoreInfo, initializeSecretStore } =
            await import('@/app/backend/secrets/store');
        const profileId = getDefaultProfileId();
        resetPersistenceForTests();
        initializeSecretStore();

        expect(getSecretStoreInfo()).toEqual({
            backend: 'database',
            available: true,
        });

        const secretStore = getSecretStore();
        await secretStore.setValue({
            profileId,
            providerId: 'openai',
            secretKind: 'api_key',
            secretValue: 'database-token',
        });

        await expect(secretStore.getValue(profileId, 'openai', 'api_key')).resolves.toBe('database-token');
        await expect(providerSecretStore.getValue(profileId, 'openai', 'api_key')).resolves.toBe('database-token');

        await secretStore.deleteValue(profileId, 'openai', 'api_key');
        await expect(providerSecretStore.getValue(profileId, 'openai', 'api_key')).resolves.toBeNull();
    });
});

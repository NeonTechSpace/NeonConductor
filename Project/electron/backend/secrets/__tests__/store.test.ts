import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetPersistenceForTests } from '@/app/backend/persistence/db';

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

    it('uses encrypted database-backed provider secrets outside explicit test injection', async () => {
        vi.resetModules();
        const { getDefaultProfileId, getPersistence, resetPersistenceForTests } =
            await import('@/app/backend/persistence/db');
        const { providerSecretStore } = await import('@/app/backend/persistence/stores');
        const { getSecretStore, getSecretStoreInfo, initializeSecretStore } =
            await import('@/app/backend/secrets/store');
        const profileId = getDefaultProfileId();
        resetPersistenceForTests();
        initializeSecretStore();

        await vi.waitFor(() => {
            expect(getSecretStoreInfo()).toEqual({
                backend: 'encrypted-database',
                available: true,
                payloadCodec: 'test',
            });
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

        const row = getPersistence()
            .sqlite.prepare('SELECT secret_payload FROM provider_secrets WHERE profile_id = ?')
            .get(profileId) as { secret_payload: string } | undefined;
        expect(row?.secret_payload).toBeDefined();
        expect(row?.secret_payload).not.toBe('database-token');
        expect(row?.secret_payload).not.toContain('database-token');

        await secretStore.deleteValue(profileId, 'openai', 'api_key');
        await expect(providerSecretStore.getValue(profileId, 'openai', 'api_key')).resolves.toBeNull();
    });

    it('fails closed when encrypted database payload encryption is unavailable', async () => {
        vi.resetModules();
        const { getDefaultProfileId, resetPersistenceForTests } = await import('@/app/backend/persistence/db');
        const { configureSecretPayloadCodec } = await import('@/app/backend/secrets/secretPayloadCodec');
        const { getSecretStore, getSecretStoreInfo, initializeSecretStore } =
            await import('@/app/backend/secrets/store');
        resetPersistenceForTests();
        configureSecretPayloadCodec({
            backend: 'electron-safe-storage',
            encrypt: () => Promise.reject(new Error('codec unavailable')),
            decrypt: () => Promise.reject(new Error('codec unavailable')),
            isAvailable: () => Promise.resolve(false),
        });
        initializeSecretStore();

        await vi.waitFor(() => {
            expect(getSecretStoreInfo()).toEqual({
                backend: 'encrypted-database',
                available: false,
                payloadCodec: 'electron-safe-storage',
            });
        });

        await expect(
            getSecretStore().setValue({
                profileId: getDefaultProfileId(),
                providerId: 'openai',
                secretKind: 'api_key',
                secretValue: 'must-not-write',
            })
        ).rejects.toThrow('codec unavailable');
    });
});

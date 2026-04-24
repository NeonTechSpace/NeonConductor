import { Buffer } from 'node:buffer';

import { appLog } from '@/app/main/logging';

const SAFE_STORAGE_PREFIX = 'v1:electron-safe-storage:';
const TEST_CODEC_PREFIX = 'v1:test-secret-payload:';

export interface SecretPayloadCodec {
    readonly backend: 'electron-safe-storage' | 'test';
    encrypt(secretValue: string): Promise<string>;
    decrypt(secretPayload: string): Promise<string | null>;
    isAvailable(): Promise<boolean>;
}

class ElectronSafeStorageSecretPayloadCodec implements SecretPayloadCodec {
    readonly backend = 'electron-safe-storage' as const;

    async encrypt(secretValue: string): Promise<string> {
        const safeStorage = await loadSafeStorage();
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Electron safeStorage encryption is unavailable.');
        }

        return `${SAFE_STORAGE_PREFIX}${safeStorage.encryptString(secretValue).toString('base64')}`;
    }

    async decrypt(secretPayload: string): Promise<string | null> {
        if (!secretPayload.startsWith(SAFE_STORAGE_PREFIX)) {
            return null;
        }

        const safeStorage = await loadSafeStorage();
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Electron safeStorage encryption is unavailable.');
        }

        const encryptedValue = Buffer.from(secretPayload.slice(SAFE_STORAGE_PREFIX.length), 'base64');
        return safeStorage.decryptString(encryptedValue);
    }

    async isAvailable(): Promise<boolean> {
        const safeStorage = await loadSafeStorage();
        return safeStorage.isEncryptionAvailable();
    }
}

class TestSecretPayloadCodec implements SecretPayloadCodec {
    readonly backend = 'test' as const;

    encrypt(secretValue: string): Promise<string> {
        return Promise.resolve(`${TEST_CODEC_PREFIX}${Buffer.from(secretValue, 'utf8').toString('base64')}`);
    }

    decrypt(secretPayload: string): Promise<string | null> {
        if (!secretPayload.startsWith(TEST_CODEC_PREFIX)) {
            return Promise.resolve(null);
        }

        return Promise.resolve(Buffer.from(secretPayload.slice(TEST_CODEC_PREFIX.length), 'base64').toString('utf8'));
    }

    isAvailable(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

let activeCodec: SecretPayloadCodec | null = null;

async function loadSafeStorage(): Promise<{
    isEncryptionAvailable: () => boolean;
    encryptString: (plainText: string) => Buffer;
    decryptString: (encryptedValue: Buffer) => string;
}> {
    const electron = (await import('electron')) as {
        safeStorage?: {
            isEncryptionAvailable: () => boolean;
            encryptString: (plainText: string) => Buffer;
            decryptString: (encryptedValue: Buffer) => string;
        };
    };
    if (!electron.safeStorage) {
        throw new Error('Electron safeStorage is not available in this runtime.');
    }

    return electron.safeStorage;
}

function createDefaultCodec(): SecretPayloadCodec {
    if (process.env['VITEST']) {
        return new TestSecretPayloadCodec();
    }

    return new ElectronSafeStorageSecretPayloadCodec();
}

export function configureSecretPayloadCodec(codec: SecretPayloadCodec | null): void {
    activeCodec = codec;
}

export function getSecretPayloadCodec(): SecretPayloadCodec {
    activeCodec ??= createDefaultCodec();
    return activeCodec;
}

export async function getSecretPayloadCodecAvailability(): Promise<{
    backend: SecretPayloadCodec['backend'];
    available: boolean;
}> {
    const codec = getSecretPayloadCodec();
    try {
        return {
            backend: codec.backend,
            available: await codec.isAvailable(),
        };
    } catch (error) {
        appLog.warn({
            tag: 'secrets.payload',
            message: 'Secret payload codec is unavailable.',
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            backend: codec.backend,
            available: false,
        };
    }
}

export async function encryptSecretPayload(secretValue: string): Promise<string> {
    return getSecretPayloadCodec().encrypt(secretValue);
}

export async function decryptSecretPayload(secretPayload: string): Promise<string | null> {
    return getSecretPayloadCodec().decrypt(secretPayload);
}

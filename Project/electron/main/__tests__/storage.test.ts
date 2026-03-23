import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    resolveDesktopStorage,
    resolveDesktopStoragePaths,
    resolveDevelopmentUserDataPath,
} from '@/app/main/runtime/storage';

describe('desktop storage resolver', () => {
    const previousUserDataPath = process.env['NEONCONDUCTOR_USER_DATA_PATH'];

    afterEach(() => {
        if (previousUserDataPath === undefined) {
            delete process.env['NEONCONDUCTOR_USER_DATA_PATH'];
        } else {
            process.env['NEONCONDUCTOR_USER_DATA_PATH'] = previousUserDataPath;
        }
    });

    it('isolates development storage under a sibling dev userData root', () => {
        const defaultUserDataPath = 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor';
        const storage = resolveDesktopStorage({
            defaultUserDataPath,
            isDev: true,
            packagedRuntimeNamespace: 'alpha',
        });
        const storagePaths = resolveDesktopStoragePaths(storage);

        expect(resolveDevelopmentUserDataPath(defaultUserDataPath)).toBe(`${defaultUserDataPath}-dev`);
        expect(storage).toEqual({
            userDataPath: `${defaultUserDataPath}-dev`,
            runtimeNamespace: 'development',
            isDevIsolatedStorage: true,
        });
        expect(storagePaths.runtimeRoot).toBe(path.join(`${defaultUserDataPath}-dev`, 'runtime', 'development'));
        expect(storagePaths.dbPath).toBe(
            path.join(`${defaultUserDataPath}-dev`, 'runtime', 'development', 'neonconductor.db')
        );
        expect(storagePaths.logsPath).toBe(path.join(`${defaultUserDataPath}-dev`, 'logs'));
    });

    it('keeps packaged storage under the selected release namespace', () => {
        const defaultUserDataPath = 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor';
        const storage = resolveDesktopStorage({
            defaultUserDataPath,
            isDev: false,
            packagedRuntimeNamespace: 'beta',
        });
        const storagePaths = resolveDesktopStoragePaths(storage);

        expect(storage).toEqual({
            userDataPath: defaultUserDataPath,
            runtimeNamespace: 'beta',
            isDevIsolatedStorage: false,
        });
        expect(storagePaths.runtimeRoot).toBe(path.join(defaultUserDataPath, 'runtime', 'beta'));
        expect(storagePaths.dbPath).toBe(path.join(defaultUserDataPath, 'runtime', 'beta', 'neonconductor.db'));
        expect(storagePaths.logsPath).toBe(path.join(defaultUserDataPath, 'logs'));
    });

    it('uses an explicit absolute userData override without forcing the sibling dev suffix', () => {
        const configuredUserDataPath = 'D:\\Temp\\neon-shell-validation';
        process.env['NEONCONDUCTOR_USER_DATA_PATH'] = configuredUserDataPath;

        const storage = resolveDesktopStorage({
            defaultUserDataPath: 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor',
            isDev: true,
            packagedRuntimeNamespace: 'alpha',
        });
        const storagePaths = resolveDesktopStoragePaths(storage);

        expect(storage).toEqual({
            userDataPath: configuredUserDataPath,
            runtimeNamespace: 'development',
            isDevIsolatedStorage: false,
        });
        expect(storagePaths.runtimeRoot).toBe(path.join(configuredUserDataPath, 'runtime', 'development'));
        expect(storagePaths.dbPath).toBe(path.join(configuredUserDataPath, 'runtime', 'development', 'neonconductor.db'));
        expect(storagePaths.logsPath).toBe(path.join(configuredUserDataPath, 'logs'));
    });
});

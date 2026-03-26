import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    assertSandboxedPreloadBundles,
    parseDesktopDoctorScope,
    preloadBundleUsesUnsupportedModuleSyntax,
    resolveDesktopDoctorPaths,
} from '../doctor-desktop';

describe('doctor-desktop', () => {
    const previousUserDataPath = process.env['NEONCONDUCTOR_USER_DATA_PATH'];
    const previousRuntimeNamespace = process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE'];
    const previousPersistenceChannel = process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL'];
    const temporaryDirectories: string[] = [];

    afterEach(() => {
        if (previousUserDataPath === undefined) {
            delete process.env['NEONCONDUCTOR_USER_DATA_PATH'];
        } else {
            process.env['NEONCONDUCTOR_USER_DATA_PATH'] = previousUserDataPath;
        }

        if (previousRuntimeNamespace === undefined) {
            delete process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE'];
        } else {
            process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE'] = previousRuntimeNamespace;
        }

        if (previousPersistenceChannel === undefined) {
            delete process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL'];
        } else {
            process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL'] = previousPersistenceChannel;
        }

        for (const temporaryDirectory of temporaryDirectories.splice(0)) {
            rmSync(temporaryDirectory, {
                force: true,
                recursive: true,
            });
        }
    });

    it('defaults to packaged scope when no explicit scope is provided', () => {
        expect(parseDesktopDoctorScope([])).toBe('packaged');
    });

    it('resolves packaged storage under the selected packaged namespace', () => {
        const packagedUserDataPath = 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor';
        process.env['NEONCONDUCTOR_USER_DATA_PATH'] = packagedUserDataPath;
        process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE'] = 'beta';

        const desktopPaths = resolveDesktopDoctorPaths('packaged');

        expect(desktopPaths).toMatchObject({
            scope: 'packaged',
            userDataRoot: packagedUserDataPath,
            runtimeNamespace: 'beta',
            runtimeRoot: path.join(packagedUserDataPath, 'runtime', 'beta'),
            dbPath: path.join(packagedUserDataPath, 'runtime', 'beta', 'neonconductor.db'),
            logsRoot: path.join(packagedUserDataPath, 'logs'),
            isDevIsolatedStorage: false,
        });
    });

    it('resolves development storage under an isolated dev userData root', () => {
        const packagedUserDataPath = 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor';
        process.env['NEONCONDUCTOR_USER_DATA_PATH'] = packagedUserDataPath;
        process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE'] = 'alpha';

        const desktopPaths = resolveDesktopDoctorPaths('development');

        expect(desktopPaths).toMatchObject({
            scope: 'development',
            userDataRoot: `${packagedUserDataPath}-dev`,
            runtimeNamespace: 'development',
            runtimeRoot: path.join(`${packagedUserDataPath}-dev`, 'runtime', 'development'),
            dbPath: path.join(`${packagedUserDataPath}-dev`, 'runtime', 'development', 'neonconductor.db'),
            logsRoot: path.join(`${packagedUserDataPath}-dev`, 'logs'),
            isDevIsolatedStorage: true,
        });
    });

    it('treats classic sandboxed preload bundles as valid desktop build output', () => {
        const distElectronRoot = mkdtempSync(path.join(os.tmpdir(), 'doctor-desktop-'));
        temporaryDirectories.push(distElectronRoot);

        writeFileSync(path.join(distElectronRoot, 'mainWindow.cjs'), '"use strict";const electron=require("electron");');
        writeFileSync(path.join(distElectronRoot, 'splashWindow.cjs'), '"use strict";const electron=require("electron");');

        expect(assertSandboxedPreloadBundles(distElectronRoot)).toMatchObject([
            {
                bundleName: 'mainWindow.cjs',
                exists: true,
                usesUnsupportedModuleSyntax: false,
            },
            {
                bundleName: 'splashWindow.cjs',
                exists: true,
                usesUnsupportedModuleSyntax: false,
            },
        ]);
    });

    it('rejects sandboxed preload bundles that still contain top-level ESM import syntax', () => {
        const distElectronRoot = mkdtempSync(path.join(os.tmpdir(), 'doctor-desktop-'));
        temporaryDirectories.push(distElectronRoot);

        writeFileSync(path.join(distElectronRoot, 'mainWindow.cjs'), 'import { contextBridge } from "electron";');
        writeFileSync(path.join(distElectronRoot, 'splashWindow.cjs'), '"use strict";const electron=require("electron");');

        expect(() => assertSandboxedPreloadBundles(distElectronRoot)).toThrow(
            /contains top-level ESM syntax/i
        );
    });

    it('detects unsupported module syntax using the shared preload classifier', () => {
        expect(preloadBundleUsesUnsupportedModuleSyntax('import { contextBridge } from "electron";')).toBe(true);
        expect(preloadBundleUsesUnsupportedModuleSyntax('export const bridge = true;')).toBe(true);
        expect(preloadBundleUsesUnsupportedModuleSyntax('"use strict";const electron=require("electron");')).toBe(false);
    });
});

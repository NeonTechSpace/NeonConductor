import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { appState } = vi.hoisted(() => ({
    appState: {
        isPackaged: false,
        appPath: 'C:/repo/Project',
    },
}));

vi.mock('electron', () => ({
    app: {
        getAppPath: () => appState.appPath,
        get isPackaged() {
            return appState.isPackaged;
        },
    },
    BrowserWindow: vi.fn(),
    Menu: {},
    dialog: {},
    ipcMain: {},
    session: {},
    shell: {},
    WebContentsView: vi.fn(),
}));

import { VendoredNodeResolver } from '@/app/backend/runtime/services/environment/vendoredNodeResolver';

const tempDirs: string[] = [];

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        rmSync(tempDir, { recursive: true, force: true });
    }
});

describe('vendoredNodeResolver', () => {
    it('resolves the development asset path for the current target when the binary exists', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-node-dev-'));
        tempDirs.push(tempDir);
        mkdirSync(path.join(tempDir, 'vendor', 'node', 'win32-x64'), { recursive: true });
        writeFileSync(path.join(tempDir, 'vendor', 'node', 'win32-x64', 'node.exe'), 'stub', 'utf8');
        appState.appPath = tempDir;
        appState.isPackaged = false;

        const resolver = new VendoredNodeResolver();
        const resolved = await resolver.resolve({
            platform: 'win32',
            arch: 'x64',
        });

        expect(resolved).toEqual({
            available: true,
            targetKey: 'win32-x64',
            executableName: 'node.exe',
            executablePath: path.join(tempDir, 'vendor', 'node', 'win32-x64', 'node.exe'),
        });
    });

    it('resolves the packaged resource path when the binary exists', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-node-packaged-'));
        tempDirs.push(tempDir);
        const resourcesPath = path.join(tempDir, 'resources');
        mkdirSync(path.join(resourcesPath, 'vendor', 'node', 'linux-x64'), { recursive: true });
        writeFileSync(path.join(resourcesPath, 'vendor', 'node', 'linux-x64', 'node'), 'stub', 'utf8');
        appState.appPath = 'ignored-for-packaged';
        appState.isPackaged = true;

        const resolver = new VendoredNodeResolver();
        const resolved = await resolver.resolve({
            platform: 'linux',
            arch: 'x64',
            resourcesPath,
        });

        expect(resolved).toEqual({
            available: true,
            targetKey: 'linux-x64',
            executableName: 'node',
            executablePath: path.join(resourcesPath, 'vendor', 'node', 'linux-x64', 'node'),
        });
    });

    it('returns a missing-asset resolution when the target is supported but not present', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-node-missing-'));
        tempDirs.push(tempDir);
        appState.appPath = tempDir;
        appState.isPackaged = false;

        const resolver = new VendoredNodeResolver();
        const resolved = await resolver.resolve({
            platform: 'darwin',
            arch: 'arm64',
        });

        expect(resolved).toEqual({
            available: false,
            targetKey: 'darwin-arm64',
            executableName: 'node',
            executablePath: path.join(tempDir, 'vendor', 'node', 'darwin-arm64', 'node'),
            reason: 'missing_asset',
        });
    });

    it('returns an unsupported-target resolution for unsupported platform and arch combinations', async () => {
        const resolver = new VendoredNodeResolver();
        const resolved = await resolver.resolve({
            platform: 'linux',
            arch: 'arm64',
        });

        expect(resolved).toEqual({
            available: false,
            reason: 'unsupported_target',
        });
    });
});

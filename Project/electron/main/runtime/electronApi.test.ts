import { afterEach, describe, expect, it, vi } from 'vitest';

import { ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE } from '@/app/main/runtime/electronRuntimeResolver';

function createElectronRuntimeApiMock() {
    return {
        app: { name: 'NeonConductor' },
        BrowserWindow: function BrowserWindow() {},
        Menu: { buildFromTemplate: vi.fn() },
        dialog: { showErrorBox: vi.fn() },
        ipcMain: { handle: vi.fn() },
        session: { defaultSession: {} },
        shell: { openExternal: vi.fn() },
        WebContentsView: function WebContentsView() {},
    };
}

describe('electronApi', () => {
    afterEach(() => {
        vi.doUnmock('electron');
        vi.resetModules();
    });

    it('uses namespace exports when the default export is Electron package metadata', async () => {
        const electronApi = createElectronRuntimeApiMock();
        vi.doMock('electron', () => ({
            ...electronApi,
            default: 'C:\\Program Files\\Electron\\electron.exe',
        }));

        const runtimeApi = await import('./electronApi');

        expect(runtimeApi.app.name).toBe(electronApi.app.name);
        expect('showErrorBox' in runtimeApi.dialog).toBe(true);
    });

    it('binds Electron object methods to the resolved runtime object', async () => {
        const electronApp = {
            name: 'NeonConductor',
            getPath: vi.fn(function (this: { name: string }, pathName: string) {
                if (this !== electronApp) {
                    throw new TypeError('Illegal invocation');
                }
                return `${this.name}:${pathName}`;
            }),
        };
        vi.doMock('electron', () => ({
            app: electronApp,
            BrowserWindow: function BrowserWindow() {},
            dialog: { showErrorBox: vi.fn() },
            ipcMain: { handle: vi.fn() },
            default: 'C:\\Program Files\\Electron\\electron.exe',
        }));

        const runtimeApi = await import('./electronApi');

        expect(runtimeApi.app.getPath('userData')).toBe('NeonConductor:userData');
        expect(electronApp.getPath).toHaveBeenCalledWith('userData');
    });

    it('fails with an actionable diagnostic when Electron runs as Node', async () => {
        vi.doMock('electron', () => ({
            default: 'C:\\Program Files\\Electron\\electron.exe',
        }));

        const runtimeApi = await import('./electronApi');

        expect(() => runtimeApi.app.name).toThrow(ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE);
    });
});

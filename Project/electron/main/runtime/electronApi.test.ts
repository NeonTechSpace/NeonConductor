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

    it('fails with an actionable diagnostic when Electron runs as Node', async () => {
        vi.doMock('electron', () => ({
            default: 'C:\\Program Files\\Electron\\electron.exe',
        }));

        const runtimeApi = await import('./electronApi');

        expect(() => runtimeApi.app.name).toThrow(ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE);
    });
});

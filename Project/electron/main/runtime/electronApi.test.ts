import { afterEach, describe, expect, it, vi } from 'vitest';

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

        expect(runtimeApi.app).toBe(electronApi.app);
        expect(runtimeApi.dialog).toBe(electronApi.dialog);
    });

});

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

    it('fails with an actionable diagnostic when Electron runs as Node', async () => {
        vi.doMock('electron', () => ({
            default: 'C:\\Program Files\\Electron\\electron.exe',
        }));

        await expect(import('./electronApi')).rejects.toThrow(
            'Electron main-process API is unavailable. If ELECTRON_RUN_AS_NODE=1 is inherited from the caller environment'
        );
    });
});

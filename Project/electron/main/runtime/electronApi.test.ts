import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unavailableMessage =
    'Electron main-process API is unavailable. If ELECTRON_RUN_AS_NODE=1 is inherited from the caller environment, Electron runs as Node and the electron package resolves to the launcher path instead of the desktop runtime API. Use `pnpm run desktop:launch` for built desktop validation.';

const electronRuntimeResolverMock = vi.hoisted(() => ({
    runtimeApi: undefined as Record<string, unknown> | undefined,
    error: undefined as Error | undefined,
}));

vi.mock('@/app/main/runtime/electronRuntimeResolver', () => ({
    ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE: unavailableMessage,
    resolveElectronRuntimeValue: (key: string) => {
        if (electronRuntimeResolverMock.error) {
            throw electronRuntimeResolverMock.error;
        }
        const value = electronRuntimeResolverMock.runtimeApi?.[key];
        if (value === undefined) {
            throw new Error(unavailableMessage);
        }
        return value;
    },
}));

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
    beforeEach(() => {
        electronRuntimeResolverMock.runtimeApi = undefined;
        electronRuntimeResolverMock.error = undefined;
        vi.doUnmock('electron');
        vi.resetModules();
    });

    afterEach(() => {
        vi.doUnmock('electron');
        vi.resetModules();
    });

    it('uses namespace exports when the default export is Electron package metadata', async () => {
        const electronApi = createElectronRuntimeApiMock();
        electronRuntimeResolverMock.runtimeApi = electronApi;

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
        const electronApi = {
            ...createElectronRuntimeApiMock(),
            app: electronApp,
        };
        electronRuntimeResolverMock.runtimeApi = electronApi;

        const runtimeApi = await import('./electronApi');

        expect(runtimeApi.app.getPath('userData')).toBe('NeonConductor:userData');
        expect(electronApp.getPath).toHaveBeenCalledWith('userData');
    });

    it('fails with an actionable diagnostic when Electron runs as Node', async () => {
        electronRuntimeResolverMock.error = new Error(unavailableMessage);

        const runtimeApi = await import('./electronApi');

        expect(() => runtimeApi.app.name).toThrow(unavailableMessage);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exposeElectronTRPCSpy, exposeInMainWorldSpy, ipcInvokeSpy } = vi.hoisted(() => ({
    exposeElectronTRPCSpy: vi.fn(),
    exposeInMainWorldSpy: vi.fn(),
    ipcInvokeSpy: vi.fn(),
}));

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld: exposeInMainWorldSpy,
    },
    ipcRenderer: {
        invoke: ipcInvokeSpy,
    },
}));

vi.mock('electron-trpc-experimental/preload', () => ({
    exposeElectronTRPC: exposeElectronTRPCSpy,
}));

describe('main preload bridge', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        ipcInvokeSpy.mockResolvedValue({ canceled: false, absolutePath: 'C:\\Workspace' });
    });

    it('registers the loaded hook and exposes the Electron tRPC bridge when preload finishes booting', async () => {
        const processOnceSpy = vi.spyOn(process, 'once');

        try {
            await import('@/app/main/preload/index');

            expect(exposeInMainWorldSpy).toHaveBeenCalledWith(
                'neonDesktop',
                expect.objectContaining({
                    pickDirectory: expect.any(Function),
                })
            );
            expect(processOnceSpy).toHaveBeenCalledWith('loaded', expect.any(Function));

            const loadedHandler = processOnceSpy.mock.calls.find((call) => call[0] === 'loaded')?.[1];
            expect(loadedHandler).toBeTypeOf('function');

            loadedHandler?.call(process);

            expect(exposeElectronTRPCSpy).toHaveBeenCalledTimes(1);
        } finally {
            processOnceSpy.mockRestore();
        }
    });

    it('exposes a narrow directory picker bridge that returns validated results', async () => {
        await import('@/app/main/preload/index');

        const desktopBridge = exposeInMainWorldSpy.mock.calls.find((call) => call[0] === 'neonDesktop')?.[1] as {
            pickDirectory: () => Promise<{ canceled: true } | { canceled: false; absolutePath: string }>;
        };

        await expect(desktopBridge.pickDirectory()).resolves.toEqual({
            canceled: false,
            absolutePath: 'C:\\Workspace',
        });
    });
});

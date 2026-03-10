import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    appOnSpy,
    appQuitSpy,
    appExitSpy,
    appSetPathSpy,
    setApplicationMenuSpy,
    initializePersistenceSpy,
    closePersistenceSpy,
    initializeSecretStoreSpy,
    getSecretStoreInfoSpy,
    registerWindowStateBridgeSpy,
    handleStartupFailureSpy,
    initAppLoggerSpy,
    flushAppLoggerSpy,
    appLogInfoSpy,
    attachCspHeadersSpy,
    createMainWindowSpy,
    createSplashWindowSpy,
    updateSplashWindowPhaseSpy,
    registerBootWindowsSpy,
    createIPCHandlerInputSpy,
    attachWindowSpy,
    runtimeEnvState,
    appState,
    defaultUserDataPath,
} = vi.hoisted(() => ({
    appOnSpy: vi.fn(),
    appQuitSpy: vi.fn(),
    appExitSpy: vi.fn(),
    appSetPathSpy: vi.fn(),
    setApplicationMenuSpy: vi.fn(),
    initializePersistenceSpy: vi.fn(),
    closePersistenceSpy: vi.fn(),
    initializeSecretStoreSpy: vi.fn(),
    getSecretStoreInfoSpy: vi.fn(() => ({
        backend: 'database',
        available: true,
    })),
    registerWindowStateBridgeSpy: vi.fn(),
    handleStartupFailureSpy: vi.fn(),
    initAppLoggerSpy: vi.fn(),
    flushAppLoggerSpy: vi.fn(() => Promise.resolve()),
    appLogInfoSpy: vi.fn(),
    attachCspHeadersSpy: vi.fn(),
    createMainWindowSpy: vi.fn(() => ({ id: 'window-main' })),
    createSplashWindowSpy: vi.fn(() => ({ id: 'window-splash' })),
    updateSplashWindowPhaseSpy: vi.fn(() => Promise.resolve()),
    registerBootWindowsSpy: vi.fn(),
    createIPCHandlerInputSpy: vi.fn((input: unknown) => input),
    attachWindowSpy: vi.fn(),
    runtimeEnvState: {
        isDev: true,
        devServerUrl: 'http://localhost:5173' as string | undefined,
    },
    defaultUserDataPath: 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor',
    appState: {
        appPath: 'M:\\Neonsy\\Projects\\NeonConductor\\Project',
        isPackaged: false,
        userDataPath: 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor',
    },
}));

const appEventHandlers = new Map<string, Array<(...arguments_: unknown[]) => unknown>>();

vi.mock('electron', () => ({
    app: {
        whenReady: () => Promise.resolve(),
        getVersion: () => '0.0.1',
        getAppPath: () => appState.appPath,
        getPath: (pathName: string) => (pathName === 'userData' ? appState.userDataPath : 'unknown'),
        get isPackaged() {
            return appState.isPackaged;
        },
        setPath: (pathName: string, nextValue: string) => {
            appSetPathSpy(pathName, nextValue);
            if (pathName === 'userData') {
                appState.userDataPath = nextValue;
            }
        },
        on: (eventName: string, handler: (...arguments_: unknown[]) => unknown) => {
            const handlers = appEventHandlers.get(eventName) ?? [];
            handlers.push(handler);
            appEventHandlers.set(eventName, handlers);
            appOnSpy(eventName, handler);
            return undefined;
        },
        quit: appQuitSpy,
        exit: appExitSpy,
    },
    BrowserWindow: {
        getAllWindows: () => [],
    },
    Menu: {
        setApplicationMenu: setApplicationMenuSpy,
    },
}));

vi.mock('electron-trpc-experimental/main', () => ({
    createIPCHandler: (input: unknown) => {
        const ipcHandler = {
            attachWindow: attachWindowSpy,
        };
        createIPCHandlerInputSpy(input);
        return ipcHandler;
    },
}));

vi.mock('@/app/backend/persistence/db', () => ({
    initializePersistence: initializePersistenceSpy,
    closePersistence: closePersistenceSpy,
}));

vi.mock('@/app/backend/secrets/store', () => ({
    initializeSecretStore: initializeSecretStoreSpy,
    getSecretStoreInfo: getSecretStoreInfoSpy,
}));

vi.mock('@/app/backend/trpc/routers/system/windowControls', () => ({
    registerWindowStateBridge: registerWindowStateBridgeSpy,
}));

vi.mock('@/app/main/bootstrap/startupFailure', () => ({
    handleStartupFailure: handleStartupFailureSpy,
}));

vi.mock('@/app/main/logging', () => ({
    initAppLogger: initAppLoggerSpy,
    flushAppLogger: flushAppLoggerSpy,
    appLog: {
        info: appLogInfoSpy,
    },
}));

vi.mock('@/app/main/runtime/env', () => ({
    get isDev() {
        return runtimeEnvState.isDev;
    },
    get devServerUrl() {
        return runtimeEnvState.devServerUrl;
    },
    getMainDirname: () => 'M:\\Neonsy\\Projects\\NeonConductor\\Project\\electron\\main',
}));

vi.mock('@/app/main/security/cspHeaders', () => ({
    attachCspHeaders: attachCspHeadersSpy,
}));

vi.mock('@/app/main/window/factory', () => ({
    createMainWindow: createMainWindowSpy,
}));

vi.mock('@/app/main/window/splash', () => ({
    createSplashWindow: createSplashWindowSpy,
    updateSplashWindowPhase: updateSplashWindowPhaseSpy,
}));

vi.mock('@/app/main/window/bootCoordinator', () => ({
    registerBootWindows: registerBootWindowsSpy,
}));

describe('bootstrapMainProcess', () => {
    beforeEach(() => {
        appEventHandlers.clear();
        vi.clearAllMocks();
        vi.resetModules();
        appState.userDataPath = defaultUserDataPath;
        appState.appPath = 'M:\\Neonsy\\Projects\\NeonConductor\\Project';
        appState.isPackaged = false;
        runtimeEnvState.isDev = true;
        runtimeEnvState.devServerUrl = 'http://localhost:5173';
        getSecretStoreInfoSpy.mockReturnValue({
            backend: 'database',
            available: true,
        });
        delete process.env['NEONCONDUCTOR_USER_DATA_PATH'];
        delete process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE'];
        delete process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL'];
    });

    it('isolates dev startup under a dedicated development userData root', async () => {
        const { bootstrapMainProcess } = await import('@/app/main/bootstrap');

        const createContext = vi.fn(() => Promise.resolve({} as never));
        const initAutoUpdater = vi.fn();
        const appRouter = {} as never;

        bootstrapMainProcess(
            {
                createContext,
                appRouter,
                initAutoUpdater,
                resolvePersistenceChannel: () => 'stable',
            },
            'file:///M:/Neonsy/Projects/NeonConductor/Project/electron/main/index.ts'
        );

        await Promise.resolve();
        await Promise.resolve();

        const expectedUserDataPath = `${defaultUserDataPath}-dev`;
        const expectedDbPath = path.join(expectedUserDataPath, 'runtime', 'development', 'neonconductor.db');

        expect(appSetPathSpy).toHaveBeenCalledWith('userData', expectedUserDataPath);
        expect(initializePersistenceSpy).toHaveBeenCalledWith({
            dbPath: expectedDbPath,
        });
        expect(process.env['NEONCONDUCTOR_USER_DATA_PATH']).toBe(expectedUserDataPath);
        expect(process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE']).toBe('development');
        expect(process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL']).toBe('development');
        expect(initializeSecretStoreSpy).toHaveBeenCalled();
        expect(attachCspHeadersSpy).toHaveBeenCalled();
        expect(createSplashWindowSpy).toHaveBeenCalledWith({
            appPath: 'M:\\Neonsy\\Projects\\NeonConductor\\Project',
            devServerUrl: 'http://localhost:5173',
            isPackaged: false,
            mainDirname: 'M:\\Neonsy\\Projects\\NeonConductor\\Project\\electron\\main',
            resourcesPath: process.resourcesPath,
        });
        expect(createMainWindowSpy).toHaveBeenCalled();
        expect(createSplashWindowSpy.mock.invocationCallOrder[0]).toBeLessThan(
            createMainWindowSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
        );
        expect(registerBootWindowsSpy).toHaveBeenCalledWith({
            mainWindow: { id: 'window-main' },
            splashWindow: { id: 'window-splash' },
            onDelayedSplash: expect.any(Function),
        });
        const delayedSplashRegistrationCall = registerBootWindowsSpy.mock.calls[0] as
            | [{ onDelayedSplash: () => void }]
            | undefined;
        if (!delayedSplashRegistrationCall) {
            throw new Error('Expected registerBootWindows to be called.');
        }
        const [delayedSplashRegistration] = delayedSplashRegistrationCall;
        delayedSplashRegistration.onDelayedSplash();
        expect(updateSplashWindowPhaseSpy).toHaveBeenCalledWith(
            { id: 'window-splash' },
            {
                appPath: 'M:\\Neonsy\\Projects\\NeonConductor\\Project',
                devServerUrl: 'http://localhost:5173',
                isPackaged: false,
                mainDirname: 'M:\\Neonsy\\Projects\\NeonConductor\\Project\\electron\\main',
                resourcesPath: process.resourcesPath,
            },
            'delayed'
        );
        expect(registerWindowStateBridgeSpy).toHaveBeenCalledWith({ id: 'window-main' });
        expect(createIPCHandlerInputSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                router: appRouter,
                createContext,
                windows: [{ id: 'window-main' }],
            })
        );
        expect(initAutoUpdater).toHaveBeenCalled();

        const browserWindowCreatedHandlers = appEventHandlers.get('browser-window-created') ?? [];
        expect(browserWindowCreatedHandlers).toHaveLength(1);
        browserWindowCreatedHandlers[0]?.({}, { id: 'window-secondary' });
        expect(attachWindowSpy).toHaveBeenCalledWith({ id: 'window-secondary' });
        expect(registerWindowStateBridgeSpy).toHaveBeenCalledWith({ id: 'window-secondary' });

        const beforeQuitHandlers = appEventHandlers.get('before-quit') ?? [];
        expect(beforeQuitHandlers).toHaveLength(1);
        beforeQuitHandlers[0]?.();
        expect(closePersistenceSpy).toHaveBeenCalled();
        expect(flushAppLoggerSpy).toHaveBeenCalled();
        expect(handleStartupFailureSpy).not.toHaveBeenCalled();
    });

    it('keeps packaged startup under the selected release channel namespace', async () => {
        runtimeEnvState.isDev = false;
        runtimeEnvState.devServerUrl = undefined;
        appState.isPackaged = true;
        const { bootstrapMainProcess } = await import('@/app/main/bootstrap');

        bootstrapMainProcess(
            {
                createContext: vi.fn(() => Promise.resolve({} as never)),
                appRouter: {} as never,
                initAutoUpdater: vi.fn(),
                resolvePersistenceChannel: () => 'beta',
            },
            'file:///M:/Neonsy/Projects/NeonConductor/Project/electron/main/index.ts'
        );

        await Promise.resolve();
        await Promise.resolve();

        expect(appSetPathSpy).not.toHaveBeenCalled();
        expect(initializePersistenceSpy).toHaveBeenCalledWith({
            dbPath: path.join(defaultUserDataPath, 'runtime', 'beta', 'neonconductor.db'),
        });
        expect(process.env['NEONCONDUCTOR_USER_DATA_PATH']).toBe(defaultUserDataPath);
        expect(process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE']).toBe('beta');
        expect(process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL']).toBe('beta');
        expect(createSplashWindowSpy).toHaveBeenCalledWith({
            appPath: 'M:\\Neonsy\\Projects\\NeonConductor\\Project',
            isPackaged: true,
            mainDirname: 'M:\\Neonsy\\Projects\\NeonConductor\\Project\\electron\\main',
            resourcesPath: process.resourcesPath,
        });
    });
});

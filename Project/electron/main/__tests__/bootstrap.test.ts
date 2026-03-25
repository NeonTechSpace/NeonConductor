import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const projectPath = path.win32.join('Project');
const mainDirname = path.win32.join(projectPath, 'electron', 'main');
const mainEntryUrl = pathToFileURL(path.resolve(projectPath, 'electron', 'main', 'index.ts')).toString();

const {
    appOnSpy,
    appQuitSpy,
    appExitSpy,
    appSetAppUserModelIdSpy,
    appSetPathSpy,
    dialogShowOpenDialogSpy,
    ipcMainHandleSpy,
    ipcMainRemoveHandlerSpy,
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
    registerBootWindowsSpy,
    reportMainBootStatusSpy,
    createIPCHandlerInputSpy,
    attachWindowSpy,
    runtimeEnvState,
    appState,
    defaultUserDataPath,
} = vi.hoisted(() => ({
    appOnSpy: vi.fn(),
    appQuitSpy: vi.fn(),
    appExitSpy: vi.fn(),
    appSetAppUserModelIdSpy: vi.fn(),
    appSetPathSpy: vi.fn(),
    dialogShowOpenDialogSpy: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
    ipcMainHandleSpy: vi.fn(),
    ipcMainRemoveHandlerSpy: vi.fn(),
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
    registerBootWindowsSpy: vi.fn(),
    reportMainBootStatusSpy: vi.fn(),
    createIPCHandlerInputSpy: vi.fn((input: unknown) => input),
    attachWindowSpy: vi.fn(),
    runtimeEnvState: {
        isDev: true,
        devServerUrl: 'http://localhost:5173' as string | undefined,
    },
    defaultUserDataPath: 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor',
    appState: {
        appPath: projectPath,
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
        setAppUserModelId: appSetAppUserModelIdSpy,
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
    dialog: {
        showOpenDialog: dialogShowOpenDialogSpy,
    },
    ipcMain: {
        handle: ipcMainHandleSpy,
        removeHandler: ipcMainRemoveHandlerSpy,
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
    getMainDirname: () => mainDirname,
}));

vi.mock('@/app/main/security/cspHeaders', () => ({
    attachCspHeaders: attachCspHeadersSpy,
}));

vi.mock('@/app/main/window/factory', () => ({
    createMainWindow: createMainWindowSpy,
}));

vi.mock('@/app/main/window/splash', () => ({
    createSplashWindow: createSplashWindowSpy,
}));

vi.mock('@/app/main/window/bootCoordinator', () => ({
    registerBootWindows: registerBootWindowsSpy,
    reportMainBootStatus: reportMainBootStatusSpy,
}));

describe('bootstrapMainProcess', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
        appEventHandlers.clear();
        vi.clearAllMocks();
        vi.resetModules();
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        appState.userDataPath = defaultUserDataPath;
        appState.appPath = projectPath;
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

    afterAll(() => {
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true,
        });
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
            mainEntryUrl
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
        expect(appSetAppUserModelIdSpy).toHaveBeenCalledWith('com.neonsy.neonconductor');
        expect(createMainWindowSpy).toHaveBeenCalled();
        expect(createSplashWindowSpy).toHaveBeenCalledWith({
            appPath: projectPath,
            devServerUrl: 'http://localhost:5173',
            isPackaged: false,
            mainDirname,
            resourcesPath: process.resourcesPath,
        });
        expect(createMainWindowSpy.mock.invocationCallOrder[0]).toBeLessThan(
            createSplashWindowSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
        );
        expect(registerBootWindowsSpy).toHaveBeenCalledWith({
            mainWindow: { id: 'window-main' },
            splashWindow: { id: 'window-splash' },
        });
        expect(reportMainBootStatusSpy).toHaveBeenCalledWith({ stage: 'main_initializing' });
        expect(reportMainBootStatusSpy).toHaveBeenCalledWith({ stage: 'storage_ready' });
        expect(reportMainBootStatusSpy).toHaveBeenCalledWith({ stage: 'persistence_ready' });
        expect(reportMainBootStatusSpy).toHaveBeenCalledWith({ stage: 'secrets_ready' });
        expect(reportMainBootStatusSpy).toHaveBeenCalledWith({ stage: 'windows_ready' });
        expect(reportMainBootStatusSpy).toHaveBeenCalledWith({
            stage: 'renderer_connecting',
            blockingPrerequisite: 'renderer_first_report',
        });
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
        expect(ipcMainRemoveHandlerSpy).toHaveBeenCalled();
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
            mainEntryUrl
        );

        await Promise.resolve();
        await Promise.resolve();

        expect(appSetPathSpy).not.toHaveBeenCalled();
        expect(initializePersistenceSpy).toHaveBeenCalledWith({
            dbPath: path.join(defaultUserDataPath, 'runtime', 'beta', 'neonconductor.db'),
        });
        expect(appSetAppUserModelIdSpy).toHaveBeenCalledWith('com.neonsy.neonconductor');
        expect(process.env['NEONCONDUCTOR_USER_DATA_PATH']).toBe(defaultUserDataPath);
        expect(process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE']).toBe('beta');
        expect(process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL']).toBe('beta');
        expect(createSplashWindowSpy).toHaveBeenCalledWith({
            appPath: projectPath,
            isPackaged: true,
            mainDirname,
            resourcesPath: process.resourcesPath,
        });
    });

    it('honors an explicit absolute userData override for isolated shell validation runs', async () => {
        process.env['NEONCONDUCTOR_USER_DATA_PATH'] = 'D:\\Temp\\neon-shell-validation';
        const { bootstrapMainProcess } = await import('@/app/main/bootstrap');

        bootstrapMainProcess(
            {
                createContext: vi.fn(() => Promise.resolve({} as never)),
                appRouter: {} as never,
                initAutoUpdater: vi.fn(),
                resolvePersistenceChannel: () => 'stable',
            },
            mainEntryUrl
        );

        await Promise.resolve();
        await Promise.resolve();

        expect(appSetPathSpy).toHaveBeenCalledWith('userData', 'D:\\Temp\\neon-shell-validation');
        expect(initializePersistenceSpy).toHaveBeenCalledWith({
            dbPath: path.join('D:\\Temp\\neon-shell-validation', 'runtime', 'development', 'neonconductor.db'),
        });
        expect(process.env['NEONCONDUCTOR_USER_DATA_PATH']).toBe('D:\\Temp\\neon-shell-validation');
        expect(process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE']).toBe('development');
        expect(process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL']).toBe('development');
    });
});

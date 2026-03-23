import { app, BrowserWindow, Menu, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { createIPCHandler, type CreateContextOptions } from 'electron-trpc-experimental/main';

import { closePersistence, initializePersistence } from '@/app/backend/persistence/db';
import { getSecretStoreInfo, initializeSecretStore } from '@/app/backend/secrets/store';
import { PICK_DIRECTORY_CHANNEL } from '@/app/shared/desktopBridgeContract';
import type { Context } from '@/app/backend/trpc/context';
import type { AppRouter } from '@/app/backend/trpc/router';
import { registerWindowStateBridge } from '@/app/backend/trpc/routers/system/windowControls';
import { handleStartupFailure } from '@/app/main/bootstrap/startupFailure';
import { appLog, flushAppLogger, initAppLogger } from '@/app/main/logging';
import { devServerUrl, getMainDirname, isDev } from '@/app/main/runtime/env';
import { resolveDesktopStorage, resolveDesktopStoragePaths } from '@/app/main/runtime/storage';
import { attachCspHeaders } from '@/app/main/security/cspHeaders';
import { registerBootWindows, reportMainBootStatus } from '@/app/main/window/bootCoordinator';
import { createMainWindow } from '@/app/main/window/factory';
import { createSplashWindow } from '@/app/main/window/splash';

interface BootstrapDeps {
    createContext: (opts: CreateContextOptions) => Promise<Context>;
    appRouter: AppRouter;
    initAutoUpdater: () => void;
    resolvePersistenceChannel: () => 'stable' | 'beta' | 'alpha';
}

export function bootstrapMainProcess(deps: BootstrapDeps, importMetaUrl: string): void {
    const { createContext, appRouter, initAutoUpdater, resolvePersistenceChannel } = deps;
    const mainDirname = getMainDirname(importMetaUrl);
    const defaultUserDataPath = app.getPath('userData');
    const initialStorage = resolveDesktopStorage({
        defaultUserDataPath,
        isDev,
        packagedRuntimeNamespace: 'stable',
    });

    if (initialStorage.userDataPath !== defaultUserDataPath) {
        app.setPath('userData', initialStorage.userDataPath);
    }

    let mainWindow: BrowserWindow | null = null;
    let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;
    const runtimeWindowOptions = {
        isDev,
        mainDirname,
        ...(devServerUrl ? { devServerUrl } : {}),
    };
    const splashWindowOptions = {
        appPath: app.getAppPath(),
        ...(devServerUrl ? { devServerUrl } : {}),
        isPackaged: app.isPackaged,
        mainDirname,
        resourcesPath: process.resourcesPath,
    };
    const runtimeCspOptions = {
        isDev,
        ...(devServerUrl ? { devServerUrl } : {}),
    };

    function createBootManagedMainWindow(): BrowserWindow {
        const nextMainWindow = createMainWindow(runtimeWindowOptions);
        const splashWindow = createSplashWindow(splashWindowOptions);
        registerBootWindows({
            mainWindow: nextMainWindow,
            splashWindow,
        });
        reportMainBootStatus({
            stage: 'windows_ready',
        });
        return nextMainWindow;
    }

    void app
        .whenReady()
        .then(() => {
            initAppLogger({
                isDev,
                version: app.getVersion(),
            });
            reportMainBootStatus({
                stage: 'main_initializing',
            });

            const resolvedStorage = resolveDesktopStorage({
                defaultUserDataPath,
                isDev,
                packagedRuntimeNamespace: isDev ? 'stable' : resolvePersistenceChannel(),
            });
            const storagePaths = resolveDesktopStoragePaths(resolvedStorage);
            process.env['NEONCONDUCTOR_USER_DATA_PATH'] = resolvedStorage.userDataPath;
            process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE'] = resolvedStorage.runtimeNamespace;
            process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL'] = resolvedStorage.runtimeNamespace;
            appLog.info({
                tag: 'runtime',
                message: 'Runtime storage resolved.',
                runtimeNamespace: resolvedStorage.runtimeNamespace,
                userDataPath: resolvedStorage.userDataPath,
                dbPath: storagePaths.dbPath,
                isDevIsolatedStorage: resolvedStorage.isDevIsolatedStorage,
            });
            reportMainBootStatus({
                stage: 'storage_ready',
            });

            initializePersistence({
                dbPath: storagePaths.dbPath,
            });
            reportMainBootStatus({
                stage: 'persistence_ready',
            });
            initializeSecretStore();
            const secretStoreInfo = getSecretStoreInfo();
            appLog.info({
                tag: 'secrets',
                message: 'Provider secrets initialized.',
                backend: secretStoreInfo.backend,
            });
            reportMainBootStatus({
                stage: 'secrets_ready',
            });

            // Remove default menu bar (File, Edit, View, Help)
            Menu.setApplicationMenu(null);

            // Set up Content Security Policy via HTTP headers.
            attachCspHeaders(runtimeCspOptions);

            if (process.platform === 'win32') {
                app.setAppUserModelId('com.neonsy.neonconductor');
            }

            mainWindow = createBootManagedMainWindow();
            registerWindowStateBridge(mainWindow);

            // Wire up tRPC to handle IPC calls from the renderer
            ipcHandler = createIPCHandler({
                router: appRouter,
                windows: [mainWindow],
                createContext,
            });
            ipcMain.handle(PICK_DIRECTORY_CHANNEL, async () => {
                const ownerWindow = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
                const dialogOptions: OpenDialogOptions = {
                    title: 'Choose Workspace Folder',
                    properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
                };
                const result = ownerWindow
                    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
                    : await dialog.showOpenDialog(dialogOptions);
                const absolutePath = result.filePaths[0];

                if (result.canceled || !absolutePath) {
                    return { canceled: true } as const;
                }

                return {
                    canceled: false as const,
                    absolutePath,
                };
            });
            reportMainBootStatus({
                stage: 'renderer_connecting',
                blockingPrerequisite: 'renderer_first_report',
            });

            app.on('browser-window-created', (_event, window) => {
                ipcHandler?.attachWindow(window);
                registerWindowStateBridge(window);
            });

            initAutoUpdater();
        })
        .catch((error: unknown) => handleStartupFailure(error));

    app.on('before-quit', () => {
        ipcMain.removeHandler(PICK_DIRECTORY_CHANNEL);
        closePersistence();
        void flushAppLogger();
    });

    // Standard quit behavior: exit when all windows closed (except macOS)
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    // macOS: re-create window when dock icon clicked with no windows open
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            mainWindow = createBootManagedMainWindow();
            registerWindowStateBridge(mainWindow);
        }
    });
}

import { app, BrowserWindow, Menu } from 'electron';
import { createIPCHandler, type CreateContextOptions } from 'electron-trpc-experimental/main';
import path from 'node:path';

import { closePersistence, initializePersistence } from '@/app/backend/persistence/db';
import { getSecretStoreInfo, initializeSecretStore } from '@/app/backend/secrets/store';
import type { Context } from '@/app/backend/trpc/context';
import type { AppRouter } from '@/app/backend/trpc/router';
import { flushAppLogger, initAppLogger } from '@/app/main/logging';
import { devServerUrl, getMainDirname, isDev } from '@/app/main/runtime/env';
import { attachCspHeaders } from '@/app/main/security/cspHeaders';
import { createMainWindow } from '@/app/main/window/factory';

interface BootstrapDeps {
    createContext: (opts: CreateContextOptions) => Promise<Context>;
    appRouter: AppRouter;
    initAutoUpdater: () => void;
    resolvePersistenceChannel: () => 'stable' | 'beta' | 'alpha';
}

export function bootstrapMainProcess(deps: BootstrapDeps, importMetaUrl: string): void {
    const { createContext, appRouter, initAutoUpdater, resolvePersistenceChannel } = deps;
    const mainDirname = getMainDirname(importMetaUrl);

    let mainWindow: BrowserWindow | null = null;
    let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;
    const runtimeWindowOptions = {
        isDev,
        mainDirname,
        ...(devServerUrl ? { devServerUrl } : {}),
    };
    const runtimeCspOptions = {
        isDev,
        ...(devServerUrl ? { devServerUrl } : {}),
    };

    void app.whenReady().then(() => {
        initAppLogger({
            isDev,
            version: app.getVersion(),
        });

        const persistenceChannel = resolvePersistenceChannel();
        const persistenceDbPath = path.join(app.getPath('userData'), 'runtime', persistenceChannel, 'neonconductor.db');
        console.info(`[runtime] channel=${persistenceChannel} dbPath=${persistenceDbPath}`);

        initializePersistence({
            dbPath: persistenceDbPath,
        });
        initializeSecretStore();
        const secretStoreInfo = getSecretStoreInfo();
        if (!secretStoreInfo.available) {
            const reason = secretStoreInfo.reason ?? 'unknown reason';
            console.warn(`[secrets] ${secretStoreInfo.backend} backend unavailable: ${reason}`);
        }

        // Remove default menu bar (File, Edit, View, Help)
        Menu.setApplicationMenu(null);

        // Set up Content Security Policy via HTTP headers.
        attachCspHeaders(runtimeCspOptions);

        mainWindow = createMainWindow(runtimeWindowOptions);

        // Wire up tRPC to handle IPC calls from the renderer
        ipcHandler = createIPCHandler({
            router: appRouter,
            windows: [mainWindow],
            createContext,
        });

        app.on('browser-window-created', (_event, window) => {
            ipcHandler?.attachWindow(window);
        });

        initAutoUpdater();
    });

    app.on('before-quit', () => {
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
            mainWindow = createMainWindow({
                ...runtimeWindowOptions,
            });
        }
    });
}

import path from 'node:path';

import { BrowserWindow, type BrowserWindowType } from '@/app/main/runtime/electronApi';
import { attachDevelopmentShortcuts } from '@/app/main/window/devtoolsShortcuts';
import { attachNavigationGuards } from '@/app/main/window/navigationGuards';
import { resolveMainWindowPreloadPath } from '@/app/main/window/preloadPaths';

export interface MainWindowOptions {
    isDev: boolean;
    devServerUrl?: string;
    mainDirname: string;
}

export function createMainWindow(options: MainWindowOptions): BrowserWindowType {
    const { isDev, devServerUrl, mainDirname } = options;

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 960,
        minHeight: 540,
        frame: false,
        show: false, // Prevent flash before maximize
        backgroundColor: '#0a0a0f', // Match app background to prevent white flash
        webPreferences: {
            preload: resolveMainWindowPreloadPath(mainDirname),
            // Security hardening: isolate renderer from Node.js
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // Disable devtools in production to prevent inspection
            devTools: isDev,
        },
    });

    // Window showing is handled by tRPC system.signalReady mutation
    // This ensures the window only appears after React has actually rendered content,
    // preventing the blank flash that occurs with simpler approaches like 'ready-to-show'.
    if (isDev && devServerUrl) {
        void win.loadURL(devServerUrl);
        // Detached devtools avoids layout interference during development
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        void win.loadFile(path.join(mainDirname, '../dist/index.html'));
    }

    attachNavigationGuards(win, {
        isDev,
        ...(devServerUrl ? { devServerUrl } : {}),
    });
    attachDevelopmentShortcuts(win, isDev);

    return win;
}

import { BrowserWindow } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveRuntimeAssetPath } from '@/app/main/runtime/assets';
import { resolveSplashWindowPreloadPath } from '@/app/main/window/preloadPaths';
import {
    INITIAL_BOOT_STATUS_SNAPSHOT,
    SPLASH_BOOT_STATUS_CHANNEL,
    type SplashBootstrapPayload,
    type BootStatusSnapshot,
} from '@/app/shared/splashContract';

const splashWindowStatusById = new Map<number, BootStatusSnapshot>();
const SPLASH_MASCOT_SOURCE_ARGUMENT_PREFIX = '--neon-splash-mascot-source=';

export interface SplashWindowOptions {
    appPath: string;
    devServerUrl?: string;
    isPackaged: boolean;
    mainDirname: string;
    resourcesPath?: string;
}

export function resolveSplashAssetPath(input: {
    appPath: string;
    isPackaged: boolean;
    resourcesPath?: string;
}): string {
    return resolveRuntimeAssetPath({
        isPackaged: input.isPackaged,
        appPath: input.appPath,
        relativePath: input.isPackaged ? 'assets/appicon.png' : 'src/assets/appicon.png',
        ...(input.resourcesPath ? { resourcesPath: input.resourcesPath } : {}),
    });
}

export function resolveSplashAssetUrl(input: {
    appPath: string;
    devServerUrl?: string;
    isPackaged: boolean;
    resourcesPath?: string;
}): string {
    if (!input.isPackaged && input.devServerUrl) {
        return new URL('src/assets/appicon.png', ensureTrailingSlash(input.devServerUrl)).toString();
    }

    return pathToFileURL(
        resolveSplashAssetPath({
            appPath: input.appPath,
            isPackaged: input.isPackaged,
            ...(input.resourcesPath ? { resourcesPath: input.resourcesPath } : {}),
        })
    ).toString();
}

export function resolveSplashPageLocation(
    options: SplashWindowOptions
): { kind: 'url'; value: string } | { kind: 'file'; value: string } {
    if (!options.isPackaged && options.devServerUrl) {
        return {
            kind: 'url',
            value: new URL('splash.html', ensureTrailingSlash(options.devServerUrl)).toString(),
        };
    }

    return {
        kind: 'file',
        value: path.join(options.mainDirname, '../dist/splash.html'),
    };
}

function ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
}

function sendSplashStatus(window: BrowserWindow, status: BootStatusSnapshot): void {
    if (window.isDestroyed()) {
        return;
    }

    splashWindowStatusById.set(window.id, status);
    window.webContents.send(SPLASH_BOOT_STATUS_CHANNEL, status);
}

export function updateSplashWindowStatus(splashWindow: BrowserWindow, status: BootStatusSnapshot): Promise<void> {
    sendSplashStatus(splashWindow, status);
    return Promise.resolve();
}

export function buildSplashBootstrapPayload(input: {
    appPath: string;
    devServerUrl?: string;
    isPackaged: boolean;
    resourcesPath?: string;
    status?: BootStatusSnapshot;
}): SplashBootstrapPayload {
    return {
        mascotSource: resolveSplashAssetUrl({
            appPath: input.appPath,
            ...(input.devServerUrl ? { devServerUrl: input.devServerUrl } : {}),
            isPackaged: input.isPackaged,
            ...(input.resourcesPath ? { resourcesPath: input.resourcesPath } : {}),
        }),
        status: input.status ?? INITIAL_BOOT_STATUS_SNAPSHOT,
    };
}

export function createSplashWindow(options: SplashWindowOptions): BrowserWindow {
    const assetPath = resolveSplashAssetPath({
        appPath: options.appPath,
        isPackaged: options.isPackaged,
        ...(options.resourcesPath ? { resourcesPath: options.resourcesPath } : {}),
    });
    const bootstrapPayload = buildSplashBootstrapPayload({
        appPath: options.appPath,
        ...(options.devServerUrl ? { devServerUrl: options.devServerUrl } : {}),
        isPackaged: options.isPackaged,
        ...(options.resourcesPath ? { resourcesPath: options.resourcesPath } : {}),
    });

    const splashWindow = new BrowserWindow({
        width: 400,
        height: 480,
        minWidth: 400,
        minHeight: 480,
        maxWidth: 400,
        maxHeight: 480,
        show: false,
        frame: false,
        resizable: false,
        movable: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: false,
        center: true,
        backgroundColor: '#090b12',
        icon: assetPath,
        webPreferences: {
            preload: resolveSplashWindowPreloadPath(options.mainDirname),
            additionalArguments: [
                `${SPLASH_MASCOT_SOURCE_ARGUMENT_PREFIX}${encodeURIComponent(bootstrapPayload.mascotSource ?? '')}`,
            ],
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: false,
        },
    });

    splashWindowStatusById.set(splashWindow.id, INITIAL_BOOT_STATUS_SNAPSHOT);
    splashWindow.once('ready-to-show', () => {
        splashWindow.show();
    });
    splashWindow.once('closed', () => {
        splashWindowStatusById.delete(splashWindow.id);
    });
    splashWindow.webContents.on('did-finish-load', () => {
        const currentStatus = splashWindowStatusById.get(splashWindow.id) ?? INITIAL_BOOT_STATUS_SNAPSHOT;
        sendSplashStatus(splashWindow, currentStatus);
    });
    splashWindow.removeMenu();

    const splashPageLocation = resolveSplashPageLocation(options);
    if (splashPageLocation.kind === 'url') {
        void splashWindow.loadURL(splashPageLocation.value);
    } else {
        void splashWindow.loadFile(splashPageLocation.value);
    }

    return splashWindow;
}

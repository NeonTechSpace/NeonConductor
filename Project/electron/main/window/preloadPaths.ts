import path from 'node:path';

export const MAIN_WINDOW_PRELOAD_BUNDLE_NAME = 'mainWindow.cjs';
export const SPLASH_WINDOW_PRELOAD_BUNDLE_NAME = 'splashWindow.cjs';
export const DEV_BROWSER_VIEW_PRELOAD_BUNDLE_NAME = 'devBrowserView.cjs';

export function resolveMainWindowPreloadPath(mainDirname: string): string {
    return path.join(mainDirname, MAIN_WINDOW_PRELOAD_BUNDLE_NAME);
}

export function resolveSplashWindowPreloadPath(mainDirname: string): string {
    return path.join(mainDirname, SPLASH_WINDOW_PRELOAD_BUNDLE_NAME);
}

export function resolveDevBrowserViewPreloadPath(mainDirname: string): string {
    return path.join(mainDirname, DEV_BROWSER_VIEW_PRELOAD_BUNDLE_NAME);
}

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    MAIN_WINDOW_PRELOAD_BUNDLE_NAME,
    SPLASH_WINDOW_PRELOAD_BUNDLE_NAME,
    resolveMainWindowPreloadPath,
    resolveSplashWindowPreloadPath,
} from '@/app/main/window/preloadPaths';

describe('preload path resolution', () => {
    it('keeps named preload bundles on the sandbox-safe .cjs contract', () => {
        expect(MAIN_WINDOW_PRELOAD_BUNDLE_NAME).toBe('mainWindow.cjs');
        expect(SPLASH_WINDOW_PRELOAD_BUNDLE_NAME).toBe('splashWindow.cjs');
    });

    it('resolves main and splash preload paths from the Electron output directory', () => {
        const mainDirname = 'C:\\repo\\Project\\dist-electron';

        expect(resolveMainWindowPreloadPath(mainDirname)).toBe(path.join(mainDirname, 'mainWindow.cjs'));
        expect(resolveSplashWindowPreloadPath(mainDirname)).toBe(path.join(mainDirname, 'splashWindow.cjs'));
    });
});

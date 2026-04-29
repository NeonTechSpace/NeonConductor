import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    appMock,
    browserWindowSpy,
    dialogMock,
    ipcMainMock,
    menuMock,
    sessionMock,
    shellMock,
    splashWindowMock,
    webContentsViewSpy,
} = vi.hoisted(() => {
    const splashWindowMock = {
        id: 101,
        isDestroyed: vi.fn(() => false),
        show: vi.fn(),
        once: vi.fn(),
        removeMenu: vi.fn(),
        loadURL: vi.fn(),
        loadFile: vi.fn(),
        webContents: {
            on: vi.fn(),
            send: vi.fn(),
        },
    };

    return {
        appMock: {},
        browserWindowSpy: vi.fn(function BrowserWindowMock() {
            return splashWindowMock;
        }),
        dialogMock: {},
        ipcMainMock: {},
        menuMock: {},
        sessionMock: {},
        shellMock: {},
        splashWindowMock,
        webContentsViewSpy: vi.fn(),
    };
});

vi.mock('electron', () => ({
    app: appMock,
    BrowserWindow: browserWindowSpy,
    Menu: menuMock,
    dialog: dialogMock,
    ipcMain: ipcMainMock,
    session: sessionMock,
    shell: shellMock,
    WebContentsView: webContentsViewSpy,
}));

import {
    buildSplashBootstrapPayload,
    createSplashWindow,
    resolveSplashAssetPath,
    resolveSplashAssetUrl,
    resolveSplashPageLocation,
    updateSplashWindowStatus,
} from '@/app/main/window/splash';

describe('splash window', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        splashWindowMock.isDestroyed.mockReturnValue(false);
    });

    it('resolves the mascot from the project app path during development', () => {
        expect(
            resolveSplashAssetPath({
                appPath: 'C:\\repo\\Project',
                isPackaged: false,
            })
        ).toBe('C:\\repo\\Project\\src\\assets\\appicon.png');
    });

    it('resolves the packaged mascot from extra resources', () => {
        expect(
            resolveSplashAssetPath({
                appPath: 'ignored',
                isPackaged: true,
                resourcesPath: 'C:\\Program Files\\NeonConductor\\resources',
            })
        ).toBe('C:\\Program Files\\NeonConductor\\resources\\assets\\appicon.png');
    });

    it('resolves a same-origin dev URL for the mascot so the splash can load it before module boot', () => {
        expect(
            resolveSplashAssetUrl({
                appPath: 'C:\\repo\\Project',
                devServerUrl: 'http://localhost:5173',
                isPackaged: false,
            })
        ).toBe('http://localhost:5173/src/assets/appicon.png');
    });

    it('resolves a file URL for the packaged mascot', () => {
        expect(
            resolveSplashAssetUrl({
                appPath: 'ignored',
                isPackaged: true,
                resourcesPath: 'C:\\Program Files\\NeonConductor\\resources',
            })
        ).toBe('file:///C:/Program%20Files/NeonConductor/resources/assets/appicon.png');
    });

    it('loads the bundled splash page from the Vite dev server during development', () => {
        expect(
            resolveSplashPageLocation({
                appPath: 'C:\\repo\\Project',
                devServerUrl: 'http://localhost:5173',
                isPackaged: false,
                mainDirname: 'C:\\repo\\Project\\dist-electron',
            })
        ).toEqual({
            kind: 'url',
            value: 'http://localhost:5173/splash.html',
        });
    });

    it('loads the packaged splash page from the built dist directory', () => {
        expect(
            resolveSplashPageLocation({
                appPath: 'C:\\repo\\Project',
                isPackaged: true,
                mainDirname: 'C:\\repo\\Project\\dist-electron',
                resourcesPath: 'C:\\Program Files\\NeonConductor\\resources',
            })
        ).toEqual({
            kind: 'file',
            value: 'C:\\repo\\Project\\dist\\splash.html',
        });
    });

    it('sends structured boot status updates over IPC instead of reloading the page', async () => {
        const sendSpy = vi.fn();
        const splashWindow = {
            isDestroyed: vi.fn(() => false),
            webContents: {
                send: sendSpy,
            },
        };

        await updateSplashWindowStatus(splashWindow as never, {
            stage: 'boot_stuck',
            headline: 'Startup is taking longer than expected',
            detail: 'Waiting on: shell bootstrap data.',
            isStuck: true,
            blockingPrerequisite: 'shell_bootstrap',
            elapsedMs: 4000,
            source: 'main',
        });

        expect(sendSpy).toHaveBeenCalledWith('neonconductor:splash-phase', {
            stage: 'boot_stuck',
            headline: 'Startup is taking longer than expected',
            detail: 'Waiting on: shell bootstrap data.',
            isStuck: true,
            blockingPrerequisite: 'shell_bootstrap',
            elapsedMs: 4000,
            source: 'main',
        });
    });

    it('no longer relies on inline data pages or executeJavaScript patching', () => {
        const sourcePath = path.join(process.cwd(), 'electron/main/window/splash.ts');
        const source = readFileSync(sourcePath, 'utf8');

        expect(source).not.toContain('data:text/html');
        expect(source).not.toContain('executeJavaScript');
    });

    it('builds a preload bootstrap payload with mascot source and initial status', () => {
        expect(
            buildSplashBootstrapPayload({
                appPath: 'C:\\repo\\Project',
                devServerUrl: 'http://localhost:5173',
                isPackaged: false,
            })
        ).toMatchObject({
            mascotSource: 'http://localhost:5173/src/assets/appicon.png',
            status: expect.objectContaining({
                stage: 'main_initializing',
            }),
        });
    });

    it('creates the splash as a taskbar-visible top-level window', () => {
        createSplashWindow({
            appPath: 'C:\\repo\\Project',
            devServerUrl: 'http://localhost:5173',
            isPackaged: false,
            mainDirname: 'C:\\repo\\Project\\dist-electron',
        });

        expect(browserWindowSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                skipTaskbar: false,
                frame: false,
                show: false,
            })
        );
        expect(splashWindowMock.loadURL).toHaveBeenCalledWith('http://localhost:5173/splash.html');
    });
});

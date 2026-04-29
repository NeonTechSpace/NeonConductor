import { beforeEach, describe, expect, it, vi } from 'vitest';

const { appQuitSpy, appLogInfoSpy, appLogWarnSpy, updateSplashWindowStatusSpy } = vi.hoisted(() => ({
    appQuitSpy: vi.fn(),
    appLogInfoSpy: vi.fn(),
    appLogWarnSpy: vi.fn(),
    updateSplashWindowStatusSpy: vi.fn(() => Promise.resolve()),
}));

vi.mock('electron', () => ({
    app: {
        quit: appQuitSpy,
    },
    BrowserWindow: vi.fn(),
    Menu: {},
    dialog: {},
    ipcMain: {},
    session: {},
    shell: {},
    WebContentsView: vi.fn(),
}));

vi.mock('@/app/main/logging', () => ({
    appLog: {
        info: appLogInfoSpy,
        warn: appLogWarnSpy,
    },
}));

vi.mock('@/app/main/window/splash', () => ({
    updateSplashWindowStatus: updateSplashWindowStatusSpy,
}));

import {
    completeBootWindowHandoff,
    registerBootWindows,
    reportMainBootStatus,
    reportRendererBootStatus,
    resetBootWindowStateForTests,
} from '@/app/main/window/bootCoordinator';
import { BOOT_FORCE_SHOW_MS, BOOT_STUCK_WARNING_MS } from '@/app/shared/splashContract';

function createMockWindow(id: number) {
    const windowState = {
        visible: false,
        maximized: false,
        destroyed: false,
    };
    const eventHandlers = new Map<string, Array<() => void>>();
    const webContentsEventHandlers = new Map<string, Array<() => void>>();

    const emit = (eventName: string) => {
        for (const handler of eventHandlers.get(eventName) ?? []) {
            handler();
        }
    };

    const emitWebContents = (eventName: string) => {
        for (const handler of webContentsEventHandlers.get(eventName) ?? []) {
            handler();
        }
    };

    return {
        id,
        close: vi.fn(() => {
            windowState.destroyed = true;
            emit('closed');
        }),
        isDestroyed: vi.fn(() => windowState.destroyed),
        isMaximized: vi.fn(() => windowState.maximized),
        isVisible: vi.fn(() => windowState.visible),
        maximize: vi.fn(() => {
            windowState.maximized = true;
        }),
        once: vi.fn((eventName: string, handler: () => void) => {
            const handlers = eventHandlers.get(eventName) ?? [];
            handlers.push(handler);
            eventHandlers.set(eventName, handlers);
        }),
        webContents: {
            once: vi.fn((eventName: string, handler: () => void) => {
                const handlers = webContentsEventHandlers.get(eventName) ?? [];
                handlers.push(handler);
                webContentsEventHandlers.set(eventName, handlers);
            }),
        },
        show: vi.fn(() => {
            windowState.visible = true;
        }),
        emitWebContents,
    };
}

describe('bootCoordinator', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));
        vi.clearAllMocks();
        resetBootWindowStateForTests();
    });

    it('publishes a stuck boot status with the current blocker after the warning timeout', () => {
        const mainWindow = createMockWindow(1);
        const splashWindow = createMockWindow(2);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
        });
        reportMainBootStatus({
            stage: 'renderer_connecting',
            blockingPrerequisite: 'renderer_first_report',
        });
        mainWindow.emitWebContents('did-finish-load');

        vi.advanceTimersByTime(BOOT_STUCK_WARNING_MS);

        expect(updateSplashWindowStatusSpy).toHaveBeenLastCalledWith(
            splashWindow,
            expect.objectContaining({
                stage: 'boot_stuck',
                blockingPrerequisite: 'renderer_first_report',
                isStuck: true,
            })
        );
        expect(mainWindow.show).not.toHaveBeenCalled();
    });

    it('resets the warning timer when boot progress advances after the first renderer report', () => {
        const mainWindow = createMockWindow(3);
        const splashWindow = createMockWindow(4);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
            warningMs: 1000,
            forceShowMs: 5000,
        });
        reportMainBootStatus({
            stage: 'renderer_connecting',
            blockingPrerequisite: 'renderer_first_report',
        });
        mainWindow.emitWebContents('did-finish-load');

        vi.advanceTimersByTime(900);
        expect(
            reportRendererBootStatus(mainWindow as never, {
                stage: 'renderer_connecting',
                blockingPrerequisite: 'renderer_first_report',
            })
        ).toEqual({ accepted: true });

        vi.advanceTimersByTime(900);
        expect(updateSplashWindowStatusSpy).not.toHaveBeenCalledWith(
            splashWindow,
            expect.objectContaining({
                stage: 'boot_stuck',
            })
        );

        vi.advanceTimersByTime(101);
        expect(updateSplashWindowStatusSpy).toHaveBeenLastCalledWith(
            splashWindow,
            expect.objectContaining({
                stage: 'boot_stuck',
                blockingPrerequisite: 'renderer_first_report',
            })
        );
    });

    it('does not reset the warning timer for same-stage elapsed-only refreshes', () => {
        const mainWindow = createMockWindow(5);
        const splashWindow = createMockWindow(6);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
            warningMs: 1000,
            forceShowMs: 5000,
        });
        mainWindow.emitWebContents('did-finish-load');

        expect(
            reportRendererBootStatus(mainWindow as never, {
                stage: 'profile_resolving',
                blockingPrerequisite: 'resolved_profile',
            })
        ).toEqual({ accepted: true });

        vi.advanceTimersByTime(900);
        expect(
            reportRendererBootStatus(mainWindow as never, {
                stage: 'profile_resolving',
                blockingPrerequisite: 'resolved_profile',
                elapsedMs: 900,
            })
        ).toEqual({ accepted: true });

        vi.advanceTimersByTime(101);
        expect(updateSplashWindowStatusSpy).toHaveBeenLastCalledWith(
            splashWindow,
            expect.objectContaining({
                stage: 'boot_stuck',
                blockingPrerequisite: 'resolved_profile',
            })
        );
    });

    it('forces the main window open and closes the splash after the force-show timeout', () => {
        const mainWindow = createMockWindow(10);
        const splashWindow = createMockWindow(20);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
        });
        mainWindow.emitWebContents('did-finish-load');
        reportRendererBootStatus(mainWindow as never, {
            stage: 'shell_bootstrap_loading',
            blockingPrerequisite: 'shell_bootstrap',
        });

        vi.advanceTimersByTime(BOOT_FORCE_SHOW_MS);

        expect(splashWindow.close).toHaveBeenCalledTimes(1);
        expect(mainWindow.show).toHaveBeenCalledTimes(1);
        expect(mainWindow.maximize).toHaveBeenCalledTimes(1);
        expect(updateSplashWindowStatusSpy).toHaveBeenLastCalledWith(
            splashWindow,
            expect.objectContaining({
                stage: 'handoff_forced',
                blockingPrerequisite: 'shell_bootstrap',
                isStuck: true,
            })
        );
    });

    it('keeps the force-show timer independent from warning resets', () => {
        const mainWindow = createMockWindow(11);
        const splashWindow = createMockWindow(21);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
            warningMs: 1000,
            forceShowMs: 2000,
        });
        reportMainBootStatus({
            stage: 'renderer_connecting',
            blockingPrerequisite: 'renderer_first_report',
        });
        mainWindow.emitWebContents('did-finish-load');

        vi.advanceTimersByTime(900);
        reportRendererBootStatus(mainWindow as never, {
            stage: 'renderer_connecting',
            blockingPrerequisite: 'renderer_first_report',
        });
        vi.advanceTimersByTime(900);
        reportRendererBootStatus(mainWindow as never, {
            stage: 'profile_resolving',
            blockingPrerequisite: 'resolved_profile',
        });
        vi.advanceTimersByTime(200);

        expect(splashWindow.close).toHaveBeenCalledTimes(1);
        expect(mainWindow.show).toHaveBeenCalledTimes(1);
        expect(mainWindow.maximize).toHaveBeenCalledTimes(1);
    });

    it('accepts the earliest renderer boot report and avoids forced handoff on a healthy startup path', () => {
        const mainWindow = createMockWindow(30);
        const splashWindow = createMockWindow(40);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
        });
        mainWindow.emitWebContents('did-finish-load');

        expect(
            reportRendererBootStatus(mainWindow as never, {
                stage: 'renderer_connecting',
                blockingPrerequisite: 'renderer_first_report',
            })
        ).toEqual({ accepted: true });
        expect(updateSplashWindowStatusSpy).toHaveBeenLastCalledWith(
            splashWindow,
            expect.objectContaining({
                stage: 'renderer_connecting',
                source: 'renderer',
                blockingPrerequisite: 'renderer_first_report',
            })
        );

        vi.advanceTimersByTime(BOOT_FORCE_SHOW_MS - 1000);
        expect(completeBootWindowHandoff(mainWindow as never)).toEqual({ success: true });

        vi.advanceTimersByTime(2000);

        expect(appLogWarnSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({
                tag: 'runtime.boot',
                message: 'Forced boot handoff after startup timeout.',
            })
        );
    });

    it('keeps ready handoff idempotent and logs late ready once after a forced handoff', () => {
        const mainWindow = createMockWindow(100);
        const splashWindow = createMockWindow(200);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
        });
        mainWindow.emitWebContents('did-finish-load');

        vi.advanceTimersByTime(BOOT_FORCE_SHOW_MS);

        expect(completeBootWindowHandoff(mainWindow as never)).toEqual({ success: true });
        expect(completeBootWindowHandoff(mainWindow as never)).toEqual({ success: true });
        expect(appLogInfoSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                tag: 'runtime.boot',
                message: 'Renderer ready signal arrived after forced handoff.',
            })
        );
    });

    it('keeps publishing stable-stage status updates when only elapsed time changes', () => {
        const mainWindow = createMockWindow(300);
        const splashWindow = createMockWindow(400);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
        });
        mainWindow.emitWebContents('did-finish-load');
        updateSplashWindowStatusSpy.mockClear();
        appLogInfoSpy.mockClear();

        reportRendererBootStatus(mainWindow as never, {
            stage: 'profile_resolving',
            blockingPrerequisite: 'resolved_profile',
            detail: 'Waiting for the active workspace profile.',
        });
        vi.advanceTimersByTime(250);
        reportRendererBootStatus(mainWindow as never, {
            stage: 'profile_resolving',
            blockingPrerequisite: 'resolved_profile',
            detail: 'Waiting for the active workspace profile.',
            elapsedMs: 250,
        });

        expect(updateSplashWindowStatusSpy).toHaveBeenCalledTimes(2);
        expect(appLogInfoSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects handoff and boot reports from a different window', () => {
        const mainWindow = createMockWindow(500);
        const splashWindow = createMockWindow(600);
        const otherWindow = createMockWindow(700);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
        });
        mainWindow.emitWebContents('did-finish-load');

        expect(
            reportRendererBootStatus(otherWindow as never, {
                stage: 'profile_resolving',
                blockingPrerequisite: 'resolved_profile',
            })
        ).toEqual({ accepted: false });
        expect(completeBootWindowHandoff(otherWindow as never)).toEqual({ success: false });
    });

    it('closes the hidden main window and quits the app when the splash closes before handoff', () => {
        const mainWindow = createMockWindow(800);
        const splashWindow = createMockWindow(900);

        registerBootWindows({
            mainWindow: mainWindow as never,
            splashWindow: splashWindow as never,
        });

        splashWindow.close();

        expect(mainWindow.close).toHaveBeenCalledTimes(1);
        expect(appQuitSpy).toHaveBeenCalledTimes(1);
    });
});

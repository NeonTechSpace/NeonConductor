import { app, type BrowserWindow } from 'electron';

import { appLog } from '@/app/main/logging';
import { updateSplashWindowStatus } from '@/app/main/window/splash';
import {
    BOOT_FORCE_SHOW_MS,
    BOOT_STUCK_WARNING_MS,
    type BootBlockingPrerequisite,
    type BootStage,
    createBootStatusSnapshot,
    getBootStatusDisplaySignature,
    getBootStatusSignature,
    type BootStatusSnapshot,
} from '@/app/shared/splashContract';

interface BootWindowState {
    mainWindow: BrowserWindow | null;
    splashWindow: BrowserWindow | null;
    warningTimer: ReturnType<typeof setTimeout> | null;
    forceTimer: ReturnType<typeof setTimeout> | null;
    handoffCompleted: boolean;
    handoffForced: boolean;
    lateReadyLogged: boolean;
    bootStartedAtMs: number;
    warningMs: number;
    lastProgressAtMs: number;
    lastProgressSignature: string | null;
    latestStatus: BootStatusSnapshot;
    latestStatusSignature: string;
    latestStatusDisplaySignature: string;
}

interface BootStatusUpdateInput {
    stage: BootStage;
    source: 'main' | 'renderer';
    isStuck?: boolean;
    blockingPrerequisite?: BootBlockingPrerequisite | null;
    headline?: string;
    detail?: string;
    elapsedMs?: number;
}

const bootWindowState: BootWindowState = {
    mainWindow: null,
    splashWindow: null,
    warningTimer: null,
    forceTimer: null,
    handoffCompleted: false,
    handoffForced: false,
    lateReadyLogged: false,
    bootStartedAtMs: 0,
    warningMs: BOOT_STUCK_WARNING_MS,
    lastProgressAtMs: 0,
    lastProgressSignature: null,
    latestStatus: createBootStatusSnapshot({
        stage: 'main_initializing',
        source: 'main',
        elapsedMs: 0,
    }),
    latestStatusSignature: '',
    latestStatusDisplaySignature: '',
};

function ensureBootStart(): void {
    if (bootWindowState.bootStartedAtMs === 0) {
        bootWindowState.bootStartedAtMs = Date.now();
    }
}

function getElapsedMs(): number {
    ensureBootStart();
    return Math.max(0, Date.now() - bootWindowState.bootStartedAtMs);
}

function clearBootTimers(): void {
    if (bootWindowState.warningTimer) {
        clearTimeout(bootWindowState.warningTimer);
        bootWindowState.warningTimer = null;
    }
    if (bootWindowState.forceTimer) {
        clearTimeout(bootWindowState.forceTimer);
        bootWindowState.forceTimer = null;
    }
}

const bootProgressOrdinals: Record<string, number> = {
    'renderer_connecting:main': 1,
    'renderer_connecting:renderer': 2,
    profile_resolving: 3,
    mode_resolving: 4,
    shell_bootstrap_loading: 5,
    ready_to_show: 6,
};

function getBootProgressSignature(input: Pick<BootStatusSnapshot, 'stage' | 'source'>): string | null {
    switch (input.stage) {
        case 'renderer_connecting':
            return `${input.stage}:${input.source}`;
        case 'profile_resolving':
        case 'mode_resolving':
        case 'shell_bootstrap_loading':
        case 'ready_to_show':
            return input.stage;
        default:
            return null;
    }
}

function recordBootProgress(status: Pick<BootStatusSnapshot, 'stage' | 'source'>, atMs: number): void {
    const progressSignature = getBootProgressSignature(status);
    if (!progressSignature) {
        return;
    }

    bootWindowState.lastProgressSignature = progressSignature;
    bootWindowState.lastProgressAtMs = atMs;
}

function hasMeaningfulBootProgress(status: Pick<BootStatusSnapshot, 'stage' | 'source'>): boolean {
    const nextProgressSignature = getBootProgressSignature(status);
    if (!nextProgressSignature) {
        return false;
    }

    if (bootWindowState.lastProgressSignature === nextProgressSignature) {
        return false;
    }

    const previousProgressOrdinal =
        bootWindowState.lastProgressSignature === null
            ? 0
            : (bootProgressOrdinals[bootWindowState.lastProgressSignature] ?? 0);
    const nextProgressOrdinal = bootProgressOrdinals[nextProgressSignature] ?? 0;
    return nextProgressOrdinal > previousProgressOrdinal;
}

function scheduleBootWarningTimer(): void {
    if (bootWindowState.warningTimer || bootWindowState.handoffCompleted) {
        return;
    }

    bootWindowState.warningTimer = setTimeout(() => {
        bootWindowState.warningTimer = null;
        if (bootWindowState.handoffCompleted) {
            return;
        }

        const stuckStatus = createBootStatusSnapshot({
            stage: 'boot_stuck',
            source: 'main',
            elapsedMs: getElapsedMs(),
            isStuck: true,
            blockingPrerequisite: bootWindowState.latestStatus.blockingPrerequisite,
        });
        publishBootStatus(stuckStatus);
        appLog.warn({
            tag: 'runtime.boot',
            message: 'Boot warning threshold reached.',
            blockingPrerequisite: stuckStatus.blockingPrerequisite,
            elapsedMs: stuckStatus.elapsedMs,
        });
    }, bootWindowState.warningMs);
}

function maybeResetBootWarningTimerForProgress(status: BootStatusSnapshot): void {
    if (!hasMeaningfulBootProgress(status)) {
        return;
    }

    recordBootProgress(status, Date.now());

    if (!bootWindowState.warningTimer) {
        return;
    }

    clearTimeout(bootWindowState.warningTimer);
    bootWindowState.warningTimer = null;
    scheduleBootWarningTimer();
}

function startBootTimers(warningMs: number, forceShowMs: number): void {
    if (bootWindowState.warningTimer || bootWindowState.forceTimer || bootWindowState.handoffCompleted) {
        return;
    }

    bootWindowState.warningMs = warningMs;
    bootWindowState.lastProgressAtMs = Date.now();
    bootWindowState.lastProgressSignature = getBootProgressSignature(bootWindowState.latestStatus);

    scheduleBootWarningTimer();

    bootWindowState.forceTimer = setTimeout(() => {
        bootWindowState.forceTimer = null;
        forceBootWindowHandoff();
    }, forceShowMs);
}

function resetBootWindowState(): void {
    clearBootTimers();
    bootWindowState.mainWindow = null;
    bootWindowState.splashWindow = null;
    bootWindowState.handoffCompleted = false;
    bootWindowState.handoffForced = false;
    bootWindowState.lateReadyLogged = false;
    bootWindowState.bootStartedAtMs = 0;
    bootWindowState.warningMs = BOOT_STUCK_WARNING_MS;
    bootWindowState.lastProgressAtMs = 0;
    bootWindowState.lastProgressSignature = null;
    bootWindowState.latestStatus = createBootStatusSnapshot({
        stage: 'main_initializing',
        source: 'main',
        elapsedMs: 0,
    });
    bootWindowState.latestStatusSignature = '';
    bootWindowState.latestStatusDisplaySignature = '';
}

function isSameWindow(left: BrowserWindow | null, right: BrowserWindow | null): boolean {
    if (!left || !right) {
        return false;
    }

    return left.id === right.id;
}

function logBootStatusTransition(status: BootStatusSnapshot): void {
    appLog.info({
        tag: 'runtime.boot',
        message: 'Boot status updated.',
        stage: status.stage,
        source: status.source,
        elapsedMs: status.elapsedMs,
        isStuck: status.isStuck,
        blockingPrerequisite: status.blockingPrerequisite,
        headline: status.headline,
        detail: status.detail,
    });
}

function publishBootStatus(status: BootStatusSnapshot): void {
    const statusSignature = getBootStatusSignature(status);
    const statusDisplaySignature = getBootStatusDisplaySignature(status);
    if (statusDisplaySignature === bootWindowState.latestStatusDisplaySignature) {
        bootWindowState.latestStatus = status;
        return;
    }

    const didTransition = statusSignature !== bootWindowState.latestStatusSignature;
    bootWindowState.latestStatus = status;
    bootWindowState.latestStatusSignature = statusSignature;
    bootWindowState.latestStatusDisplaySignature = statusDisplaySignature;
    if (didTransition) {
        logBootStatusTransition(status);
    }

    maybeResetBootWarningTimerForProgress(status);

    if (bootWindowState.splashWindow && !bootWindowState.splashWindow.isDestroyed()) {
        void updateSplashWindowStatus(bootWindowState.splashWindow, status);
    }
}

function updateBootStatus(input: BootStatusUpdateInput): void {
    publishBootStatus(
        createBootStatusSnapshot({
            ...input,
            elapsedMs: input.elapsedMs ?? getElapsedMs(),
        })
    );
}

function forceBootWindowHandoff(): void {
    if (bootWindowState.handoffCompleted) {
        return;
    }

    bootWindowState.handoffCompleted = true;
    bootWindowState.handoffForced = true;
    clearBootTimers();

    const forcedStatus = createBootStatusSnapshot({
        stage: 'handoff_forced',
        source: 'main',
        elapsedMs: getElapsedMs(),
        isStuck: true,
        blockingPrerequisite: bootWindowState.latestStatus.blockingPrerequisite,
    });
    publishBootStatus(forcedStatus);
    appLog.warn({
        tag: 'runtime.boot',
        message: 'Forced boot handoff after startup timeout.',
        blockingPrerequisite: bootWindowState.latestStatus.blockingPrerequisite,
        elapsedMs: forcedStatus.elapsedMs,
    });

    if (bootWindowState.splashWindow && !bootWindowState.splashWindow.isDestroyed()) {
        bootWindowState.splashWindow.close();
    }

    if (bootWindowState.mainWindow && !bootWindowState.mainWindow.isDestroyed()) {
        if (!bootWindowState.mainWindow.isVisible()) {
            bootWindowState.mainWindow.show();
        }
        if (!bootWindowState.mainWindow.isMaximized()) {
            bootWindowState.mainWindow.maximize();
        }
    }

    bootWindowState.splashWindow = null;
}

export function reportMainBootStatus(input: Omit<BootStatusUpdateInput, 'source'>): void {
    updateBootStatus({
        ...input,
        source: 'main',
    });
}

export function reportRendererBootStatus(
    window: BrowserWindow | null,
    input: Omit<BootStatusUpdateInput, 'source'>
): { accepted: boolean } {
    if (!window || (bootWindowState.mainWindow && !isSameWindow(window, bootWindowState.mainWindow))) {
        return { accepted: false };
    }

    updateBootStatus({
        ...input,
        source: 'renderer',
        elapsedMs: input.elapsedMs ?? getElapsedMs(),
    });
    return { accepted: true };
}

export function registerBootWindows(input: {
    mainWindow: BrowserWindow;
    splashWindow: BrowserWindow;
    warningMs?: number;
    forceShowMs?: number;
}): void {
    ensureBootStart();
    clearBootTimers();
    bootWindowState.mainWindow = input.mainWindow;
    bootWindowState.splashWindow = input.splashWindow;
    bootWindowState.handoffCompleted = false;
    bootWindowState.handoffForced = false;
    bootWindowState.lateReadyLogged = false;

    publishBootStatus(bootWindowState.latestStatus);

    input.splashWindow.once('closed', () => {
        if (bootWindowState.handoffCompleted) {
            bootWindowState.splashWindow = null;
            return;
        }

        clearBootTimers();

        if (bootWindowState.mainWindow && !bootWindowState.mainWindow.isDestroyed()) {
            bootWindowState.mainWindow.close();
        }

        resetBootWindowState();
        app.quit();
    });

    if (typeof input.mainWindow.webContents.once === 'function') {
        input.mainWindow.webContents.once('did-finish-load', () => {
            startBootTimers(input.warningMs ?? BOOT_STUCK_WARNING_MS, input.forceShowMs ?? BOOT_FORCE_SHOW_MS);
        });
        return;
    }

    startBootTimers(input.warningMs ?? BOOT_STUCK_WARNING_MS, input.forceShowMs ?? BOOT_FORCE_SHOW_MS);
}

export function completeBootWindowHandoff(window: BrowserWindow | null): { success: boolean } {
    if (!window) {
        return { success: false };
    }

    if (bootWindowState.mainWindow && !isSameWindow(window, bootWindowState.mainWindow)) {
        return { success: false };
    }

    if (bootWindowState.handoffCompleted) {
        if (bootWindowState.handoffForced && !bootWindowState.lateReadyLogged) {
            bootWindowState.lateReadyLogged = true;
            appLog.info({
                tag: 'runtime.boot',
                message: 'Renderer ready signal arrived after forced handoff.',
                elapsedMs: getElapsedMs(),
            });
        }
        return { success: true };
    }

    bootWindowState.handoffCompleted = true;
    clearBootTimers();

    if (bootWindowState.splashWindow && !bootWindowState.splashWindow.isDestroyed()) {
        bootWindowState.splashWindow.close();
    }

    if (!window.isVisible()) {
        window.show();
    }
    if (!window.isMaximized()) {
        window.maximize();
    }

    bootWindowState.splashWindow = null;
    return { success: true };
}

export function resetBootWindowStateForTests(): void {
    resetBootWindowState();
}

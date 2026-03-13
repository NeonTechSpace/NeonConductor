/**
 * Auto-updater setup with release-channel switching support.
 * Uses GitHub Pages feed metadata while keeping all interaction in renderer UI.
 */

import { app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import electronUpdater, { type ProgressInfo } from 'electron-updater';

import { appLog } from '@/app/main/logging';

const { autoUpdater } = electronUpdater;

export type UpdateChannel = 'stable' | 'beta' | 'alpha';
type UpdateRequestKind = 'startup' | 'manual' | 'switch';

export type SwitchStatusPhase = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'no_update' | 'error';

export interface SwitchStatusPayload {
    phase: SwitchStatusPhase;
    channel: UpdateChannel;
    percent: number | null;
    message: string;
    canInteract: boolean;
}

export interface SwitchChannelResult {
    channel: UpdateChannel;
    changed: boolean;
    cancelled: boolean;
    checkStarted: boolean;
    message: string;
}

export interface UpdateActionResult {
    started: boolean;
    message: string;
}

interface PersistedChannelState {
    channel: UpdateChannel;
    exists: boolean;
}

interface ActiveUpdateRequest {
    kind: UpdateRequestKind;
    channel: UpdateChannel;
}

const DEFAULT_CHANNEL: UpdateChannel = 'stable';
const PAGES_FEED_BASE_URL = 'https://neonsy.github.io/NeonConductor/updates';

let mainWindow: BrowserWindow | null = null;
let initialized = false;
let currentChannel: UpdateChannel = DEFAULT_CHANNEL;
let activeRequest: ActiveUpdateRequest | null = null;
let resetStatusTimer: NodeJS.Timeout | null = null;
let channelStore: Store<{ channel?: UpdateChannel }> | null = null;
let hasDownloadedUpdate = false;

let switchStatus: SwitchStatusPayload = {
    phase: 'idle',
    channel: DEFAULT_CHANNEL,
    percent: null,
    message: '',
    canInteract: true,
};

function isUpdaterEnabled(): boolean {
    return app.isPackaged || process.env['UPDATER_ENABLED'] === '1';
}

function isUpdateChannel(value: unknown): value is UpdateChannel {
    return value === 'stable' || value === 'beta' || value === 'alpha';
}

function getWindow(): BrowserWindow | null {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow;
    }

    mainWindow = BrowserWindow.getAllWindows()[0] ?? null;
    return mainWindow;
}

function clearResetTimer(): void {
    if (resetStatusTimer) {
        clearTimeout(resetStatusTimer);
        resetStatusTimer = null;
    }
}

function scheduleStatusReset(delayMs = 500): void {
    clearResetTimer();
    resetStatusTimer = setTimeout(() => {
        switchStatus = {
            phase: 'idle',
            channel: currentChannel,
            percent: null,
            message: '',
            canInteract: true,
        };
    }, delayMs);
}

function updateSwitchStatus(patch: Partial<SwitchStatusPayload>): void {
    clearResetTimer();

    switchStatus = {
        ...switchStatus,
        channel: currentChannel,
        ...patch,
    };
}

function isCheckInFlight(): boolean {
    return activeRequest !== null;
}

function toUpdaterChannel(channel: UpdateChannel): 'latest' | 'beta' | 'alpha' {
    if (channel === 'stable') return 'latest';
    return channel;
}

function applyChannel(channel: UpdateChannel): void {
    currentChannel = channel;
    autoUpdater.channel = toUpdaterChannel(channel);
    autoUpdater.allowPrerelease = channel !== 'stable';
}

function getFeedBaseUrlForChannel(channel: UpdateChannel): string {
    return `${PAGES_FEED_BASE_URL}/${channel}/`;
}

function getChannelStore(): Store<{ channel?: UpdateChannel }> {
    if (channelStore) {
        return channelStore;
    }

    channelStore = new Store<{ channel?: UpdateChannel }>({
        name: 'updater-channel',
    });

    return channelStore;
}

function loadPersistedChannel(): PersistedChannelState {
    try {
        const store = getChannelStore();

        if (!store.has('channel')) {
            return { channel: DEFAULT_CHANNEL, exists: false };
        }

        const persisted = store.get('channel');
        if (isUpdateChannel(persisted)) {
            return { channel: persisted, exists: true };
        }

        appLog.error({
            tag: 'updates',
            message: 'Persisted channel is invalid. Re-seeding from installed build.',
        });
        return { channel: DEFAULT_CHANNEL, exists: false };
    } catch (error) {
        appLog.error({
            tag: 'updates',
            message: 'Failed to read persisted updater channel.',
            ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
        });
    }

    return { channel: DEFAULT_CHANNEL, exists: false };
}

function inferInstalledChannel(version: string): UpdateChannel {
    const normalized = version.toLowerCase();
    if (normalized.includes('-alpha')) return 'alpha';
    if (normalized.includes('-beta')) return 'beta';
    return 'stable';
}

function persistChannel(channel: UpdateChannel): void {
    getChannelStore().set('channel', channel);
}

function configureFeedForChannel(channel: UpdateChannel, applyResolvedChannel = true): void {
    const feedBaseUrl = getFeedBaseUrlForChannel(channel);
    appLog.info({
        tag: 'updates',
        message: 'Configured updater feed.',
        channel,
        feedBaseUrl,
    });

    autoUpdater.setFeedURL({
        provider: 'generic',
        url: feedBaseUrl,
        channel: toUpdaterChannel(channel),
    });

    if (applyResolvedChannel) {
        applyChannel(channel);
    }
}

async function checkForUpdatesForSelectedChannel(channel: UpdateChannel, applyResolvedChannel = true): Promise<void> {
    configureFeedForChannel(channel, applyResolvedChannel);
    await autoUpdater.checkForUpdates();
}

function beginActiveRequest(kind: UpdateRequestKind, channel: UpdateChannel, message: string): void {
    activeRequest = {
        kind,
        channel,
    };

    updateSwitchStatus({
        phase: 'checking',
        channel,
        percent: 0,
        message,
        canInteract: false,
    });
}

function clearActiveRequest(): ActiveUpdateRequest | null {
    const request = activeRequest;
    activeRequest = null;
    return request;
}

function toBusyMessage(kind: UpdateRequestKind): string {
    if (kind === 'switch') {
        return 'Checking for updates in the selected channel...';
    }

    return 'Checking for updates in the selected channel...';
}

function toErrorMessage(kind: UpdateRequestKind): string {
    if (kind === 'switch') {
        return 'The selected channel could not be updated right now.';
    }

    return 'Unable to check for updates right now.';
}

function toNoUpdateMessage(kind: UpdateRequestKind): string {
    if (kind === 'switch') {
        return 'No update is available in the selected channel right now.';
    }

    return 'You are already on the latest build for the selected channel.';
}

function startSwitchFlow(channel: UpdateChannel, options: { feedConfigured?: boolean } = {}): void {
    beginActiveRequest('switch', channel, toBusyMessage('switch'));

    const checkPromise = options.feedConfigured
        ? autoUpdater.checkForUpdates()
        : checkForUpdatesForSelectedChannel(channel, false);

    void checkPromise.catch((error: unknown) => {
        appLog.error({
            tag: 'updates',
            message: 'Failed to check for updates after channel switch.',
            channel,
            ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
        });
        const request = activeRequest;
        if (!request || request.kind !== 'switch' || request.channel !== channel) {
            return;
        }

        clearActiveRequest();
        updateSwitchStatus({
            phase: 'error',
            channel,
            percent: null,
            message: toErrorMessage('switch'),
            canInteract: true,
        });
        scheduleStatusReset(1500);
    });
}

export function getCurrentChannel(): UpdateChannel {
    return currentChannel;
}

export function getSwitchStatusSnapshot(): SwitchStatusPayload {
    return { ...switchStatus };
}

export function resolvePersistedUpdateChannel(): UpdateChannel {
    const persistedChannel = loadPersistedChannel();
    return persistedChannel.exists ? persistedChannel.channel : inferInstalledChannel(app.getVersion());
}

export function dismissUpdateStatus(): void {
    if (activeRequest) {
        return;
    }

    updateSwitchStatus({
        phase: 'idle',
        channel: currentChannel,
        percent: null,
        message: '',
        canInteract: true,
    });
}

export function restartToApplyUpdate(): UpdateActionResult {
    if (!hasDownloadedUpdate) {
        return {
            started: false,
            message: 'No downloaded update is ready to install.',
        };
    }

    app.removeAllListeners('window-all-closed');
    autoUpdater.quitAndInstall(true, true);

    return {
        started: true,
        message: 'Restarting to install the downloaded update.',
    };
}

export async function checkForUpdatesManually(): Promise<UpdateActionResult> {
    if (!isUpdaterEnabled()) {
        return {
            started: false,
            message: 'Updater is disabled in development builds.',
        };
    }

    if (isCheckInFlight()) {
        return {
            started: false,
            message: 'An update check is already in progress.',
        };
    }

    beginActiveRequest('manual', currentChannel, toBusyMessage('manual'));

    try {
        await checkForUpdatesForSelectedChannel(currentChannel, true);
        return {
            started: true,
            message: 'Checking for updates in the selected channel...',
        };
    } catch (error) {
        appLog.error({
            tag: 'updates',
            message: 'Manual update check failed.',
            channel: currentChannel,
            ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
        });
        clearActiveRequest();
        updateSwitchStatus({
            phase: 'error',
            channel: currentChannel,
            percent: null,
            message: toErrorMessage('manual'),
            canInteract: true,
        });
        scheduleStatusReset(1500);

        return {
            started: false,
            message: 'Failed to check for updates.',
        };
    }
}

export function switchChannel(channel: UpdateChannel): SwitchChannelResult {
    if (!isUpdaterEnabled()) {
        return {
            channel: currentChannel,
            changed: false,
            cancelled: false,
            checkStarted: false,
            message: 'Updater is disabled in development builds.',
        };
    }

    if (isCheckInFlight()) {
        return {
            channel: currentChannel,
            changed: false,
            cancelled: false,
            checkStarted: false,
            message: 'An update check is already in progress.',
        };
    }

    if (channel === currentChannel) {
        return {
            channel,
            changed: false,
            cancelled: false,
            checkStarted: false,
            message: 'This channel is already selected.',
        };
    }

    try {
        configureFeedForChannel(channel, false);
    } catch (error) {
        appLog.error({
            tag: 'updates',
            message: 'Failed to configure updater feed for selected channel.',
            channel,
            ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
        });
        updateSwitchStatus({
            phase: 'error',
            channel: currentChannel,
            percent: null,
            message: 'Failed to configure updates for the selected channel.',
            canInteract: true,
        });
        scheduleStatusReset(1500);

        return {
            channel: currentChannel,
            changed: false,
            cancelled: false,
            checkStarted: false,
            message: 'Failed to configure selected channel updates.',
        };
    }

    persistChannel(channel);
    applyChannel(channel);
    hasDownloadedUpdate = false;
    startSwitchFlow(channel, { feedConfigured: true });

    return {
        channel,
        changed: true,
        cancelled: false,
        checkStarted: true,
        message: 'Channel switched. Checking for updates now.',
    };
}

export function initAutoUpdater(): void {
    if (!isUpdaterEnabled()) {
        return;
    }

    mainWindow = BrowserWindow.getAllWindows()[0] ?? null;

    if (initialized) {
        return;
    }

    initialized = true;

    const resolvedChannel = resolvePersistedUpdateChannel();
    const persistedChannel = loadPersistedChannel();
    if (!persistedChannel.exists) {
        persistChannel(resolvedChannel);
    }
    currentChannel = resolvedChannel;

    applyChannel(currentChannel);

    switchStatus = {
        phase: 'idle',
        channel: currentChannel,
        percent: null,
        message: '',
        canInteract: true,
    };

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        if (!activeRequest) {
            return;
        }

        updateSwitchStatus({
            phase: 'checking',
            channel: activeRequest.channel,
            percent: 0,
            message: toBusyMessage(activeRequest.kind),
            canInteract: false,
        });
    });

    autoUpdater.on('update-available', () => {
        if (!activeRequest) {
            return;
        }

        updateSwitchStatus({
            phase: 'downloading',
            channel: activeRequest.channel,
            percent: 0,
            message: 'Downloading update... 0%',
            canInteract: false,
        });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        getWindow()?.setProgressBar(progress.percent / 100);

        if (!activeRequest) {
            return;
        }

        const rounded = Math.max(0, Math.min(100, Math.round(progress.percent)));

        updateSwitchStatus({
            phase: 'downloading',
            channel: activeRequest.channel,
            percent: rounded,
            message: `Downloading update... ${String(rounded)}%`,
            canInteract: false,
        });
    });

    autoUpdater.on('update-not-available', () => {
        getWindow()?.setProgressBar(-1);

        const request = clearActiveRequest();
        if (!request) {
            return;
        }

        if (request.kind === 'startup') {
            dismissUpdateStatus();
            return;
        }

        updateSwitchStatus({
            phase: 'no_update',
            channel: request.channel,
            percent: null,
            message: toNoUpdateMessage(request.kind),
            canInteract: true,
        });
        scheduleStatusReset(900);
    });

    autoUpdater.on('update-downloaded', () => {
        getWindow()?.setProgressBar(-1);
        const request = clearActiveRequest();
        hasDownloadedUpdate = true;

        updateSwitchStatus({
            phase: 'downloaded',
            channel: request?.channel ?? currentChannel,
            percent: 100,
            message:
                request?.kind === 'switch'
                    ? 'Update ready. Restart to complete the channel switch.'
                    : 'Update ready. Restart to install the latest build.',
            canInteract: true,
        });
    });

    autoUpdater.on('error', (error) => {
        appLog.error({
            tag: 'updates',
            message: 'Auto-updater emitted an error event.',
            ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
        });
        getWindow()?.setProgressBar(-1);

        const request = clearActiveRequest();
        if (!request) {
            return;
        }

        updateSwitchStatus({
            phase: 'error',
            channel: request.channel,
            percent: null,
            message: toErrorMessage(request.kind),
            canInteract: true,
        });
        scheduleStatusReset(1500);
    });

    beginActiveRequest('startup', currentChannel, toBusyMessage('startup'));
    void checkForUpdatesForSelectedChannel(currentChannel, true).catch((error: unknown) => {
        appLog.warn({
            tag: 'updates',
            message: 'Initial updater check failed.',
            ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
        });
        const request = clearActiveRequest();
        if (!request || request.kind !== 'startup') {
            return;
        }

        dismissUpdateStatus();
    });
}

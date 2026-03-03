/**
 * Auto-updater setup with release-channel switching support.
 * Supports stable/beta/alpha channels, persisted channel preference,
 * and switch status reporting for renderer UI.
 */

import { app, BrowserWindow, dialog } from 'electron';
import Store from 'electron-store';
import { autoUpdater, type ProgressInfo } from 'electron-updater';

import { GitHubReleaseResolverError, resolveLatestReleaseForChannel } from '@/app/main/updates/githubReleaseResolver';

export type UpdateChannel = 'stable' | 'beta' | 'alpha';

export type SwitchStatusPhase = 'idle' | 'warning' | 'checking' | 'downloading' | 'downloaded' | 'no_update' | 'error';

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

interface PersistedChannelState {
    channel: UpdateChannel;
    exists: boolean;
}

interface ConfigureFeedOptions {
    forceRefresh?: boolean;
    applyResolvedChannel?: boolean;
}

interface CachedFeedConfig {
    tag: string;
    feedBaseUrl: string;
}

const DEFAULT_CHANNEL: UpdateChannel = 'stable';

let mainWindow: BrowserWindow | null = null;
let initialized = false;
let currentChannel: UpdateChannel = DEFAULT_CHANNEL;
let activeSwitch: { channel: UpdateChannel } | null = null;
let resetStatusTimer: NodeJS.Timeout | null = null;
let channelStore: Store<{ channel?: UpdateChannel }> | null = null;
let manualCheckRequested = false;
const resolvedFeedCache = new Map<UpdateChannel, CachedFeedConfig>();

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

function scheduleStatusReset(delayMs = 300): void {
    if (resetStatusTimer) {
        clearTimeout(resetStatusTimer);
    }

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
    if (resetStatusTimer) {
        clearTimeout(resetStatusTimer);
        resetStatusTimer = null;
    }

    switchStatus = {
        ...switchStatus,
        channel: currentChannel,
        ...patch,
    };
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

        console.error('[updater] Persisted channel is invalid. Re-seeding from stable default.');
        return { channel: DEFAULT_CHANNEL, exists: false };
    } catch (error) {
        console.error('[updater] Failed to read persisted channel:', error);
    }

    return { channel: DEFAULT_CHANNEL, exists: false };
}

export function resolvePersistedUpdateChannel(): UpdateChannel {
    return loadPersistedChannel().channel;
}

function persistChannel(channel: UpdateChannel): void {
    getChannelStore().set('channel', channel);
}

async function configureFeedForChannel(channel: UpdateChannel, options: ConfigureFeedOptions = {}): Promise<void> {
    const forceRefresh = options.forceRefresh ?? false;
    const applyResolvedChannel = options.applyResolvedChannel ?? true;

    let feedConfig = !forceRefresh ? resolvedFeedCache.get(channel) : undefined;

    try {
        if (!feedConfig) {
            const release = await resolveLatestReleaseForChannel(channel);
            feedConfig = {
                tag: release.tag,
                feedBaseUrl: release.feedBaseUrl,
            };
            resolvedFeedCache.set(channel, feedConfig);
        }

        const resolvedFeed = feedConfig;

        console.info(`[updater][resolver] channel=${channel} tag=${resolvedFeed.tag} feed=${resolvedFeed.feedBaseUrl}`);

        autoUpdater.setFeedURL({
            provider: 'generic',
            url: resolvedFeed.feedBaseUrl,
            channel: toUpdaterChannel(channel),
        });

        if (applyResolvedChannel) {
            applyChannel(channel);
        }
    } catch (error) {
        if (error instanceof GitHubReleaseResolverError) {
            console.error(
                `[updater][resolver] channel=${channel} code=${error.code} status=${String(error.statusCode ?? 'n/a')} message=${error.message}`
            );
        } else {
            console.error(`[updater][resolver] channel=${channel} message=Failed to resolve feed.`, error);
        }

        throw error;
    }
}

async function checkForUpdatesForSelectedChannel(
    channel: UpdateChannel,
    options: ConfigureFeedOptions = {}
): Promise<void> {
    await configureFeedForChannel(channel, {
        forceRefresh: options.forceRefresh ?? true,
        applyResolvedChannel: options.applyResolvedChannel ?? true,
    });
    await autoUpdater.checkForUpdates();
}

function startSwitchFlow(channel: UpdateChannel, options: { feedConfigured?: boolean } = {}): void {
    activeSwitch = { channel };
    updateSwitchStatus({
        phase: 'checking',
        channel,
        percent: 0,
        message: 'Checking for updates in the selected channel...',
        canInteract: false,
    });

    const checkPromise = options.feedConfigured
        ? autoUpdater.checkForUpdates()
        : checkForUpdatesForSelectedChannel(channel, {
              forceRefresh: true,
              applyResolvedChannel: false,
          });

    void checkPromise.catch((error: unknown) => {
        console.error('[updater] Failed to check for updates after channel switch:', error);
        activeSwitch = null;
        updateSwitchStatus({
            phase: 'error',
            percent: null,
            message: 'Failed to check for updates in the selected channel.',
            canInteract: true,
        });
        scheduleStatusReset(1200);

        const window = getWindow();
        if (window) {
            void dialog.showMessageBox(window, {
                type: 'error',
                title: 'Channel Switch Failed',
                message: 'Failed to check for updates for the selected channel.',
            });
        }
    });
}

export function getCurrentChannel(): UpdateChannel {
    return currentChannel;
}

export function getSwitchStatusSnapshot(): SwitchStatusPayload {
    return { ...switchStatus };
}

export async function checkForUpdatesManually(): Promise<{ started: boolean; message: string }> {
    if (!isUpdaterEnabled()) {
        return {
            started: false,
            message: 'Updater is disabled in development builds.',
        };
    }

    manualCheckRequested = true;

    try {
        await checkForUpdatesForSelectedChannel(currentChannel, {
            forceRefresh: true,
            applyResolvedChannel: true,
        });
        return {
            started: true,
            message: 'Checking for updates in the selected channel...',
        };
    } catch (error) {
        manualCheckRequested = false;
        console.error('[updater] Manual update check failed:', error);

        const window = getWindow();
        if (window) {
            void dialog.showMessageBox(window, {
                type: 'error',
                title: 'Update Check Failed',
                message: 'Unable to check for updates in the selected channel right now.',
            });
        }

        return {
            started: false,
            message: 'Failed to check for updates.',
        };
    }
}

export async function switchChannel(channel: UpdateChannel): Promise<SwitchChannelResult> {
    if (!isUpdaterEnabled()) {
        return {
            channel: currentChannel,
            changed: false,
            cancelled: false,
            checkStarted: false,
            message: 'Updater is disabled in development builds.',
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

    const window = getWindow();

    updateSwitchStatus({
        phase: 'warning',
        channel,
        percent: null,
        message: 'Confirming channel switch...',
        canInteract: true,
    });

    let confirmed = true;

    if (window) {
        const { response } = await dialog.showMessageBox(window, {
            type: 'warning',
            title: 'Switch Update Channel',
            message: `Switch updates to ${channel}?`,
            detail: 'Switching channels may apply newer or older builds. This can cause compatibility issues with in-progress features.',
            buttons: ['Switch Channel', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
        });

        confirmed = response === 0;
    }

    if (!confirmed) {
        updateSwitchStatus({
            phase: 'idle',
            channel: currentChannel,
            percent: null,
            message: '',
            canInteract: true,
        });

        return {
            channel: currentChannel,
            changed: false,
            cancelled: true,
            checkStarted: false,
            message: 'Channel switch was cancelled.',
        };
    }

    try {
        await configureFeedForChannel(channel, {
            forceRefresh: true,
            applyResolvedChannel: false,
        });
    } catch {
        updateSwitchStatus({
            phase: 'error',
            channel: currentChannel,
            percent: null,
            message: 'Failed to resolve updates for the selected channel.',
            canInteract: true,
        });
        scheduleStatusReset(1200);

        if (window) {
            void dialog.showMessageBox(window, {
                type: 'error',
                title: 'Channel Switch Failed',
                message: 'Unable to resolve updates for the selected channel from GitHub releases.',
            });
        }

        return {
            channel: currentChannel,
            changed: false,
            cancelled: false,
            checkStarted: false,
            message: 'Failed to resolve selected channel updates.',
        };
    }

    persistChannel(channel);
    applyChannel(channel);
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

    const persistedChannel = loadPersistedChannel();

    if (!persistedChannel.exists) {
        persistChannel(DEFAULT_CHANNEL);
        currentChannel = DEFAULT_CHANNEL;
    } else {
        currentChannel = persistedChannel.channel;
    }

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
        if (!activeSwitch) {
            return;
        }

        updateSwitchStatus({
            phase: 'checking',
            percent: 0,
            message: 'Checking for updates in the selected channel...',
            canInteract: false,
        });
    });

    autoUpdater.on('update-available', () => {
        if (manualCheckRequested) {
            manualCheckRequested = false;
        }

        if (!activeSwitch) {
            return;
        }

        updateSwitchStatus({
            phase: 'downloading',
            percent: 0,
            message: 'Downloading update... 0%',
            canInteract: false,
        });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        getWindow()?.setProgressBar(progress.percent / 100);

        if (!activeSwitch) {
            return;
        }

        const rounded = Math.max(0, Math.min(100, Math.round(progress.percent)));

        updateSwitchStatus({
            phase: 'downloading',
            percent: rounded,
            message: `Downloading update... ${String(rounded)}%`,
            canInteract: false,
        });
    });

    autoUpdater.on('update-not-available', () => {
        getWindow()?.setProgressBar(-1);

        if (!activeSwitch) {
            if (manualCheckRequested) {
                manualCheckRequested = false;
                const window = getWindow();
                if (window) {
                    void dialog.showMessageBox(window, {
                        type: 'info',
                        title: 'No Updates Available',
                        message: 'You are already on the latest build for the selected channel.',
                    });
                }
            }
            return;
        }

        const switchedChannel = activeSwitch.channel;
        activeSwitch = null;

        updateSwitchStatus({
            phase: 'no_update',
            channel: switchedChannel,
            percent: null,
            message: 'No update is available in the selected channel right now.',
            canInteract: true,
        });

        const window = getWindow();
        if (window) {
            void dialog.showMessageBox(window, {
                type: 'info',
                title: 'Channel Updated',
                message: 'No update is available in the selected channel right now.',
            });
        }

        scheduleStatusReset(500);
    });

    autoUpdater.on('update-downloaded', () => {
        getWindow()?.setProgressBar(-1);
        manualCheckRequested = false;

        if (activeSwitch) {
            const switchedChannel = activeSwitch.channel;
            activeSwitch = null;

            updateSwitchStatus({
                phase: 'downloaded',
                channel: switchedChannel,
                percent: 100,
                message: 'Preparing restart...',
                canInteract: false,
            });

            const window = getWindow();
            if (!window) {
                scheduleStatusReset(300);
                return;
            }

            void dialog
                .showMessageBox(window, {
                    type: 'info',
                    title: 'Channel Switch Ready',
                    message: 'In order to complete the switch, the app needs to be restarted.',
                    buttons: ['Restart', 'Close'],
                    defaultId: 0,
                    cancelId: 1,
                    noLink: true,
                })
                .then(({ response }) => {
                    if (response === 0) {
                        app.removeAllListeners('window-all-closed');
                        autoUpdater.quitAndInstall(true, true);
                        return;
                    }

                    updateSwitchStatus({
                        phase: 'idle',
                        channel: currentChannel,
                        percent: null,
                        message: '',
                        canInteract: true,
                    });
                });

            return;
        }

        const window = getWindow();
        if (!window) return;

        void dialog
            .showMessageBox(window, {
                type: 'info',
                title: 'Update Ready',
                message: 'A new version has been downloaded.',
                detail: 'Would you like to restart now to install the update, or install it when you quit?',
                buttons: ['Restart Now', 'Later'],
                defaultId: 0,
                cancelId: 1,
            })
            .then(({ response }) => {
                if (response === 0) {
                    app.removeAllListeners('window-all-closed');
                    autoUpdater.quitAndInstall(true, true);
                }
            });
    });

    autoUpdater.on('error', (error) => {
        console.error('Auto-updater error:', error);
        getWindow()?.setProgressBar(-1);

        if (!activeSwitch) {
            if (manualCheckRequested) {
                manualCheckRequested = false;
                const window = getWindow();
                if (window) {
                    void dialog.showMessageBox(window, {
                        type: 'error',
                        title: 'Update Check Failed',
                        message: 'Unable to check for updates right now.',
                    });
                }
            }
            return;
        }

        activeSwitch = null;

        updateSwitchStatus({
            phase: 'error',
            percent: null,
            message: 'Update failed while switching channels.',
            canInteract: true,
        });

        const window = getWindow();
        if (window) {
            void dialog.showMessageBox(window, {
                type: 'error',
                title: 'Channel Switch Failed',
                message:
                    'The channel changed, but downloading an update failed. You can retry from the selected channel.',
            });
        }

        scheduleStatusReset(1200);
    });

    void checkForUpdatesForSelectedChannel(currentChannel, {
        forceRefresh: true,
        applyResolvedChannel: true,
    }).catch((error: unknown) => {
        console.error('Auto-updater initial check failed:', error);
    });
}

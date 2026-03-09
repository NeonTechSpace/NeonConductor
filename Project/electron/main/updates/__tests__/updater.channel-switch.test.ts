import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UpdateChannel = 'stable' | 'beta' | 'alpha';

const PAGES_FEED_BASE_URL = 'https://neonsy.github.io/NeonConductor/updates';

class MockAutoUpdater extends EventEmitter {
    channel: string | null = null;
    allowPrerelease = false;
    autoDownload = true;
    autoInstallOnAppQuit = true;

    readonly setFeedURL = vi.fn();
    readonly checkForUpdates = vi.fn(() => Promise.resolve(null));
    readonly quitAndInstall = vi.fn();
}

async function flushTasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

async function settleStartupCheck(harness: { autoUpdater: MockAutoUpdater }): Promise<void> {
    harness.autoUpdater.emit('update-not-available');
    await flushTasks();
}

function expectFeedConfigured(
    autoUpdater: MockAutoUpdater,
    channel: UpdateChannel,
    updaterChannel: 'latest' | 'beta' | 'alpha'
): void {
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: `${PAGES_FEED_BASE_URL}/${channel}/`,
        channel: updaterChannel,
    });
}

async function loadUpdaterHarness(options: {
    appVersion: string;
    persistedChannel?: UpdateChannel;
    withWindow?: boolean;
}) {
    vi.resetModules();

    const autoUpdater = new MockAutoUpdater();
    const storeState: { channel?: UpdateChannel } = {};
    const mockWindow = {
        isDestroyed: vi.fn(() => false),
        setProgressBar: vi.fn(),
    };

    if (options.persistedChannel) {
        storeState.channel = options.persistedChannel;
    }

    const removeAllListeners = vi.fn();

    vi.doMock('electron', () => {
        return {
            app: {
                isPackaged: true,
                getVersion: vi.fn(() => options.appVersion),
                removeAllListeners,
            },
            BrowserWindow: {
                getAllWindows: vi.fn(() => (options.withWindow ? [mockWindow] : [])),
            },
        };
    });

    vi.doMock('electron-store', () => {
        return {
            default: class MockStore {
                get(key: string): unknown {
                    if (key === 'channel') {
                        return storeState.channel;
                    }

                    return undefined;
                }

                set(key: string, value: unknown): void {
                    if (key === 'channel' && (value === 'stable' || value === 'beta' || value === 'alpha')) {
                        storeState.channel = value;
                    }
                }

                has(key: string): boolean {
                    return key === 'channel' && storeState.channel !== undefined;
                }
            },
        };
    });

    vi.doMock('electron-updater', () => {
        return {
            autoUpdater,
        };
    });

    const updater = await import('@/app/main/updates/updater');

    return {
        updater,
        autoUpdater,
        storeState,
        mockWindow,
        removeAllListeners,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('updater channel switching', () => {
    it('uses persisted channel on startup without overwriting from installed suffix', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '9.9.9-beta.2',
            persistedChannel: 'alpha',
        });

        expect(harness.updater.resolvePersistedUpdateChannel()).toBe('alpha');

        harness.updater.initAutoUpdater();
        await flushTasks();

        expect(harness.updater.getCurrentChannel()).toBe('alpha');
        expect(harness.storeState.channel).toBe('alpha');
        expectFeedConfigured(harness.autoUpdater, 'alpha', 'alpha');
    });

    it('seeds persisted channel from installed suffix on first run', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '1.4.0-beta.8',
        });

        expect(harness.updater.resolvePersistedUpdateChannel()).toBe('beta');

        harness.updater.initAutoUpdater();
        await flushTasks();

        expect(harness.updater.getCurrentChannel()).toBe('beta');
        expect(harness.storeState.channel).toBe('beta');
        expectFeedConfigured(harness.autoUpdater, 'beta', 'beta');
    });

    it('configures Pages feed before update check when switching channel', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '1.2.0-beta.5',
            persistedChannel: 'beta',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();
        await settleStartupCheck(harness);

        harness.autoUpdater.setFeedURL.mockClear();
        harness.autoUpdater.checkForUpdates.mockClear();

        const result = harness.updater.switchChannel('alpha');
        await flushTasks();

        expect(result.changed).toBe(true);
        expect(result.checkStarted).toBe(true);
        expect(harness.updater.getCurrentChannel()).toBe('alpha');
        expect(harness.storeState.channel).toBe('alpha');
        expectFeedConfigured(harness.autoUpdater, 'alpha', 'alpha');

        const setFeedOrder = harness.autoUpdater.setFeedURL.mock.invocationCallOrder[0];
        const checkOrder = harness.autoUpdater.checkForUpdates.mock.invocationCallOrder[0];
        if (setFeedOrder === undefined || checkOrder === undefined) {
            throw new Error('Expected setFeedURL and checkForUpdates to both be invoked.');
        }

        expect(setFeedOrder).toBeLessThan(checkOrder);
        expect(harness.updater.getSwitchStatusSnapshot()).toEqual(
            expect.objectContaining({
                phase: 'checking',
                channel: 'alpha',
            })
        );
    });

    it('fails closed when feed configuration throws during channel switch', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '2.0.0-beta.1',
            persistedChannel: 'beta',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();
        await settleStartupCheck(harness);

        harness.autoUpdater.setFeedURL.mockClear();
        harness.autoUpdater.checkForUpdates.mockClear();
        harness.autoUpdater.setFeedURL.mockImplementationOnce(() => {
            throw new Error('feed failed');
        });

        const result = harness.updater.switchChannel('alpha');
        await flushTasks();

        expect(result.changed).toBe(false);
        expect(result.checkStarted).toBe(false);
        expect(harness.updater.getCurrentChannel()).toBe('beta');
        expect(harness.storeState.channel).toBe('beta');
        expect(harness.autoUpdater.setFeedURL).toHaveBeenCalledTimes(1);
        expect(harness.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
        expect(harness.updater.getSwitchStatusSnapshot()).toEqual(
            expect.objectContaining({
                phase: 'error',
                channel: 'beta',
            })
        );
    });

    it('surfaces a single renderer status when channel switch fails', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '2.0.0-beta.1',
            persistedChannel: 'beta',
            withWindow: true,
        });

        harness.updater.initAutoUpdater();
        await flushTasks();
        await settleStartupCheck(harness);

        harness.autoUpdater.checkForUpdates.mockImplementationOnce(() => {
            queueMicrotask(() => {
                harness.autoUpdater.emit('error', new Error('download failed'));
            });
            return Promise.reject(new Error('download failed'));
        });

        const result = harness.updater.switchChannel('stable');
        await flushTasks();

        expect(result.changed).toBe(true);
        expect(result.checkStarted).toBe(true);
        expect(harness.updater.getSwitchStatusSnapshot()).toEqual(
            expect.objectContaining({
                phase: 'error',
                channel: 'stable',
                message: 'The selected channel could not be updated right now.',
            })
        );
    });

    it('uses Pages feed for manual checks', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '3.1.0-alpha.3',
            persistedChannel: 'alpha',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();
        await settleStartupCheck(harness);

        harness.autoUpdater.setFeedURL.mockClear();
        harness.autoUpdater.checkForUpdates.mockClear();

        const result = await harness.updater.checkForUpdatesManually();
        await flushTasks();

        expect(result.started).toBe(true);
        expectFeedConfigured(harness.autoUpdater, 'alpha', 'alpha');
        expect(harness.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('uses latest channel metadata for stable checks', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '1.0.0',
            persistedChannel: 'stable',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        expect(harness.autoUpdater.setFeedURL).toHaveBeenCalledTimes(1);
        expectFeedConfigured(harness.autoUpdater, 'stable', 'latest');
    });

    it('restarts through the updater when a downloaded update is ready', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '1.0.0',
            persistedChannel: 'stable',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        harness.autoUpdater.emit('update-downloaded');

        const result = harness.updater.restartToApplyUpdate();

        expect(result.started).toBe(true);
        expect(harness.removeAllListeners).toHaveBeenCalledWith('window-all-closed');
        expect(harness.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    });

    it('dismisses a downloaded status without clearing the installed update', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '1.0.0',
            persistedChannel: 'stable',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        harness.autoUpdater.emit('update-downloaded');
        harness.updater.dismissUpdateStatus();

        expect(harness.updater.getSwitchStatusSnapshot()).toEqual(
            expect.objectContaining({
                phase: 'idle',
                channel: 'stable',
            })
        );
        expect(harness.updater.restartToApplyUpdate().started).toBe(true);
    });
});

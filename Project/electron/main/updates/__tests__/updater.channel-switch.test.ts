import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UpdateChannel = 'stable' | 'beta' | 'alpha';

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

async function loadUpdaterHarness(options: {
    appVersion: string;
    persistedChannel?: UpdateChannel;
    resolverImpl?: (channel: UpdateChannel) => Promise<{ channel: UpdateChannel; tag: string; feedBaseUrl: string }>;
}) {
    vi.resetModules();

    const autoUpdater = new MockAutoUpdater();
    const storeState: { channel?: UpdateChannel } = {};

    if (options.persistedChannel) {
        storeState.channel = options.persistedChannel;
    }

    const resolverMock = vi.fn(
        options.resolverImpl ??
            ((channel: UpdateChannel) => {
                const tag = channel === 'alpha' ? 'v1.2.3-alpha.7' : channel === 'beta' ? 'v1.2.3-beta.4' : 'v1.2.3';
                return Promise.resolve({
                    channel,
                    tag,
                    feedBaseUrl: `https://github.com/Neonsy/NeonConductor/releases/download/${tag}/`,
                });
            })
    );

    vi.doMock('electron', () => {
        return {
            app: {
                isPackaged: true,
                getVersion: vi.fn(() => options.appVersion),
                removeAllListeners: vi.fn(),
            },
            BrowserWindow: {
                getAllWindows: vi.fn(() => []),
            },
            dialog: {
                showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
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

    vi.doMock('@/app/main/updates/githubReleaseResolver', () => {
        class MockResolverError extends Error {
            readonly code: string;
            readonly statusCode: number | null;

            constructor(code: string, message: string, statusCode?: number) {
                super(message);
                this.code = code;
                this.statusCode = statusCode ?? null;
            }
        }

        return {
            resolveLatestReleaseForChannel: resolverMock,
            GitHubReleaseResolverError: MockResolverError,
        };
    });

    const updater = await import('@/app/main/updates/updater');

    return {
        updater,
        autoUpdater,
        resolverMock,
        storeState,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('updater channel switching', () => {
    it('resolves persisted channel for startup consumers', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '9.9.9-beta.2',
            persistedChannel: 'alpha',
        });

        expect(harness.updater.resolvePersistedUpdateChannel()).toBe('alpha');
    });

    it('uses persisted channel on startup without overwriting from installed suffix', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '9.9.9-beta.2',
            persistedChannel: 'alpha',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        expect(harness.updater.getCurrentChannel()).toBe('alpha');
        expect(harness.storeState.channel).toBe('alpha');
        expect(harness.resolverMock).toHaveBeenCalledWith('alpha');
    });

    it('seeds persisted channel from stable default on first run', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '1.4.0-beta.8',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        expect(harness.updater.getCurrentChannel()).toBe('stable');
        expect(harness.storeState.channel).toBe('stable');
        expect(harness.resolverMock).toHaveBeenCalledWith('stable');
    });

    it('resolves feed before update check when switching channel', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '1.2.0-beta.5',
            persistedChannel: 'beta',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        harness.resolverMock.mockClear();
        harness.autoUpdater.setFeedURL.mockClear();
        harness.autoUpdater.checkForUpdates.mockClear();

        const result = await harness.updater.switchChannel('alpha');
        await flushTasks();

        expect(result.changed).toBe(true);
        expect(result.checkStarted).toBe(true);
        expect(harness.updater.getCurrentChannel()).toBe('alpha');
        expect(harness.storeState.channel).toBe('alpha');
        expect(harness.resolverMock).toHaveBeenCalledWith('alpha');

        const setFeedOrder = harness.autoUpdater.setFeedURL.mock.invocationCallOrder[0];
        const checkOrder = harness.autoUpdater.checkForUpdates.mock.invocationCallOrder[0];
        if (setFeedOrder === undefined || checkOrder === undefined) {
            throw new Error('Expected setFeedURL and checkForUpdates to both be invoked.');
        }
        expect(setFeedOrder).toBeLessThan(checkOrder);
    });

    it('fails closed when resolver fails during channel switch', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '2.0.0-beta.1',
            persistedChannel: 'beta',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        harness.resolverMock.mockClear();
        harness.autoUpdater.setFeedURL.mockClear();
        harness.autoUpdater.checkForUpdates.mockClear();
        harness.resolverMock.mockRejectedValueOnce(new Error('resolver failed'));

        const result = await harness.updater.switchChannel('alpha');
        await flushTasks();

        expect(result.changed).toBe(false);
        expect(result.checkStarted).toBe(false);
        expect(harness.updater.getCurrentChannel()).toBe('beta');
        expect(harness.storeState.channel).toBe('beta');
        expect(harness.autoUpdater.setFeedURL).not.toHaveBeenCalled();
        expect(harness.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('uses strict resolver path for manual checks', async () => {
        const harness = await loadUpdaterHarness({
            appVersion: '3.1.0-alpha.3',
            persistedChannel: 'alpha',
        });

        harness.updater.initAutoUpdater();
        await flushTasks();

        harness.resolverMock.mockClear();
        harness.autoUpdater.setFeedURL.mockClear();
        harness.autoUpdater.checkForUpdates.mockClear();

        const result = await harness.updater.checkForUpdatesManually();
        await flushTasks();

        expect(result.started).toBe(true);
        expect(harness.resolverMock).toHaveBeenCalledWith('alpha');
        expect(harness.autoUpdater.setFeedURL).toHaveBeenCalledTimes(1);
        expect(harness.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });
});

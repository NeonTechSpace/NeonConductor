import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootStatusSnapshot } from '@/app/shared/splashContract';

const { exposeInMainWorldSpy, ipcOnSpy, ipcPhaseHandlerState } = vi.hoisted(() => ({
    exposeInMainWorldSpy: vi.fn(),
    ipcOnSpy: vi.fn(),
    ipcPhaseHandlerState: {
        handler: undefined as ((event: unknown, phase: unknown) => void) | undefined,
    },
}));

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld: exposeInMainWorldSpy,
    },
    ipcRenderer: {
        on: (channel: string, handler: (event: unknown, phase: unknown) => void) => {
            ipcOnSpy(channel, handler);
            ipcPhaseHandlerState.handler = handler;
        },
    },
}));

describe('splash preload bridge', () => {
    const originalProcessArgv = [...process.argv];

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        ipcPhaseHandlerState.handler = undefined;
        process.argv = originalProcessArgv.filter((argument) => !argument.startsWith('--neon-splash-mascot-source='));
    });

    it('exposes bootstrap payload and an onStatusChange bridge that replays the latest boot status', async () => {
        process.argv.push(
            '--neon-splash-mascot-source=file%3A%2F%2F%2FC%3A%2Frepo%2FProject%2Fsrc%2Fassets%2Fappicon.png'
        );

        await import('@/app/main/preload/splash');

        expect(exposeInMainWorldSpy).toHaveBeenCalledTimes(1);
        const splashBridge = exposeInMainWorldSpy.mock.calls[0]?.[1] as {
            getBootstrapPayload: () => {
                mascotSource: string | null;
                status: BootStatusSnapshot;
            };
            onStatusChange: (listener: (status: BootStatusSnapshot) => void) => () => void;
        };

        expect(splashBridge.getBootstrapPayload()).toMatchObject({
            mascotSource: 'file:///C:/repo/Project/src/assets/appicon.png',
            status: expect.objectContaining({
                stage: 'main_initializing',
            }),
        });

        const statusListener = vi.fn();
        splashBridge.onStatusChange(statusListener);

        expect(statusListener).toHaveBeenCalledWith(
            expect.objectContaining({
                stage: 'main_initializing',
            })
        );

        ipcPhaseHandlerState.handler?.(
            {},
            {
                stage: 'profile_resolving',
                headline: 'Resolving the active profile',
                detail: 'Resolving the active workspace profile.',
                isStuck: false,
                blockingPrerequisite: 'resolved_profile',
                elapsedMs: 100,
                source: 'renderer',
            }
        );

        expect(statusListener).toHaveBeenLastCalledWith(
            expect.objectContaining({
                stage: 'profile_resolving',
                blockingPrerequisite: 'resolved_profile',
            })
        );
    });
});

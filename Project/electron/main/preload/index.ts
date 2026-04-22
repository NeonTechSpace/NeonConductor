/**
 * Preload script - runs in isolated context before renderer loads.
 * Exposes only the tRPC IPC bridge to the renderer (minimal attack surface).
 */

import { contextBridge, ipcRenderer } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc-experimental/preload';

import {
    DEV_BROWSER_SYNC_MOUNT_CHANNEL,
    PICK_DIRECTORY_CHANNEL,
    isDevBrowserMountPayload,
    isPickDirectoryResult,
    type DevBrowserMountPayload,
    type PickDirectoryResult,
} from '@/app/shared/desktopBridgeContract';

contextBridge.exposeInMainWorld('neonDesktop', {
    async pickDirectory(): Promise<PickDirectoryResult> {
        const result: unknown = await ipcRenderer.invoke(PICK_DIRECTORY_CHANNEL);
        return isPickDirectoryResult(result) ? result : { canceled: true };
    },
    devBrowser: {
        async syncMount(payload: DevBrowserMountPayload): Promise<{ ok: boolean }> {
            if (!isDevBrowserMountPayload(payload)) {
                return { ok: false };
            }
            const result: unknown = await ipcRenderer.invoke(DEV_BROWSER_SYNC_MOUNT_CHANNEL, payload);
            return result && typeof result === 'object' && (result as Record<string, unknown>)['ok'] === true
                ? { ok: true }
                : { ok: false };
        },
    },
});

// 'loaded' fires after preload executes but before renderer scripts run
process.once('loaded', () => {
    exposeElectronTRPC();
});

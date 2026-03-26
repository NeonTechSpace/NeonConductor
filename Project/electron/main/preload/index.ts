/**
 * Preload script - runs in isolated context before renderer loads.
 * Exposes only the tRPC IPC bridge to the renderer (minimal attack surface).
 */

import { contextBridge, ipcRenderer } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc-experimental/preload';

import {
    PICK_DIRECTORY_CHANNEL,
    isPickDirectoryResult,
    type PickDirectoryResult,
} from '@/app/shared/desktopBridgeContract';

contextBridge.exposeInMainWorld('neonDesktop', {
    async pickDirectory(): Promise<PickDirectoryResult> {
        const result: unknown = await ipcRenderer.invoke(PICK_DIRECTORY_CHANNEL);
        return isPickDirectoryResult(result) ? result : { canceled: true };
    },
});

// 'loaded' fires after preload executes but before renderer scripts run
process.once('loaded', () => {
    exposeElectronTRPC();
});

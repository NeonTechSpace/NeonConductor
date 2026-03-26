import { contextBridge, ipcRenderer } from 'electron';

import {
    INITIAL_BOOT_STATUS_SNAPSHOT,
    isBootStatusSnapshot,
    SPLASH_BOOT_STATUS_CHANNEL,
    type SplashBootstrapPayload,
    type BootStatusSnapshot,
} from '@/app/shared/splashContract';

type BootStatusListener = (status: BootStatusSnapshot) => void;

const splashStatusListeners = new Set<BootStatusListener>();
let currentBootStatus: BootStatusSnapshot = INITIAL_BOOT_STATUS_SNAPSHOT;
const splashMascotSourceArgumentPrefix = '--neon-splash-mascot-source=';

function readSplashMascotSource(): string | null {
    const encodedSource = process.argv
        .find((argument) => argument.startsWith(splashMascotSourceArgumentPrefix))
        ?.slice(splashMascotSourceArgumentPrefix.length);
    if (!encodedSource) {
        return null;
    }

    try {
        return decodeURIComponent(encodedSource);
    } catch {
        return null;
    }
}

ipcRenderer.on(SPLASH_BOOT_STATUS_CHANNEL, (_event, nextStatus: unknown) => {
    if (!isBootStatusSnapshot(nextStatus)) {
        return;
    }

    currentBootStatus = nextStatus;

    for (const listener of splashStatusListeners) {
        listener(currentBootStatus);
    }
});

contextBridge.exposeInMainWorld('neonSplash', {
    getBootstrapPayload(): SplashBootstrapPayload {
        return {
            mascotSource: readSplashMascotSource(),
            status: currentBootStatus,
        };
    },
    onStatusChange(listener: BootStatusListener): () => void {
        splashStatusListeners.add(listener);
        listener(currentBootStatus);

        return () => {
            splashStatusListeners.delete(listener);
        };
    },
});

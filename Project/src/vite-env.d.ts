/// <reference types="vite/client" />

import type { DevBrowserMountPayload, PickDirectoryResult } from '@/app/shared/desktopBridgeContract';
import type { BootStatusSnapshot } from '@/app/shared/splashContract';

declare module '*.wasm?url' {
    const wasmAssetUrl: string;
    export default wasmAssetUrl;
}

declare global {
    interface Window {
        neonDesktop?: {
            pickDirectory(): Promise<PickDirectoryResult>;
            devBrowser: {
                syncMount(payload: DevBrowserMountPayload): Promise<{ ok: boolean }>;
            };
        };
        neonSplash?: {
            getBootstrapPayload(): {
                mascotSource: string | null;
                status: BootStatusSnapshot;
            };
            onStatusChange(listener: (status: BootStatusSnapshot) => void): () => void;
        };
    }
}

export {};

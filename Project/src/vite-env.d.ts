/// <reference types="vite/client" />

import type { BootStatusSnapshot } from '@/app/shared/splashContract';

declare module '*.wasm?url' {
    const wasmAssetUrl: string;
    export default wasmAssetUrl;
}

declare global {
    interface Window {
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

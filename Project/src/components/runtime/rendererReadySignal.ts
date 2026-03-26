import type { RendererReadySignalState } from '@/web/components/runtime/bootReadiness';
import { trpcClient } from '@/web/lib/trpcClient';

export interface RendererReadySignalSnapshot {
    readySignalState: RendererReadySignalState;
    readySignalErrorMessage?: string;
}

type ReadySignalListener = () => void;

let rendererReadySignalSnapshot: RendererReadySignalSnapshot = {
    readySignalState: 'idle',
};
let rendererReadySignalPromise: Promise<void> | null = null;
const rendererReadySignalListeners = new Set<ReadySignalListener>();

function emitRendererReadySignalSnapshot(nextSnapshot: RendererReadySignalSnapshot): void {
    rendererReadySignalSnapshot = nextSnapshot;
    for (const listener of rendererReadySignalListeners) {
        listener();
    }
}

export function getRendererReadySignalSnapshot(): RendererReadySignalSnapshot {
    return rendererReadySignalSnapshot;
}

export function subscribeRendererReadySignal(listener: ReadySignalListener): () => void {
    rendererReadySignalListeners.add(listener);
    return () => {
        rendererReadySignalListeners.delete(listener);
    };
}

export async function ensureRendererReadySignal(): Promise<void> {
    if (rendererReadySignalSnapshot.readySignalState === 'sent') {
        return;
    }

    if (rendererReadySignalPromise) {
        return rendererReadySignalPromise;
    }

    emitRendererReadySignalSnapshot({
        readySignalState: 'pending',
    });

    rendererReadySignalPromise = trpcClient.system.signalReady
        .mutate()
        .then(() => {
            emitRendererReadySignalSnapshot({
                readySignalState: 'sent',
            });
        })
        .catch((error: unknown) => {
            emitRendererReadySignalSnapshot({
                readySignalState: 'failed',
                readySignalErrorMessage: error instanceof Error ? error.message : String(error),
            });
        })
        .finally(() => {
            rendererReadySignalPromise = null;
        });

    return rendererReadySignalPromise;
}

export function resetRendererReadySignalForTests(): void {
    rendererReadySignalPromise = null;
    emitRendererReadySignalSnapshot({
        readySignalState: 'idle',
    });
}

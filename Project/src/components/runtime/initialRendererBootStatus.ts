import { trpcClient } from '@/web/lib/trpcClient';

import { createBootStatusSnapshot } from '@/app/shared/splashContract';

export interface InitialRendererBootStatusSnapshot {
    reportState: 'idle' | 'pending' | 'sent' | 'failed';
    reportErrorMessage?: string;
}

type InitialRendererBootStatusListener = () => void;

const initialRendererBootStatus = createBootStatusSnapshot({
    stage: 'renderer_connecting',
    source: 'renderer',
    elapsedMs: 0,
    detail: 'Renderer process connected. Waiting for shell boot diagnostics.',
});

let initialRendererBootStatusSnapshot: InitialRendererBootStatusSnapshot = {
    reportState: 'idle',
};
let initialRendererBootStatusPromise: Promise<void> | null = null;
const initialRendererBootStatusListeners = new Set<InitialRendererBootStatusListener>();

function emitInitialRendererBootStatusSnapshot(nextSnapshot: InitialRendererBootStatusSnapshot): void {
    initialRendererBootStatusSnapshot = nextSnapshot;
    for (const listener of initialRendererBootStatusListeners) {
        listener();
    }
}

export function getInitialRendererBootStatusSnapshot(): InitialRendererBootStatusSnapshot {
    return initialRendererBootStatusSnapshot;
}

export function subscribeInitialRendererBootStatus(listener: InitialRendererBootStatusListener): () => void {
    initialRendererBootStatusListeners.add(listener);
    return () => {
        initialRendererBootStatusListeners.delete(listener);
    };
}

export async function ensureInitialRendererBootStatusReport(): Promise<void> {
    if (initialRendererBootStatusSnapshot.reportState === 'sent') {
        return;
    }

    if (initialRendererBootStatusPromise) {
        return initialRendererBootStatusPromise;
    }

    emitInitialRendererBootStatusSnapshot({
        reportState: 'pending',
    });

    initialRendererBootStatusPromise = trpcClient.system.reportBootStatus
        .mutate(initialRendererBootStatus)
        .then((result) => {
            if (!result.accepted) {
                emitInitialRendererBootStatusSnapshot({
                    reportState: 'failed',
                    reportErrorMessage: 'Initial renderer boot report was not accepted.',
                });
                return;
            }

            emitInitialRendererBootStatusSnapshot({
                reportState: 'sent',
            });
        })
        .catch((error: unknown) => {
            emitInitialRendererBootStatusSnapshot({
                reportState: 'failed',
                reportErrorMessage: error instanceof Error ? error.message : String(error),
            });
        })
        .finally(() => {
            initialRendererBootStatusPromise = null;
        });

    return initialRendererBootStatusPromise;
}

export function resetInitialRendererBootStatusForTests(): void {
    initialRendererBootStatusPromise = null;
    emitInitialRendererBootStatusSnapshot({
        reportState: 'idle',
    });
}

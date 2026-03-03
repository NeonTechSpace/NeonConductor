import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

type RuntimeEventListener = (event: RuntimeEventRecordV1) => void;

export interface RuntimeEventBus {
    publish(event: RuntimeEventRecordV1): void;
    subscribe(listener: RuntimeEventListener): () => void;
}

class RuntimeEventBusImpl implements RuntimeEventBus {
    private readonly listeners = new Set<RuntimeEventListener>();

    publish(event: RuntimeEventRecordV1): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('[runtime-event-bus] listener error', error);
            }
        }
    }

    subscribe(listener: RuntimeEventListener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }
}

export const runtimeEventBus: RuntimeEventBus = new RuntimeEventBusImpl();

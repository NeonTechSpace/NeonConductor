import type { NeonObservabilityEvent, NeonObservabilitySubscriptionInput } from '@/app/backend/runtime/contracts';
import { trpcClient as runtimeClient } from '@/web/lib/trpcClient';

export interface NeonObservabilityTransportHandlers {
    onData: (event: unknown) => void;
    onError: (error: unknown) => void;
}

export interface NeonObservabilityTransportSubscription {
    unsubscribe: () => void;
}

export interface NeonObservabilityTransport {
    subscribe: (
        input: NeonObservabilitySubscriptionInput,
        handlers: NeonObservabilityTransportHandlers
    ) => NeonObservabilityTransportSubscription;
}

export function createTrpcNeonObservabilityTransport(): NeonObservabilityTransport {
    return {
        subscribe(input, handlers) {
            return runtimeClient.runtime.subscribeObservability.subscribe(input, {
                onData: handlers.onData,
                onError: handlers.onError,
            });
        },
    };
}

export type { NeonObservabilityEvent };

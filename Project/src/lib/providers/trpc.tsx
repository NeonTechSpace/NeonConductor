import { QueryClientProvider } from '@tanstack/react-query';
import { log } from 'evlog';
import { useEffect } from 'react';

import { useNeonObservabilityStreamStore } from '@/web/lib/observability/eventStream';
import { applyNeonObservabilitySubscriptionPayload } from '@/web/lib/observability/subscription';
import { createTrpcNeonObservabilityTransport } from '@/web/lib/observability/transport';
import {
    isRuntimeEventRecord,
    isSubscriptionControlPayload,
    isWindowStateEvent,
    normalizeSubscriptionPayload,
} from '@/web/lib/providers/subscriptionPayloads';
import { queryClient, trpcClient } from '@/web/lib/providers/trpcCore';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { invalidateQueriesForRuntimeEvent } from '@/web/lib/runtime/runtimeEventInvalidation';
import { trpcClient as runtimeClient } from '@/web/lib/trpcClient';
import { useWindowStateStreamStore } from '@/web/lib/window/stateStream';
import { trpc } from '@/web/trpc/client';

import type { ReactNode } from 'react';

interface TRPCProviderProps {
    children: ReactNode;
}

const isDev = import.meta.env.DEV;

function RuntimeEventStreamBootstrap(): ReactNode {
    const utils = trpc.useUtils();
    const setConnecting = useRuntimeEventStreamStore((state) => state.setConnecting);
    const setLive = useRuntimeEventStreamStore((state) => state.setLive);
    const setError = useRuntimeEventStreamStore((state) => state.setError);
    const pushEvent = useRuntimeEventStreamStore((state) => state.pushEvent);

    useEffect(() => {
        setConnecting();
        const { lastSequence } = useRuntimeEventStreamStore.getState();

        const subscription = runtimeClient.runtime.subscribeEvents.subscribe(
            lastSequence > 0 ? { afterSequence: lastSequence } : {},
            {
                onData: (event) => {
                    const normalizedEvent = normalizeSubscriptionPayload(event);

                    if (isSubscriptionControlPayload(normalizedEvent)) {
                        setLive();
                        return;
                    }

                    if (isRuntimeEventRecord(normalizedEvent)) {
                        pushEvent(normalizedEvent);
                        void invalidateQueriesForRuntimeEvent(utils, normalizedEvent);
                        return;
                    }

                    log.warn({
                        tag: 'runtime.stream',
                        message: 'Received invalid runtime event payload.',
                    });
                    setError('Received invalid runtime event payload.');
                },
                onError: (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    log.warn({
                        tag: 'runtime.stream',
                        message: 'Runtime event stream subscription failed.',
                        error: message,
                    });
                    setError(message);
                },
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, [setConnecting, setError, setLive, pushEvent, utils]);

    return null;
}

function WindowStateStreamBootstrap(): ReactNode {
    const setConnecting = useWindowStateStreamStore((state) => state.setConnecting);
    const setLive = useWindowStateStreamStore((state) => state.setLive);
    const setError = useWindowStateStreamStore((state) => state.setError);
    const pushEvent = useWindowStateStreamStore((state) => state.pushEvent);

    useEffect(() => {
        setConnecting();
        const { lastSequence } = useWindowStateStreamStore.getState();

        const subscription = runtimeClient.system.subscribeWindowState.subscribe(
            lastSequence > 0 ? { afterSequence: lastSequence } : {},
            {
                onData: (event) => {
                    const normalizedEvent = normalizeSubscriptionPayload(event);

                    if (isSubscriptionControlPayload(normalizedEvent)) {
                        setLive();
                        return;
                    }

                    if (isWindowStateEvent(normalizedEvent)) {
                        pushEvent(normalizedEvent);
                        return;
                    }

                    setError('Received invalid window state payload.');
                },
                onError: (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    setError(message);
                },
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, [setConnecting, setError, setLive, pushEvent]);

    return null;
}

function NeonObservabilityStreamBootstrap(): ReactNode {
    const setConnecting = useNeonObservabilityStreamStore((state) => state.setConnecting);
    const setLive = useNeonObservabilityStreamStore((state) => state.setLive);
    const setError = useNeonObservabilityStreamStore((state) => state.setError);
    const pushEvent = useNeonObservabilityStreamStore((state) => state.pushEvent);

    useEffect(() => {
        const transport = createTrpcNeonObservabilityTransport();
        setConnecting();
        const { lastSequence } = useNeonObservabilityStreamStore.getState();
        const subscription = transport.subscribe(lastSequence > 0 ? { afterSequence: lastSequence } : {}, {
            onData: (event) => {
                applyNeonObservabilitySubscriptionPayload({
                    payload: event,
                    setLive,
                    setError,
                    pushEvent,
                });
            },
            onError: (error) => {
                const message = error instanceof Error ? error.message : String(error);
                log.warn({
                    tag: 'observability.stream',
                    message: 'Neon observability subscription failed.',
                    error: message,
                });
                setError(message);
            },
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [setConnecting, setError, setLive, pushEvent]);

    return null;
}

export function TRPCProvider({ children }: TRPCProviderProps): ReactNode {
    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <RuntimeEventStreamBootstrap />
                {isDev ? <NeonObservabilityStreamBootstrap /> : null}
                <WindowStateStreamBootstrap />
                {children}
            </QueryClientProvider>
        </trpc.Provider>
    );
}

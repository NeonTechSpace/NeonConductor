import { QueryClientProvider } from '@tanstack/react-query';
import { log } from 'evlog';
import { useEffect } from 'react';

import { queryClient, trpcClient } from '@/web/lib/providers/trpcCore';
import {
    isRuntimeEventRecord,
    isSubscriptionControlPayload,
    isWindowStateEvent,
    normalizeSubscriptionPayload,
} from '@/web/lib/providers/subscriptionPayloads';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { invalidateQueriesForRuntimeEvent } from '@/web/lib/runtime/runtimeEventInvalidation';
import { trpcClient as runtimeClient } from '@/web/lib/trpcClient';
import { useWindowStateStreamStore } from '@/web/lib/window/stateStream';
import { trpc } from '@/web/trpc/client';

import type { ReactNode } from 'react';

interface TRPCProviderProps {
    children: ReactNode;
}

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

export function TRPCProvider({ children }: TRPCProviderProps): ReactNode {
    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <RuntimeEventStreamBootstrap />
                <WindowStateStreamBootstrap />
                {children}
            </QueryClientProvider>
        </trpc.Provider>
    );
}

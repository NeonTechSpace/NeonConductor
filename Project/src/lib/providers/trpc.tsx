import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ipcLink } from 'electron-trpc-experimental/renderer';
import { useEffect } from 'react';

import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { trpcClient as runtimeClient } from '@/web/lib/trpcClient';
import { trpc } from '@/web/trpc/client';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

import type { ReactNode } from 'react';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60,
            retry: 1,
        },
    },
});

const trpcClient = trpc.createClient({
    links: [ipcLink()],
});

interface TRPCProviderProps {
    children: ReactNode;
}

function RuntimeEventStreamBootstrap(): ReactNode {
    const setConnecting = useRuntimeEventStreamStore((state) => state.setConnecting);
    const setError = useRuntimeEventStreamStore((state) => state.setError);
    const pushEvent = useRuntimeEventStreamStore((state) => state.pushEvent);

    useEffect(() => {
        setConnecting();
        const { lastSequence } = useRuntimeEventStreamStore.getState();

        const subscription = runtimeClient.runtime.subscribeEvents.subscribe(
            lastSequence > 0 ? { afterSequence: lastSequence } : {},
            {
                onData: (event) => {
                    pushEvent(event as RuntimeEventRecordV1);
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
    }, [setConnecting, setError, pushEvent]);

    return null;
}

export function TRPCProvider({ children }: TRPCProviderProps): ReactNode {
    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <RuntimeEventStreamBootstrap />
                {children}
            </QueryClientProvider>
        </trpc.Provider>
    );
}

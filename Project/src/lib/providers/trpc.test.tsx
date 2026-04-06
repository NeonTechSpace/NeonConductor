import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

interface SubscriptionHandlers {
    onData: (payload: unknown) => void;
    onError: (error: unknown) => void;
}

const streamBootstrapState = vi.hoisted(() => {
    const cleanupCallbacks: Array<() => void> = [];

    const runtimeSubscription = {
        unsubscribe: vi.fn(),
    };
    const windowStateSubscription = {
        unsubscribe: vi.fn(),
    };
    const observabilitySubscription = {
        unsubscribe: vi.fn(),
    };

    const runtimeStreamState = {
        connectionState: 'idle' as const,
        lastSequence: 12,
        lastError: null as string | null,
        events: [] as unknown[],
        setConnecting: vi.fn(),
        setLive: vi.fn(),
        setError: vi.fn(),
        pushEvent: vi.fn(),
    };
    const windowStateStreamState = {
        connectionState: 'idle' as const,
        lastSequence: 8,
        lastError: null as string | null,
        events: [] as unknown[],
        setConnecting: vi.fn(),
        setLive: vi.fn(),
        setError: vi.fn(),
        pushEvent: vi.fn(),
    };
    const observabilityStreamState = {
        connectionState: 'idle' as const,
        lastSequence: 3,
        lastError: null as string | null,
        events: [] as unknown[],
        setConnecting: vi.fn(),
        setLive: vi.fn(),
        setError: vi.fn(),
        pushEvent: vi.fn(),
    };

    const useEffectMock = vi.fn((effect: () => undefined | (() => void)) => {
        const cleanup = effect();
        if (typeof cleanup === 'function') {
            cleanupCallbacks.push(cleanup);
        }
    });

    const runtimeSubscribeEventsMock = vi.fn<
        (input: { afterSequence?: number }, handlers: SubscriptionHandlers) => typeof runtimeSubscription
    >(() => runtimeSubscription);
    const runtimeSubscribeWindowStateMock = vi.fn<
        (input: { afterSequence?: number }, handlers: SubscriptionHandlers) => typeof windowStateSubscription
    >(() => windowStateSubscription);
    const runtimeSubscribeObservabilityMock = vi.fn<
        (input: { afterSequence?: number }, handlers: SubscriptionHandlers) => typeof observabilitySubscription
    >(() => observabilitySubscription);
    const invalidateQueriesForRuntimeEventMock = vi.fn().mockResolvedValue(undefined);

    const runtimeClientMock = {
        runtime: {
            subscribeEvents: {
                subscribe: runtimeSubscribeEventsMock,
            },
            subscribeObservability: {
                subscribe: runtimeSubscribeObservabilityMock,
            },
        },
        system: {
            subscribeWindowState: {
                subscribe: runtimeSubscribeWindowStateMock,
            },
        },
    };

    const useRuntimeEventStreamStoreMock = Object.assign(
        (selector: (state: typeof runtimeStreamState) => unknown) => selector(runtimeStreamState),
        {
            getState: () => runtimeStreamState,
        }
    );
    const useWindowStateStreamStoreMock = Object.assign(
        (selector: (state: typeof windowStateStreamState) => unknown) => selector(windowStateStreamState),
        {
            getState: () => windowStateStreamState,
        }
    );
    const useNeonObservabilityStreamStoreMock = Object.assign(
        (selector: (state: typeof observabilityStreamState) => unknown) => selector(observabilityStreamState),
        {
            getState: () => observabilityStreamState,
        }
    );

    return {
        cleanupCallbacks,
        runtimeSubscription,
        windowStateSubscription,
        observabilitySubscription,
        runtimeStreamState,
        windowStateStreamState,
        observabilityStreamState,
        useEffectMock,
        runtimeSubscribeEventsMock,
        runtimeSubscribeWindowStateMock,
        runtimeSubscribeObservabilityMock,
        invalidateQueriesForRuntimeEventMock,
        runtimeClientMock,
        useRuntimeEventStreamStoreMock,
        useWindowStateStreamStoreMock,
        useNeonObservabilityStreamStoreMock,
    };
});

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useEffect: streamBootstrapState.useEffectMock,
    };
});

vi.mock('@tanstack/react-query', () => ({
    QueryClient: class QueryClientMock {
        readonly __brand = 'QueryClientMock';
    },
    QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        Provider: ({ children }: { children: ReactNode }) => children,
        useUtils: () => ({}),
    },
}));

vi.mock('@/web/lib/trpcClient', () => ({
    trpcClient: streamBootstrapState.runtimeClientMock,
}));

vi.mock('@/web/lib/runtime/eventStream', () => ({
    useRuntimeEventStreamStore: streamBootstrapState.useRuntimeEventStreamStoreMock,
}));

vi.mock('@/web/lib/window/stateStream', () => ({
    useWindowStateStreamStore: streamBootstrapState.useWindowStateStreamStoreMock,
}));

vi.mock('@/web/lib/observability/eventStream', () => ({
    useNeonObservabilityStreamStore: streamBootstrapState.useNeonObservabilityStreamStoreMock,
}));

vi.mock('@/web/lib/runtime/runtimeEventInvalidation', () => ({
    invalidateQueriesForRuntimeEvent: streamBootstrapState.invalidateQueriesForRuntimeEventMock,
}));

describe('TRPCProvider', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('DEV', true);
        vi.clearAllMocks();
        streamBootstrapState.cleanupCallbacks.splice(0);
        Object.assign(streamBootstrapState.runtimeStreamState, {
            connectionState: 'idle',
            lastSequence: 12,
            lastError: null,
            events: [],
        });
        Object.assign(streamBootstrapState.windowStateStreamState, {
            connectionState: 'idle',
            lastSequence: 8,
            lastError: null,
            events: [],
        });
        Object.assign(streamBootstrapState.observabilityStreamState, {
            connectionState: 'idle',
            lastSequence: 3,
            lastError: null,
            events: [],
        });
    });

    it('boots the runtime, window-state, and observability subscriptions through the provider seam', async () => {
        const { TRPCProvider } = await import('@/web/lib/providers/trpc');

        const html = renderToStaticMarkup(
            <TRPCProvider>
                <div>bootstrap child</div>
            </TRPCProvider>
        );

        expect(html).toContain('bootstrap child');
        expect(streamBootstrapState.runtimeSubscribeEventsMock).toHaveBeenCalledWith(
            { afterSequence: 12 },
            expect.any(Object)
        );
        expect(streamBootstrapState.runtimeSubscribeWindowStateMock).toHaveBeenCalledWith(
            { afterSequence: 8 },
            expect.any(Object)
        );
        expect(streamBootstrapState.runtimeSubscribeObservabilityMock).toHaveBeenCalledWith(
            { afterSequence: 3 },
            expect.any(Object)
        );

        const runtimeHandlers = streamBootstrapState.runtimeSubscribeEventsMock.mock.calls[0]?.[1];
        expect(runtimeHandlers).toBeDefined();
        if (!runtimeHandlers) {
            throw new Error('Expected the runtime stream subscription handlers to be registered.');
        }
        runtimeHandlers.onData({ type: 'started' });
        runtimeHandlers.onData({
            sequence: 17,
            eventId: 'evt_bootstrap',
            entityType: 'runtime',
            domain: 'runtime',
            operation: 'status',
            entityId: 'runtime',
            eventType: 'runtime.boot',
            payload: {},
            createdAt: '2026-04-06T00:00:00.000Z',
        });
        expect(streamBootstrapState.runtimeStreamState.setLive).toHaveBeenCalled();
        expect(streamBootstrapState.runtimeStreamState.pushEvent).toHaveBeenCalledWith(
            expect.objectContaining({ sequence: 17, eventId: 'evt_bootstrap' })
        );
        expect(streamBootstrapState.invalidateQueriesForRuntimeEventMock).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ sequence: 17, eventId: 'evt_bootstrap' })
        );

        const windowHandlers = streamBootstrapState.runtimeSubscribeWindowStateMock.mock.calls[0]?.[1];
        expect(windowHandlers).toBeDefined();
        if (!windowHandlers) {
            throw new Error('Expected the window-state stream subscription handlers to be registered.');
        }
        windowHandlers.onData({
            sequence: 21,
            state: {
                isMaximized: false,
                isFullScreen: false,
                canMaximize: true,
                canMinimize: true,
                platform: 'win32',
            },
        });
        expect(streamBootstrapState.windowStateStreamState.pushEvent).toHaveBeenCalledWith(
            expect.objectContaining({ sequence: 21 })
        );

        const observabilityHandlers = streamBootstrapState.runtimeSubscribeObservabilityMock.mock.calls[0]?.[1];
        expect(observabilityHandlers).toBeDefined();
        if (!observabilityHandlers) {
            throw new Error('Expected the observability stream subscription handlers to be registered.');
        }
        observabilityHandlers.onData({
            sequence: 9,
            at: '2026-04-06T00:00:00.000Z',
            kind: 'run_started',
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            providerId: 'openai',
            modelId: 'gpt-test',
            source: 'runtime.run_execution',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(streamBootstrapState.observabilityStreamState.pushEvent).toHaveBeenCalledWith(
            expect.objectContaining({ sequence: 9, kind: 'run_started' })
        );

        for (const cleanup of streamBootstrapState.cleanupCallbacks.splice(0)) {
            cleanup();
        }

        expect(streamBootstrapState.runtimeSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(streamBootstrapState.windowStateSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(streamBootstrapState.observabilitySubscription.unsubscribe).toHaveBeenCalledTimes(1);
    });
});

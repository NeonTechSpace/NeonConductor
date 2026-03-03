import { create } from 'zustand';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

export type RuntimeStreamConnectionState = 'idle' | 'connecting' | 'live' | 'error';

interface RuntimeEventStreamState {
    connectionState: RuntimeStreamConnectionState;
    lastSequence: number;
    lastError: string | null;
    events: RuntimeEventRecordV1[];
    setConnecting: () => void;
    setLive: () => void;
    setError: (message: string) => void;
    pushEvent: (event: RuntimeEventRecordV1) => void;
}

const MAX_BUFFERED_EVENTS = 200;

export const useRuntimeEventStreamStore = create<RuntimeEventStreamState>((set) => ({
    connectionState: 'idle',
    lastSequence: 0,
    lastError: null,
    events: [],
    setConnecting: () => {
        set({
            connectionState: 'connecting',
            lastError: null,
        });
    },
    setLive: () => {
        set({
            connectionState: 'live',
            lastError: null,
        });
    },
    setError: (message) => {
        set({
            connectionState: 'error',
            lastError: message,
        });
    },
    pushEvent: (event) => {
        set((state) => ({
            connectionState: 'live',
            lastSequence: Math.max(state.lastSequence, event.sequence),
            lastError: null,
            events: [...state.events, event].slice(-MAX_BUFFERED_EVENTS),
        }));
    },
}));

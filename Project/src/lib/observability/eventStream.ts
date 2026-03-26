import { create } from 'zustand';

import type { NeonObservabilityEvent } from '@/shared/contracts';

export type NeonObservabilityConnectionState = 'idle' | 'connecting' | 'live' | 'error';

interface NeonObservabilityStreamState {
    connectionState: NeonObservabilityConnectionState;
    lastSequence: number;
    lastError: string | null;
    events: NeonObservabilityEvent[];
    setConnecting: () => void;
    setLive: () => void;
    setError: (message: string) => void;
    pushEvent: (event: NeonObservabilityEvent) => void;
    reset: () => void;
}

const MAX_BUFFERED_EVENTS = 400;

export const useNeonObservabilityStreamStore = create<NeonObservabilityStreamState>((set) => ({
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
    reset: () => {
        set({
            connectionState: 'idle',
            lastSequence: 0,
            lastError: null,
            events: [],
        });
    },
}));

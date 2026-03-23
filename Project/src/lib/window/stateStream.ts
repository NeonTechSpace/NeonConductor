import { create } from 'zustand';

import type { WindowState, WindowStateEvent } from '@/app/backend/trpc/routers/system/windowControls';

export type WindowStateConnection = 'idle' | 'connecting' | 'live' | 'error';

interface WindowStateStreamStore {
    connectionState: WindowStateConnection;
    lastError: string | null;
    lastSequence: number;
    windowState: WindowState;
    setConnecting: () => void;
    setLive: () => void;
    setError: (message: string) => void;
    pushEvent: (event: WindowStateEvent) => void;
}

const DEFAULT_WINDOW_STATE: WindowState = {
    isMaximized: false,
    isFullScreen: false,
    canMaximize: true,
    canMinimize: true,
    platform: 'win32',
};

export const useWindowStateStreamStore = create<WindowStateStreamStore>((set) => ({
    connectionState: 'idle',
    lastError: null,
    lastSequence: 0,
    windowState: DEFAULT_WINDOW_STATE,
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
            lastError: null,
            lastSequence: Math.max(state.lastSequence, event.sequence),
            windowState: event.state,
        }));
    },
}));

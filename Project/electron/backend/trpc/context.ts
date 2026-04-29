/**
 * tRPC request context factory.
 * Provides per-request data (e.g., sender ID, window reference) to all procedures.
 */

import { randomUUID } from 'node:crypto';

import { BrowserWindow, type BrowserWindowType } from '@/app/main/runtime/electronApi';

import type { CreateContextOptions } from 'electron-trpc-experimental/main';

export interface Context {
    // Identifies which renderer window sent the request (for multi-window apps)
    senderId: number;

    // Reference to the BrowserWindow that sent the request
    win: BrowserWindowType | null;

    // Unique ID for this request.
    requestId: string;

    // Correlation ID propagated across nested service calls.
    correlationId: string;
}

export function createContext(opts: CreateContextOptions): Promise<Context> {
    const requestId = randomUUID();
    return Promise.resolve({
        senderId: opts.event.sender.id,
        win: BrowserWindow.fromWebContents(opts.event.sender),
        requestId,
        correlationId: requestId,
    });
}

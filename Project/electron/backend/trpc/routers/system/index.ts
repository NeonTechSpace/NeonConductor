/**
 * System router for application-level operations.
 * Handles window management and other system tasks.
 */
import { shell } from 'electron';

import { windowStateSubscriptionInputSchema } from '@/app/backend/runtime/contracts';
import { readObject, readString } from '@/app/backend/runtime/contracts/parsers/helpers';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { bootStatusInputSchema, reportBootStatus } from '@/app/backend/trpc/routers/system/reportBootStatus';
import { signalReady } from '@/app/backend/trpc/routers/system/signalReady';
import {
    closeWindow,
    getWindowState,
    listWindowStateEvents,
    minimizeWindow,
    subscribeWindowState,
    toggleMaximizeWindow,
} from '@/app/backend/trpc/routers/system/windowControls';
import type { WindowStateEvent } from '@/app/backend/trpc/routers/system/windowControls';
import { isSafeExternalUrl } from '@/app/main/security/urlPolicy';

function waitForNextWindowStateEvent(cursor: number, signal: AbortSignal): Promise<WindowStateEvent | null> {
    return new Promise((resolve) => {
        const unsubscribe = subscribeWindowState((event) => {
            if (event.sequence <= cursor) {
                return;
            }

            cleanup();
            resolve(event);
        });

        const onAbort = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            unsubscribe();
            signal.removeEventListener('abort', onAbort);
        };

        signal.addEventListener('abort', onAbort, { once: true });
    });
}

export const systemRouter = router({
    // Called by renderer when React has rendered, to show the window
    signalReady: publicProcedure.mutation(({ ctx }) => signalReady(ctx.win)),
    reportBootStatus: publicProcedure
        .input(bootStatusInputSchema)
        .mutation(({ ctx, input }) => reportBootStatus(ctx.win, input)),
    // Custom title bar controls via existing tRPC IPC channel
    getWindowState: publicProcedure.query(({ ctx }) => getWindowState(ctx.win)),
    subscribeWindowState: publicProcedure.input(windowStateSubscriptionInputSchema).subscription(async function* ({
        input,
        signal,
    }) {
        if (!signal) {
            return;
        }
        let cursor = input.afterSequence ?? 0;
        try {
            const replayEvents = listWindowStateEvents(cursor);
            for (const event of replayEvents) {
                if (signal.aborted) {
                    return;
                }

                cursor = Math.max(cursor, event.sequence);
                yield event;
            }

            while (!signal.aborted) {
                const nextEvent = await waitForNextWindowStateEvent(cursor, signal);
                if (!nextEvent) {
                    break;
                }

                cursor = Math.max(cursor, nextEvent.sequence);
                yield nextEvent;
            }
        } catch (error) {
            throw error instanceof Error ? error : new Error('Window state subscription failed.');
        }
    }),
    minimizeWindow: publicProcedure.mutation(({ ctx }) => minimizeWindow(ctx.win)),
    toggleMaximizeWindow: publicProcedure.mutation(({ ctx }) => toggleMaximizeWindow(ctx.win)),
    closeWindow: publicProcedure.mutation(({ ctx }) => closeWindow(ctx.win)),
    openPath: publicProcedure
        .input({
            parse: (input) => {
                const source = readObject(input, 'input');
                return {
                    path: readString(source.path, 'path'),
                };
            },
        })
        .mutation(async ({ input }) => {
            const result = await shell.openPath(input.path);
            return {
                opened: result.length === 0,
                ...(result.length > 0 ? { message: result } : {}),
            };
        }),
    openExternalUrl: publicProcedure
        .input({
            parse: (input) => {
                const source = readObject(input, 'input');
                return {
                    url: readString(source.url, 'url'),
                };
            },
        })
        .mutation(async ({ input }) => {
            if (!isSafeExternalUrl(input.url)) {
                return {
                    opened: false as const,
                    reason: 'unsafe_url' as const,
                };
            }

            await shell.openExternal(input.url);
            return {
                opened: true as const,
            };
        }),
});

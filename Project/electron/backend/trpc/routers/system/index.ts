/**
 * System router for application-level operations.
 * Handles window management and other system tasks.
 */

import { observable } from '@trpc/server/observable';
import { shell } from 'electron';

import { windowStateSubscriptionInputSchema } from '@/app/backend/runtime/contracts';
import { readObject, readString } from '@/app/backend/runtime/contracts/parsers/helpers';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { isSafeExternalUrl } from '@/app/main/security/urlPolicy';
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
    subscribeWindowState: publicProcedure.input(windowStateSubscriptionInputSchema).subscription(({ input, signal }) =>
        observable<WindowStateEvent>((emit) => {
            let active = true;
            let unsubscribeAbort: (() => void) | null = null;

            const run = async () => {
                let cursor = input.afterSequence ?? 0;
                try {
                    const replayEvents = listWindowStateEvents(cursor);
                    for (const event of replayEvents) {
                        if (!active || signal?.aborted) {
                            return;
                        }

                        cursor = Math.max(cursor, event.sequence);
                        emit.next(event);
                    }

                    if (!signal) {
                        return;
                    }

                    const onAbort = () => {
                        active = false;
                        emit.complete();
                    };
                    signal.addEventListener('abort', onAbort, { once: true });
                    unsubscribeAbort = () => {
                        signal.removeEventListener('abort', onAbort);
                    };

                    while (active && !signal.aborted) {
                        const nextEvent = await waitForNextWindowStateEvent(cursor, signal);
                        if (!active || !nextEvent) {
                            break;
                        }

                        cursor = Math.max(cursor, nextEvent.sequence);
                        emit.next(nextEvent);
                    }
                } catch (error) {
                    emit.error(error instanceof Error ? error : new Error('Window state subscription failed.'));
                    return;
                }

                emit.complete();
            };

            void run();

            return () => {
                active = false;
                unsubscribeAbort?.();
            };
        })
    ),
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
                throw new Error(`Blocked external URL: ${input.url}`);
            }

            await shell.openExternal(input.url);
            return {
                opened: true,
            };
        }),
});

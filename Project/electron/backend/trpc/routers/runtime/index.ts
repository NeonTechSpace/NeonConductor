import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import { runtimeEventsSubscriptionInputSchema, runtimeResetInputSchema } from '@/app/backend/runtime/contracts';
import { runtimeEventBus } from '@/app/backend/runtime/services/runtimeEventBus';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { runtimeResetService } from '@/app/backend/runtime/services/runtimeReset';
import { runtimeSnapshotService } from '@/app/backend/runtime/services/runtimeSnapshot';
import { publicProcedure, router } from '@/app/backend/trpc/init';

function waitForNextRuntimeEvent(cursor: number, signal: AbortSignal): Promise<RuntimeEventRecordV1 | null> {
    return new Promise((resolve) => {
        const unsubscribe = runtimeEventBus.subscribe((event) => {
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

export const runtimeRouter = router({
    getSnapshot: publicProcedure.query(async () => {
        return runtimeSnapshotService.getSnapshot();
    }),
    subscribeEvents: publicProcedure.input(runtimeEventsSubscriptionInputSchema).subscription(async function* ({
        input,
        signal,
    }) {
        let cursor = input.afterSequence ?? 0;
        const replayEvents = await runtimeEventLogService.getEvents(cursor, 500);
        for (const event of replayEvents) {
            if (signal?.aborted) {
                return;
            }

            cursor = Math.max(cursor, event.sequence);
            yield event;
        }

        if (!signal) {
            return;
        }

        while (!signal.aborted) {
            const nextEvent = await waitForNextRuntimeEvent(cursor, signal);
            if (!nextEvent) {
                return;
            }

            cursor = Math.max(cursor, nextEvent.sequence);
            yield nextEvent;
        }
    }),
    reset: publicProcedure.input(runtimeResetInputSchema).mutation(async ({ input }) => {
        const result = await runtimeResetService.reset(input);

        if (result.applied) {
            await runtimeEventLogService.append({
                entityType: 'runtime',
                entityId: 'runtime',
                eventType: 'runtime.reset.applied',
                payload: {
                    target: result.target,
                    counts: result.counts,
                    dryRun: result.dryRun,
                    profileId: input.profileId ?? null,
                    workspaceFingerprint: input.workspaceFingerprint ?? null,
                },
            });
        }

        return result;
    }),
});

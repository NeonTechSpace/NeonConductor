import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import {
    profileInputSchema,
    runtimeFactoryResetInputSchema,
    runtimeEventsSubscriptionInputSchema,
    runtimeResetInputSchema,
} from '@/app/backend/runtime/contracts';
import { runtimeEventBus } from '@/app/backend/runtime/services/runtimeEventBus';
import { runtimeResetEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { runtimeFactoryResetService } from '@/app/backend/runtime/services/runtimeFactoryReset';
import { runtimeResetService } from '@/app/backend/runtime/services/runtimeReset';
import { runtimeShellBootstrapService } from '@/app/backend/runtime/services/runtimeShellBootstrap';
import { runtimeSnapshotService } from '@/app/backend/runtime/services/runtimeSnapshot';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, toTrpcError } from '@/app/backend/trpc/trpcErrorMap';

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
    // Diagnostic-only whole-runtime inspection. Normal app rendering should use scoped reads.
    getDiagnosticSnapshot: publicProcedure.input(profileInputSchema).query(async ({ input }) => {
        return (await runtimeSnapshotService.getSnapshot(input.profileId)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
    }),
    getShellBootstrap: publicProcedure.input(profileInputSchema).query(async ({ input }) => {
        return runtimeShellBootstrapService.getShellBootstrap(input.profileId);
    }),
    listWorkspaceRoots: publicProcedure.input(profileInputSchema).query(async ({ input }) => {
        const shellBootstrap = await runtimeShellBootstrapService.getShellBootstrap(input.profileId);
        return {
            workspaceRoots: shellBootstrap.workspaceRoots,
        };
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
    factoryReset: publicProcedure.input(runtimeFactoryResetInputSchema).mutation(async ({ input }) => {
        const factoryResetResult = (await runtimeFactoryResetService.reset(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        await runtimeEventLogService.append(
            runtimeResetEvent({
                entityType: 'runtime',
                domain: 'runtime',
                entityId: 'runtime',
                eventType: 'runtime.reset.applied',
                payload: {
                    target: 'full',
                    counts: factoryResetResult.counts,
                    dryRun: false,
                    profileId: factoryResetResult.resetProfileId,
                    workspaceFingerprint: null,
                },
            })
        );

        return factoryResetResult;
    }),
    reset: publicProcedure.input(runtimeResetInputSchema).mutation(async ({ input }) => {
        const resetResult = (await runtimeResetService.reset(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );

        if (resetResult.applied) {
            await runtimeEventLogService.append(
                runtimeResetEvent({
                entityType: 'runtime',
                domain: 'runtime',
                entityId: 'runtime',
                eventType: 'runtime.reset.applied',
                payload: {
                    target: resetResult.target,
                    counts: resetResult.counts,
                    dryRun: resetResult.dryRun,
                    profileId: input.profileId ?? null,
                    workspaceFingerprint: input.workspaceFingerprint ?? null,
                },
                })
            );
        }

        return resetResult;
    }),
});

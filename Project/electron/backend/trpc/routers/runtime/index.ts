import { observable } from '@trpc/server/observable';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import { workspaceRootStore } from '@/app/backend/persistence/stores';
import {
    profileInputSchema,
    runtimeFactoryResetInputSchema,
    runtimeEventsSubscriptionInputSchema,
    runtimeRegisterWorkspaceRootInputSchema,
    runtimeResetInputSchema,
    runtimeSetWorkspacePreferenceInputSchema,
} from '@/app/backend/runtime/contracts';
import { runtimeEventBus } from '@/app/backend/runtime/services/runtimeEventBus';
import { runtimeResetEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { runtimeFactoryResetService } from '@/app/backend/runtime/services/runtimeFactoryReset';
import { runtimeResetService } from '@/app/backend/runtime/services/runtimeReset';
import { runtimeShellBootstrapService } from '@/app/backend/runtime/services/runtimeShellBootstrap';
import { runtimeSnapshotService } from '@/app/backend/runtime/services/runtimeSnapshot';
import { setWorkspacePreference } from '@/app/backend/runtime/services/workspace/preferences';
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
    registerWorkspaceRoot: publicProcedure.input(runtimeRegisterWorkspaceRootInputSchema).mutation(async ({ input }) => {
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(
            input.profileId,
            input.absolutePath,
            input.label
        );

        return {
            workspaceRoot,
        };
    }),
    setWorkspacePreference: publicProcedure.input(runtimeSetWorkspacePreferenceInputSchema).mutation(async ({ input }) => {
        const workspacePreference = await setWorkspacePreference(input);
        return {
            workspacePreference,
        };
    }),
    subscribeEvents: publicProcedure.input(runtimeEventsSubscriptionInputSchema).subscription(({ input, signal }) =>
        observable<RuntimeEventRecordV1>((emit) => {
            let active = true;
            let unsubscribeAbort: (() => void) | null = null;

            const run = async () => {
                let cursor = input.afterSequence ?? 0;
                try {
                    const replayEvents = await runtimeEventLogService.getEvents(cursor, 500);
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
                        const nextEvent = await waitForNextRuntimeEvent(cursor, signal);
                        if (!active || !nextEvent) {
                            break;
                        }

                        cursor = Math.max(cursor, nextEvent.sequence);
                        emit.next(nextEvent);
                    }
                } catch (error) {
                    emit.error(error instanceof Error ? error : new Error('Runtime event subscription failed.'));
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

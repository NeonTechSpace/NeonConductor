import { workspaceRootStore } from '@/app/backend/persistence/stores';
import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import {
    neonObservabilitySubscriptionInputSchema,
    runtimeInspectWorkspaceEnvironmentInputSchema,
    type NeonObservabilitySubscriptionInput,
    type NeonObservabilityEvent,
    profileInputSchema,
    runtimeFactoryResetInputSchema,
    type RuntimeInspectWorkspaceEnvironmentInput,
    runtimeEventsSubscriptionInputSchema,
    runtimeRegisterWorkspaceRootInputSchema,
    runtimeResetInputSchema,
    runtimeSetWorkspacePreferenceInputSchema,
} from '@/app/backend/runtime/contracts';
import {
    workspaceEnvironmentService,
} from '@/app/backend/runtime/services/environment/service';
import { resolveWorkspaceEnvironmentInspectionTarget } from '@/app/backend/runtime/services/environment/workspaceEnvironmentInspectionResolver';
import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';
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

function waitForNextNeonObservabilityEvent(
    cursor: number,
    filter: Pick<NeonObservabilitySubscriptionInput, 'profileId' | 'sessionId' | 'runId'>,
    signal: AbortSignal
): Promise<NeonObservabilityEvent | null> {
    return new Promise((resolve) => {
        const unsubscribe = neonObservabilityService.subscribe((event) => {
            if (event.sequence <= cursor) {
                return;
            }

            cleanup();
            resolve(event);
        }, filter);

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

async function inspectWorkspaceEnvironment(input: RuntimeInspectWorkspaceEnvironmentInput) {
    const workspaceRoots = await workspaceRootStore.listByProfile(input.profileId);
    const inspectionTargetResult = await resolveWorkspaceEnvironmentInspectionTarget({
        request: input,
        workspaceRoots,
    });
    const inspectionTarget = inspectionTargetResult.match(
        (value) => value,
        (error) => raiseMappedTrpcError(error, toTrpcError)
    );

    const inspectionResult = await workspaceEnvironmentService.inspectWorkspaceEnvironment({
        workspaceRootPath: inspectionTarget.workspaceRootPath,
        ...(inspectionTarget.overrides ? { overrides: inspectionTarget.overrides } : {}),
    });

    return inspectionResult.match(
        (snapshot) => ({
            snapshot,
        }),
        (error) => raiseMappedTrpcError(error, toTrpcError)
    );
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
    inspectWorkspaceEnvironment: publicProcedure
        .input(runtimeInspectWorkspaceEnvironmentInputSchema)
        .query(async ({ input }) => {
            return await inspectWorkspaceEnvironment(input);
        }),
    listWorkspaceRoots: publicProcedure.input(profileInputSchema).query(async ({ input }) => {
        const shellBootstrap = await runtimeShellBootstrapService.getShellBootstrap(input.profileId);
        return {
            workspaceRoots: shellBootstrap.workspaceRoots,
        };
    }),
    registerWorkspaceRoot: publicProcedure
        .input(runtimeRegisterWorkspaceRootInputSchema)
        .mutation(async ({ input }) => {
            const workspaceRoot = await workspaceRootStore.resolveOrCreate(
                input.profileId,
                input.absolutePath,
                input.label
            );

            return {
                workspaceRoot,
            };
        }),
    setWorkspacePreference: publicProcedure
        .input(runtimeSetWorkspacePreferenceInputSchema)
        .mutation(async ({ input }) => {
            const workspacePreference = (await setWorkspacePreference(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            );
            return {
                workspacePreference,
            };
        }),
    subscribeEvents: publicProcedure.input(runtimeEventsSubscriptionInputSchema).subscription(async function* ({
        input,
        signal,
    }) {
        if (!signal) {
            return;
        }
        let cursor = input.afterSequence ?? 0;
        try {
            const replayEvents = await runtimeEventLogService.getEvents(cursor, 500);
            for (const event of replayEvents) {
                if (signal.aborted) {
                    return;
                }

                cursor = Math.max(cursor, event.sequence);
                yield event;
            }

            while (!signal.aborted) {
                const nextEvent = await waitForNextRuntimeEvent(cursor, signal);
                if (!nextEvent) {
                    break;
                }

                cursor = Math.max(cursor, nextEvent.sequence);
                yield nextEvent;
            }
        } catch (error) {
            throw error instanceof Error ? error : new Error('Runtime event subscription failed.');
        }
    }),
    subscribeObservability: publicProcedure
        .input(neonObservabilitySubscriptionInputSchema)
        .subscription(async function* ({ input, signal }) {
            if (!signal) {
                return;
            }
            if (!neonObservabilityService.isEnabled()) {
                return;
            }

            let cursor = input.afterSequence ?? 0;
            try {
                const replayEvents = neonObservabilityService.list(input, 500);
                for (const event of replayEvents) {
                    if (signal.aborted) {
                        return;
                    }

                    cursor = Math.max(cursor, event.sequence);
                    yield event;
                }

                const filter: Pick<NeonObservabilitySubscriptionInput, 'profileId' | 'sessionId' | 'runId'> = {};
                if (input.profileId) {
                    filter.profileId = input.profileId;
                }
                if (input.sessionId) {
                    filter.sessionId = input.sessionId;
                }
                if (input.runId) {
                    filter.runId = input.runId;
                }

                while (!signal.aborted) {
                    const nextEvent = await waitForNextNeonObservabilityEvent(cursor, filter, signal);
                    if (!nextEvent) {
                        break;
                    }

                    cursor = Math.max(cursor, nextEvent.sequence);
                    yield nextEvent;
                }
            } catch (error) {
                throw error instanceof Error ? error : new Error('Neon observability subscription failed.');
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

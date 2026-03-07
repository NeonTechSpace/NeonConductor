import { checkpointCreateInputSchema, checkpointListInputSchema, checkpointRollbackInputSchema } from '@/app/backend/runtime/contracts';
import { createCheckpoint, listCheckpoints, rollbackCheckpoint } from '@/app/backend/runtime/services/checkpoint/service';
import { runtimeStatusEvent, runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const checkpointRouter = router({
    create: publicProcedure.input(checkpointCreateInputSchema).mutation(async ({ input, ctx }) => {
        const result = await createCheckpoint(input);
        if (result.checkpoint) {
            await runtimeEventLogService.append(
                runtimeUpsertEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: result.checkpoint.id,
                    eventType: 'checkpoint.created',
                    payload: {
                        profileId: input.profileId,
                        runId: input.runId,
                        checkpoint: result.checkpoint,
                        diff: result.diff ?? null,
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                    },
                })
            );
        }

        return result;
    }),
    list: publicProcedure.input(checkpointListInputSchema).query(async ({ input }) => {
        return listCheckpoints(input);
    }),
    rollback: publicProcedure.input(checkpointRollbackInputSchema).mutation(async ({ input, ctx }) => {
        const result = await rollbackCheckpoint(input);
        if (result.rolledBack && result.checkpoint) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: result.checkpoint.id,
                    eventType: 'checkpoint.rolled_back',
                    payload: {
                        profileId: input.profileId,
                        checkpointId: result.checkpoint.id,
                        sessionId: result.checkpoint.sessionId,
                        runId: result.checkpoint.runId,
                        topLevelTab: result.checkpoint.topLevelTab,
                        modeKey: result.checkpoint.modeKey,
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                    },
                })
            );
        }

        return result;
    }),
});

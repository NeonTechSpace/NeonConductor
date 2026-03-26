import {
    checkpointCleanupApplyInputSchema,
    checkpointCleanupPreviewInputSchema,
    checkpointCreateInputSchema,
    checkpointDeleteMilestoneInputSchema,
    checkpointForceCompactInputSchema,
    checkpointListInputSchema,
    checkpointPromoteMilestoneInputSchema,
    checkpointRenameMilestoneInputSchema,
    checkpointRevertChangesetInputSchema,
    checkpointRollbackInputSchema,
    checkpointRollbackPreviewInputSchema,
} from '@/app/backend/runtime/contracts';
import {
    applyCheckpointCleanup,
    createCheckpoint,
    deleteCheckpointMilestone,
    forceCompactCheckpointStorage,
    getRollbackPreview,
    listCheckpoints,
    previewCheckpointCleanup,
    promoteCheckpointToMilestone,
    renameCheckpointMilestone,
    revertCheckpointChangeset,
    rollbackCheckpoint,
} from '@/app/backend/runtime/services/checkpoint/service';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const checkpointRouter = router({
    create: publicProcedure.input(checkpointCreateInputSchema).mutation(async ({ input, ctx }) => {
        const result = await createCheckpoint(input);
        if (result.checkpoint) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: result.checkpoint.id,
                    eventType: 'checkpoint.milestone_saved',
                    payload: {
                        profileId: input.profileId,
                        sessionId: result.checkpoint.sessionId,
                        runId: input.runId,
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
    promoteToMilestone: publicProcedure
        .input(checkpointPromoteMilestoneInputSchema)
        .mutation(async ({ input, ctx }) => {
            const result = await promoteCheckpointToMilestone(input);
            if (result.checkpoint) {
                await runtimeEventLogService.append(
                    runtimeStatusEvent({
                        entityType: 'checkpoint',
                        domain: 'checkpoint',
                        entityId: result.checkpoint.id,
                        eventType: 'checkpoint.milestone_promoted',
                        payload: {
                            profileId: input.profileId,
                            sessionId: result.checkpoint.sessionId,
                            checkpointId: result.checkpoint.id,
                            requestId: ctx.requestId,
                            correlationId: ctx.correlationId,
                        },
                    })
                );
            }

            return result;
        }),
    renameMilestone: publicProcedure.input(checkpointRenameMilestoneInputSchema).mutation(async ({ input, ctx }) => {
        const result = await renameCheckpointMilestone(input);
        if (result.checkpoint) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: result.checkpoint.id,
                    eventType: 'checkpoint.milestone_renamed',
                    payload: {
                        profileId: input.profileId,
                        sessionId: result.checkpoint.sessionId,
                        checkpointId: result.checkpoint.id,
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                    },
                })
            );
        }

        return result;
    }),
    deleteMilestone: publicProcedure.input(checkpointDeleteMilestoneInputSchema).mutation(async ({ input, ctx }) => {
        const result = await deleteCheckpointMilestone(input);
        if (result.deleted && result.checkpoint) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: input.checkpointId,
                    eventType: 'checkpoint.milestone_deleted',
                    payload: {
                        profileId: input.profileId,
                        sessionId: result.checkpoint.sessionId,
                        checkpointId: input.checkpointId,
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                    },
                })
            );
        }

        return result;
    }),
    previewCleanup: publicProcedure.input(checkpointCleanupPreviewInputSchema).query(async ({ input }) => {
        return previewCheckpointCleanup(input);
    }),
    applyCleanup: publicProcedure.input(checkpointCleanupApplyInputSchema).mutation(async ({ input, ctx }) => {
        const result = await applyCheckpointCleanup(input);
        if (result.cleanedUp) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: input.sessionId,
                    eventType: 'checkpoint.cleanup_applied',
                    payload: {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        deletedCheckpointIds: result.deletedCheckpointIds ?? [],
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                    },
                })
            );
        }

        return result;
    }),
    forceCompact: publicProcedure.input(checkpointForceCompactInputSchema).mutation(async ({ input, ctx }) => {
        const result = await forceCompactCheckpointStorage(input);
        if (result.run) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: result.run.id,
                    eventType: 'checkpoint.compaction_completed',
                    payload: {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        compactionRunId: result.run.id,
                        status: result.run.status,
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                    },
                })
            );
        }

        return result;
    }),
    previewRollback: publicProcedure.input(checkpointRollbackPreviewInputSchema).query(async ({ input }) => {
        return getRollbackPreview(input);
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
                        runId: result.checkpoint.runId ?? null,
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
    revertChangeset: publicProcedure.input(checkpointRevertChangesetInputSchema).mutation(async ({ input, ctx }) => {
        const result = await revertCheckpointChangeset(input);
        if (result.reverted && result.checkpoint && result.revertChangeset) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: result.checkpoint.id,
                    eventType: 'checkpoint.changeset_reverted',
                    payload: {
                        profileId: input.profileId,
                        checkpointId: result.checkpoint.id,
                        changesetId: result.changeset?.id ?? null,
                        revertChangesetId: result.revertChangeset.id,
                        sessionId: result.checkpoint.sessionId,
                        runId: result.checkpoint.runId ?? null,
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

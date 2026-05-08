import {
    orchestratorLazyCheckpointResolutionInputSchema,
    orchestratorLazyStartInputSchema,
    orchestratorRunByIdInputSchema,
    orchestratorRunBySessionInputSchema,
    orchestratorStartInputSchema,
} from '@/app/backend/runtime/contracts';
import { orchestratorExecutionService } from '@/app/backend/runtime/services/orchestrator/executionService';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { toOrchestratorTrpcError } from '@/app/backend/trpc/routers/orchestrator/errors';
import { unwrapResultOrThrow } from '@/app/backend/trpc/trpcErrorMap';

export const orchestratorRouter = router({
    start: publicProcedure.input(orchestratorStartInputSchema).mutation(async ({ input }) => {
        const result = await orchestratorExecutionService.start(input);
        return unwrapResultOrThrow(result, toOrchestratorTrpcError);
    }),
    startLazy: publicProcedure.input(orchestratorLazyStartInputSchema).mutation(async ({ input }) => {
        const result = await orchestratorExecutionService.startLazy(input);
        return unwrapResultOrThrow(result, toOrchestratorTrpcError);
    }),
    resolveLazyCheckpoint: publicProcedure
        .input(orchestratorLazyCheckpointResolutionInputSchema)
        .mutation(async ({ input }) => {
            return orchestratorExecutionService.resolveLazyCheckpoint(input);
        }),
    status: publicProcedure.input(orchestratorRunByIdInputSchema).query(async ({ input }) => {
        return orchestratorExecutionService.getStatus(input.profileId, input.orchestratorRunId);
    }),
    latestBySession: publicProcedure.input(orchestratorRunBySessionInputSchema).query(async ({ input }) => {
        return orchestratorExecutionService.getLatestBySession(input.profileId, input.sessionId);
    }),
    abort: publicProcedure.input(orchestratorRunByIdInputSchema).mutation(async ({ input }) => {
        return orchestratorExecutionService.abort(input.profileId, input.orchestratorRunId);
    }),
});

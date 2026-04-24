import {
    applyMemoryEditProposalInputSchema,
    memoryApplyPromotionInputSchema,
    memoryApplyReviewActionInputSchema,
    memoryCreateInputSchema,
    memoryDisableInputSchema,
    memoryListInputSchema,
    memoryPreparePromotionInputSchema,
    memoryProjectionContextInputSchema,
    memoryReviewDetailsInputSchema,
    memorySupersedeInputSchema,
} from '@/app/backend/runtime/contracts';
import { memoryProjectionService } from '@/app/backend/runtime/services/memory/projection';
import { memoryService } from '@/app/backend/runtime/services/memory/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { toTrpcError, unwrapResultOrThrow } from '@/app/backend/trpc/trpcErrorMap';

export const memoryRouter = router({
    list: publicProcedure.input(memoryListInputSchema).query(async ({ input }) => {
        return {
            memories: await memoryService.listMemories(input),
        };
    }),
    projectionStatus: publicProcedure.input(memoryProjectionContextInputSchema).query(async ({ input }) => {
        const result = await memoryProjectionService.listProjectionStatus(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    syncProjection: publicProcedure.input(memoryProjectionContextInputSchema).mutation(async ({ input }) => {
        const result = await memoryProjectionService.syncProjection(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    scanProjectionEdits: publicProcedure.input(memoryProjectionContextInputSchema).query(async ({ input }) => {
        const result = await memoryProjectionService.scanProjectionEdits(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    preparePromotion: publicProcedure.input(memoryPreparePromotionInputSchema).mutation(async ({ input }) => {
        const result = await memoryService.preparePromotion(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    applyPromotion: publicProcedure.input(memoryApplyPromotionInputSchema).mutation(async ({ input }) => {
        const result = await memoryService.applyPromotion(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    getReviewDetails: publicProcedure.input(memoryReviewDetailsInputSchema).query(async ({ input }) => {
        const result = await memoryService.getReviewDetails(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    applyReviewAction: publicProcedure.input(memoryApplyReviewActionInputSchema).mutation(async ({ input }) => {
        const result = await memoryService.applyReviewAction(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    applyProjectionEdit: publicProcedure.input(applyMemoryEditProposalInputSchema).mutation(async ({ input }) => {
        const result = await memoryProjectionService.applyProjectionEditProposal(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    create: publicProcedure.input(memoryCreateInputSchema).mutation(async ({ input }) => {
        const result = await memoryService.createMemory(input);
        return {
            memory: unwrapResultOrThrow(result, toTrpcError),
        };
    }),
    disable: publicProcedure.input(memoryDisableInputSchema).mutation(async ({ input }) => {
        const result = await memoryService.disableMemory(input);
        return {
            memory: unwrapResultOrThrow(result, toTrpcError),
        };
    }),
    supersede: publicProcedure.input(memorySupersedeInputSchema).mutation(async ({ input }) => {
        const result = await memoryService.supersedeMemory(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
});

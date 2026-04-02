import {
    planAnswerQuestionInputSchema,
    planApproveInputSchema,
    planGenerateDraftInputSchema,
    planGetActiveInputSchema,
    planGetInputSchema,
    planImplementInputSchema,
    planReviseInputSchema,
    planStartInputSchema,
} from '@/app/backend/runtime/contracts';
import { planService } from '@/app/backend/runtime/services/plan/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { toPlanTrpcError } from '@/app/backend/trpc/routers/plan/errors';
import { unwrapResultOrThrow } from '@/app/backend/trpc/trpcErrorMap';

export const planRouter = router({
    start: publicProcedure.input(planStartInputSchema).mutation(async ({ input }) => {
        const result = await planService.start(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    get: publicProcedure.input(planGetInputSchema).query(async ({ input }) => {
        return planService.getById(input.profileId, input.planId);
    }),
    getActive: publicProcedure.input(planGetActiveInputSchema).query(async ({ input }) => {
        return planService.getActiveBySession(input);
    }),
    answerQuestion: publicProcedure.input(planAnswerQuestionInputSchema).mutation(async ({ input }) => {
        return planService.answerQuestion(input);
    }),
    revise: publicProcedure.input(planReviseInputSchema).mutation(async ({ input }) => {
        return planService.revise(input);
    }),
    generateDraft: publicProcedure.input(planGenerateDraftInputSchema).mutation(async ({ input }) => {
        const result = await planService.generateDraft(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    approve: publicProcedure.input(planApproveInputSchema).mutation(async ({ input }) => {
        const result = await planService.approve(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    implement: publicProcedure.input(planImplementInputSchema).mutation(async ({ input }) => {
        const result = await planService.implement(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
});

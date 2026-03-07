import {
    planAnswerQuestionInputSchema,
    planApproveInputSchema,
    planGetActiveInputSchema,
    planGetInputSchema,
    planImplementInputSchema,
    planReviseInputSchema,
    planStartInputSchema,
} from '@/app/backend/runtime/contracts';
import { planService } from '@/app/backend/runtime/services/plan/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { toPlanTrpcError } from '@/app/backend/trpc/routers/plan/errors';

export const planRouter = router({
    start: publicProcedure.input(planStartInputSchema).mutation(async ({ input }) => {
        const result = await planService.start(input);
        if (result.isErr()) {
            throw toPlanTrpcError(result.error);
        }
        return result.value;
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
    approve: publicProcedure.input(planApproveInputSchema).mutation(async ({ input }) => {
        const result = await planService.approve(input.profileId, input.planId);
        if (result.isErr()) {
            throw toPlanTrpcError(result.error);
        }
        return result.value;
    }),
    implement: publicProcedure.input(planImplementInputSchema).mutation(async ({ input }) => {
        const result = await planService.implement(input);
        if (result.isErr()) {
            throw toPlanTrpcError(result.error);
        }
        return result.value;
    }),
});

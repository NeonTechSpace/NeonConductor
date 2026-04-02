import {
    planAnswerQuestionInputSchema,
    planApproveInputSchema,
    planApprovePhaseInputSchema,
    planCancelInputSchema,
    planCancelPhaseInputSchema,
    planActivateVariantInputSchema,
    planCreateVariantInputSchema,
    planAbortResearchBatchInputSchema,
    planExpandNextPhaseInputSchema,
    planGenerateDraftInputSchema,
    planGetActiveInputSchema,
    planGetInputSchema,
    planImplementInputSchema,
    planImplementPhaseInputSchema,
    planEnterAdvancedPlanningInputSchema,
    planRaiseFollowUpInputSchema,
    planReviseInputSchema,
    planRevisePhaseInputSchema,
    planResolveFollowUpInputSchema,
    planResumeFromRevisionInputSchema,
    planStartResearchBatchInputSchema,
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
    startResearchBatch: publicProcedure.input(planStartResearchBatchInputSchema).mutation(async ({ input }) => {
        const result = await planService.startResearchBatch(input);
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
        const result = await planService.revise(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    expandNextPhase: publicProcedure.input(planExpandNextPhaseInputSchema).mutation(async ({ input }) => {
        const result = await planService.expandNextPhase(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    revisePhase: publicProcedure.input(planRevisePhaseInputSchema).mutation(async ({ input }) => {
        const result = await planService.revisePhase(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    approvePhase: publicProcedure.input(planApprovePhaseInputSchema).mutation(async ({ input }) => {
        const result = await planService.approvePhase(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    implementPhase: publicProcedure.input(planImplementPhaseInputSchema).mutation(async ({ input }) => {
        const result = await planService.implementPhase(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    cancelPhase: publicProcedure.input(planCancelPhaseInputSchema).mutation(async ({ input }) => {
        const result = await planService.cancelPhase(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    enterAdvancedPlanning: publicProcedure.input(planEnterAdvancedPlanningInputSchema).mutation(async ({ input }) => {
        const result = await planService.enterAdvancedPlanning(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    abortResearchBatch: publicProcedure.input(planAbortResearchBatchInputSchema).mutation(async ({ input }) => {
        const result = await planService.abortResearchBatch(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    createVariant: publicProcedure.input(planCreateVariantInputSchema).mutation(async ({ input }) => {
        const result = await planService.createVariant(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    activateVariant: publicProcedure.input(planActivateVariantInputSchema).mutation(async ({ input }) => {
        const result = await planService.activateVariant(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    resumeFromRevision: publicProcedure.input(planResumeFromRevisionInputSchema).mutation(async ({ input }) => {
        const result = await planService.resumeFromRevision(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    raiseFollowUp: publicProcedure.input(planRaiseFollowUpInputSchema).mutation(async ({ input }) => {
        const result = await planService.raiseFollowUp(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    resolveFollowUp: publicProcedure.input(planResolveFollowUpInputSchema).mutation(async ({ input }) => {
        const result = await planService.resolveFollowUp(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
    }),
    cancel: publicProcedure.input(planCancelInputSchema).mutation(async ({ input }) => {
        const result = await planService.cancel(input);
        return unwrapResultOrThrow(result, toPlanTrpcError);
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

import {
    projectBranchWorkflowCreateInputSchema,
    projectBranchWorkflowDeleteInputSchema,
    projectBranchWorkflowListInputSchema,
    projectBranchWorkflowUpdateInputSchema,
} from '@/app/backend/runtime/contracts';
import { branchWorkflowService } from '@/app/backend/runtime/services/branchWorkflows/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, toTrpcError } from '@/app/backend/trpc/trpcErrorMap';

export const branchWorkflowRouter = router({
    list: publicProcedure.input(projectBranchWorkflowListInputSchema).query(async ({ input }) => {
        return {
            branchWorkflows: (await branchWorkflowService.listProjectBranchWorkflows(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
    create: publicProcedure.input(projectBranchWorkflowCreateInputSchema).mutation(async ({ input }) => {
        return {
            branchWorkflow: (await branchWorkflowService.createProjectBranchWorkflow(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
    update: publicProcedure.input(projectBranchWorkflowUpdateInputSchema).mutation(async ({ input }) => {
        const branchWorkflow = (await branchWorkflowService.updateProjectBranchWorkflow(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        return branchWorkflow
            ? {
                  updated: true as const,
                  branchWorkflow,
              }
            : {
                  updated: false as const,
                  reason: 'not_found' as const,
              };
    }),
    delete: publicProcedure.input(projectBranchWorkflowDeleteInputSchema).mutation(async ({ input }) => {
        return {
            deleted: (await branchWorkflowService.deleteProjectBranchWorkflow(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
});

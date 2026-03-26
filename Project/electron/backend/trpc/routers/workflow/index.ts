import {
    projectWorkflowCreateInputSchema,
    projectWorkflowDeleteInputSchema,
    projectWorkflowListInputSchema,
    projectWorkflowUpdateInputSchema,
} from '@/app/backend/runtime/contracts';
import { workflowService } from '@/app/backend/runtime/services/workflows/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, toTrpcError } from '@/app/backend/trpc/trpcErrorMap';

export const workflowRouter = router({
    list: publicProcedure.input(projectWorkflowListInputSchema).query(async ({ input }) => {
        return {
            workflows: (await workflowService.listProjectWorkflows(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
    create: publicProcedure.input(projectWorkflowCreateInputSchema).mutation(async ({ input }) => {
        return {
            workflow: (await workflowService.createProjectWorkflow(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
    update: publicProcedure.input(projectWorkflowUpdateInputSchema).mutation(async ({ input }) => {
        const workflow = (await workflowService.updateProjectWorkflow(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        return workflow
            ? {
                  updated: true as const,
                  workflow,
              }
            : {
                  updated: false as const,
                  reason: 'not_found' as const,
              };
    }),
    delete: publicProcedure.input(projectWorkflowDeleteInputSchema).mutation(async ({ input }) => {
        return {
            deleted: (await workflowService.deleteProjectWorkflow(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
});

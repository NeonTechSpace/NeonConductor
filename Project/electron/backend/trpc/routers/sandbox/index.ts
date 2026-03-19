import { sandboxStore } from '@/app/backend/persistence/stores';
import {
    sandboxByIdInputSchema,
    sandboxConfigureThreadInputSchema,
    sandboxCreateInputSchema,
    sandboxListInputSchema,
    sandboxRemoveInputSchema,
} from '@/app/backend/runtime/contracts';
import { sandboxService } from '@/app/backend/runtime/services/sandbox/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, toTrpcError, unwrapResultOrThrow } from '@/app/backend/trpc/trpcErrorMap';

export const sandboxRouter = router({
    list: publicProcedure.input(sandboxListInputSchema).query(async ({ input }) => {
        return {
            sandboxes: await sandboxService.list(input.profileId, input.workspaceFingerprint),
        };
    }),
    create: publicProcedure.input(sandboxCreateInputSchema).mutation(async ({ input }) => {
        const result = await sandboxService.create(input);
        return {
            sandbox: unwrapResultOrThrow(result, toTrpcError),
        };
    }),
    refresh: publicProcedure.input(sandboxByIdInputSchema).mutation(async ({ input }) => {
        return sandboxService.refresh(input.profileId, input.sandboxId);
    }),
    remove: publicProcedure.input(sandboxRemoveInputSchema).mutation(async ({ input }) => {
        return sandboxService.remove(input);
    }),
    removeOrphaned: publicProcedure.input(sandboxListInputSchema).mutation(async ({ input }) => {
        return sandboxService.removeOrphaned(input.profileId);
    }),
    configureThread: publicProcedure.input(sandboxConfigureThreadInputSchema).mutation(async ({ input }) => {
        const thread = (await sandboxService.configureThread(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        const sandbox =
            input.mode === 'sandbox' && input.sandboxId
                ? await sandboxStore.getById(input.profileId, input.sandboxId)
                : undefined;

        return {
            thread,
            ...(sandbox ? { sandbox } : {}),
        };
    }),
});

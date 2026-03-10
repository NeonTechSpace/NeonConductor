import { worktreeStore } from '@/app/backend/persistence/stores';
import {
    worktreeByIdInputSchema,
    worktreeConfigureThreadInputSchema,
    worktreeCreateInputSchema,
    worktreeListInputSchema,
    worktreeRemoveInputSchema,
} from '@/app/backend/runtime/contracts';
import { worktreeService } from '@/app/backend/runtime/services/worktree/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, toTrpcError, unwrapResultOrThrow } from '@/app/backend/trpc/trpcErrorMap';

export const worktreeRouter = router({
    list: publicProcedure.input(worktreeListInputSchema).query(async ({ input }) => {
        return {
            worktrees: await worktreeService.list(input.profileId, input.workspaceFingerprint),
        };
    }),
    create: publicProcedure.input(worktreeCreateInputSchema).mutation(async ({ input }) => {
        const result = await worktreeService.create(input);
        return {
            worktree: unwrapResultOrThrow(result, toTrpcError),
        };
    }),
    refresh: publicProcedure.input(worktreeByIdInputSchema).mutation(async ({ input }) => {
        return worktreeService.refresh(input.profileId, input.worktreeId);
    }),
    remove: publicProcedure.input(worktreeRemoveInputSchema).mutation(async ({ input }) => {
        return worktreeService.remove(input);
    }),
    removeOrphaned: publicProcedure.input(worktreeListInputSchema).mutation(async ({ input }) => {
        return worktreeService.removeOrphaned(input.profileId);
    }),
    configureThread: publicProcedure.input(worktreeConfigureThreadInputSchema).mutation(async ({ input }) => {
        const thread = (await worktreeService.configureThread(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
        const worktree =
            input.mode === 'worktree' && input.worktreeId
                ? await worktreeStore.getById(input.profileId, input.worktreeId)
                : undefined;

        return {
            thread,
            ...(worktree ? { worktree } : {}),
        };
    }),
});

import { diffStore } from '@/app/backend/persistence/stores';
import { diffGetFilePatchInputSchema, diffListByRunInputSchema } from '@/app/backend/runtime/contracts';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const diffRouter = router({
    listByRun: publicProcedure.input(diffListByRunInputSchema).query(async ({ input }) => {
        return {
            diffs: await diffStore.listByRun(input.profileId, input.runId),
        };
    }),
    getFilePatch: publicProcedure.input(diffGetFilePatchInputSchema).query(async ({ input }) => {
        const diff = await diffStore.getById(input.profileId, input.diffId);
        if (!diff || diff.artifact.kind !== 'git') {
            return {
                found: false as const,
            };
        }

        const patch = diff.artifact.patchesByPath[input.path];
        if (!patch) {
            return {
                found: false as const,
            };
        }

        return {
            found: true as const,
            diffId: diff.id,
            path: input.path,
            patch,
            language: 'diff' as const,
        };
    }),
});

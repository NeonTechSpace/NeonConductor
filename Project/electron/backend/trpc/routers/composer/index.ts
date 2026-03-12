import { appComposerMediaSettingsStore } from '@/app/backend/persistence/stores';
import { setComposerMediaSettingsInputSchema } from '@/app/backend/runtime/contracts';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const composerRouter = router({
    getSettings: publicProcedure.query(async () => {
        return {
            settings: await appComposerMediaSettingsStore.get(),
        };
    }),
    setSettings: publicProcedure.input(setComposerMediaSettingsInputSchema).mutation(async ({ input }) => {
        return {
            settings: await appComposerMediaSettingsStore.set(input),
        };
    }),
});

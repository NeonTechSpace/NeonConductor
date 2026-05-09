import { appWorkbenchCommandSettingsStore } from '@/app/backend/persistence/stores';
import { setWorkbenchCommandKeybindingOverridesInputSchema } from '@/app/backend/runtime/contracts';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const workbenchRouter = router({
    getCommandSettings: publicProcedure.query(async () => {
        return {
            settings: await appWorkbenchCommandSettingsStore.get(),
        };
    }),
    setCommandKeybindingOverrides: publicProcedure
        .input(setWorkbenchCommandKeybindingOverridesInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await appWorkbenchCommandSettingsStore.set(input.overrides),
            };
        }),
    resetCommandKeybindings: publicProcedure.mutation(async () => {
        return {
            settings: await appWorkbenchCommandSettingsStore.reset(),
        };
    }),
});

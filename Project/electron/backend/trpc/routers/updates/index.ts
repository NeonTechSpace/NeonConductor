import { type as arktype } from 'arktype';

import { publicProcedure, router } from '@/app/backend/trpc/init';
import {
    checkForUpdatesManually,
    dismissUpdateStatus,
    getCurrentChannel,
    getSwitchStatusSnapshot,
    restartToApplyUpdate,
    switchChannel,
} from '@/app/main/updates/updater';

const updateChannelSchema = arktype("'stable' | 'beta' | 'alpha'");

export const updatesRouter = router({
    getChannel: publicProcedure.query(() => {
        return { channel: getCurrentChannel() };
    }),
    setChannel: publicProcedure.input(updateChannelSchema).mutation(({ input }) => {
        return switchChannel(input);
    }),
    getSwitchStatus: publicProcedure.query(() => {
        return getSwitchStatusSnapshot();
    }),
    checkForUpdates: publicProcedure.mutation(() => {
        return checkForUpdatesManually();
    }),
    dismissStatus: publicProcedure.mutation(() => {
        dismissUpdateStatus();
        return { ok: true };
    }),
    restartToApplyUpdate: publicProcedure.mutation(() => {
        return restartToApplyUpdate();
    }),
});

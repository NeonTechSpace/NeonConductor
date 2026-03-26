import { settingsStore } from '@/app/backend/persistence/stores';
import {
    modeGetActiveInputSchema,
    modeListInputSchema,
    modeSetActiveInputSchema,
} from '@/app/backend/runtime/contracts';
import { resolveActiveMode } from '@/app/backend/runtime/services/mode/activeMode';
import { toActiveModeKey } from '@/app/backend/runtime/services/mode/selection';
import { resolveModesForTab } from '@/app/backend/runtime/services/registry/service';
import { runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { throwWithCode } from '@/app/backend/trpc/routers/provider/shared';

export const modeRouter = router({
    list: publicProcedure.input(modeListInputSchema).query(async ({ input }) => {
        return {
            modes: await resolveModesForTab(input),
        };
    }),
    getActive: publicProcedure.input(modeGetActiveInputSchema).query(async ({ input }) => {
        const result = await resolveActiveMode(input);
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        const { modes, activeMode } = result.value;
        return {
            activeMode,
            modes,
        };
    }),
    setActive: publicProcedure.input(modeSetActiveInputSchema).mutation(async ({ input }) => {
        const modes = await resolveModesForTab(input);
        const mode = modes.find((candidate) => candidate.modeKey === input.modeKey);
        if (!mode) {
            return {
                updated: false as const,
                reason: 'mode_not_found' as const,
            };
        }

        const activeKey = toActiveModeKey(input.topLevelTab, input.workspaceFingerprint);
        await settingsStore.setString(input.profileId, activeKey, mode.modeKey);

        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'runtime',
                domain: 'runtime',
                entityId: `mode:${input.topLevelTab}`,
                eventType: 'mode.active.set',
                payload: {
                    profileId: input.profileId,
                    topLevelTab: input.topLevelTab,
                    modeKey: mode.modeKey,
                    workspaceFingerprint: input.workspaceFingerprint ?? null,
                },
            })
        );

        return {
            updated: true as const,
            mode,
        };
    }),
});

import { profileStore } from '@/app/backend/persistence/stores';
import {
    profileCreateInputSchema,
    profileDeleteInputSchema,
    profileDuplicateInputSchema,
    profileGetExecutionPresetInputSchema,
    profileRenameInputSchema,
    profileSetActiveInputSchema,
    profileSetExecutionPresetInputSchema,
} from '@/app/backend/runtime/contracts';
import { getExecutionPreset, setExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { runtimeRemoveEvent, runtimeStatusEvent, runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { throwWithCode } from '@/app/backend/trpc/routers/provider/shared';

export const profileRouter = router({
    list: publicProcedure.query(async () => {
        return {
            profiles: await profileStore.list(),
        };
    }),
    getActive: publicProcedure.query(async () => {
        const result = await profileStore.getActive();
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        return result.value;
    }),
    getExecutionPreset: publicProcedure.input(profileGetExecutionPresetInputSchema).query(async ({ input }) => {
        return {
            preset: await getExecutionPreset(input.profileId),
        };
    }),
    setExecutionPreset: publicProcedure
        .input(profileSetExecutionPresetInputSchema)
        .mutation(async ({ input }) => {
            const preset = await setExecutionPreset(input.profileId, input.preset);
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'profile',
                    domain: 'profile',
                    entityId: input.profileId,
                    eventType: 'profile.execution-preset.updated',
                    payload: {
                        profileId: input.profileId,
                        preset,
                    },
                })
            );

            return { preset };
        }),
    setActive: publicProcedure.input(profileSetActiveInputSchema).mutation(async ({ input }) => {
        const result = await profileStore.setActive(input.profileId);
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        const profile = result.value;
        if (!profile) {
            return {
                updated: false as const,
                reason: 'profile_not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeStatusEvent({
            entityType: 'profile',
            domain: 'profile',
            entityId: profile.id,
            eventType: 'profile.activated',
            payload: {
                profile,
            },
            })
        );

        return {
            updated: true as const,
            profile,
        };
    }),
    create: publicProcedure.input(profileCreateInputSchema).mutation(async ({ input }) => {
        const result = await profileStore.create(input.name);
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        const profile = result.value;

        await runtimeEventLogService.append(
            runtimeUpsertEvent({
            entityType: 'profile',
            domain: 'profile',
            entityId: profile.id,
            eventType: 'profile.created',
            payload: {
                profile,
            },
            })
        );

        return {
            profile,
        };
    }),
    rename: publicProcedure.input(profileRenameInputSchema).mutation(async ({ input }) => {
        const profile = await profileStore.rename(input.profileId, input.name);
        if (!profile) {
            return {
                updated: false as const,
                reason: 'profile_not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeUpsertEvent({
            entityType: 'profile',
            domain: 'profile',
            entityId: profile.id,
            eventType: 'profile.renamed',
            payload: {
                profile,
            },
            })
        );

        return {
            updated: true as const,
            profile,
        };
    }),
    duplicate: publicProcedure.input(profileDuplicateInputSchema).mutation(async ({ input }) => {
        const result = await profileStore.duplicate(input.profileId, input.name);
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        const profile = result.value;
        if (!profile) {
            return {
                duplicated: false as const,
                reason: 'profile_not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeUpsertEvent({
            entityType: 'profile',
            domain: 'profile',
            entityId: profile.id,
            eventType: 'profile.duplicated',
            payload: {
                sourceProfileId: input.profileId,
                profile,
            },
            })
        );

        return {
            duplicated: true as const,
            profile,
        };
    }),
    delete: publicProcedure.input(profileDeleteInputSchema).mutation(async ({ input }) => {
        const result = await profileStore.delete(input.profileId);
        if (!result.deleted) {
            return result;
        }

        await runtimeEventLogService.append(
            runtimeRemoveEvent({
            entityType: 'profile',
            domain: 'profile',
            entityId: input.profileId,
            eventType: 'profile.deleted',
            payload: {
                profileId: input.profileId,
                activeProfileId: result.activeProfileId,
                promotedProfileId: result.promotedProfileId ?? null,
            },
            })
        );

        return result;
    }),
});

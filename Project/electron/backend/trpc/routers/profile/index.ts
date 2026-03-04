import { profileStore } from '@/app/backend/persistence/stores';
import {
    profileCreateInputSchema,
    profileDeleteInputSchema,
    profileDuplicateInputSchema,
    profileRenameInputSchema,
    profileSetActiveInputSchema,
} from '@/app/backend/runtime/contracts';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const profileRouter = router({
    list: publicProcedure.query(async () => {
        return {
            profiles: await profileStore.list(),
        };
    }),
    getActive: publicProcedure.query(async () => {
        return profileStore.getActive();
    }),
    setActive: publicProcedure.input(profileSetActiveInputSchema).mutation(async ({ input }) => {
        const profile = await profileStore.setActive(input.profileId);
        if (!profile) {
            return {
                updated: false as const,
                reason: 'profile_not_found' as const,
            };
        }

        await runtimeEventLogService.append({
            entityType: 'profile',
            entityId: profile.id,
            eventType: 'profile.activated',
            payload: {
                profile,
            },
        });

        return {
            updated: true as const,
            profile,
        };
    }),
    create: publicProcedure.input(profileCreateInputSchema).mutation(async ({ input }) => {
        const profile = await profileStore.create(input.name);

        await runtimeEventLogService.append({
            entityType: 'profile',
            entityId: profile.id,
            eventType: 'profile.created',
            payload: {
                profile,
            },
        });

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

        await runtimeEventLogService.append({
            entityType: 'profile',
            entityId: profile.id,
            eventType: 'profile.renamed',
            payload: {
                profile,
            },
        });

        return {
            updated: true as const,
            profile,
        };
    }),
    duplicate: publicProcedure.input(profileDuplicateInputSchema).mutation(async ({ input }) => {
        const profile = await profileStore.duplicate(input.profileId, input.name);
        if (!profile) {
            return {
                duplicated: false as const,
                reason: 'profile_not_found' as const,
            };
        }

        await runtimeEventLogService.append({
            entityType: 'profile',
            entityId: profile.id,
            eventType: 'profile.duplicated',
            payload: {
                sourceProfileId: input.profileId,
                profile,
            },
        });

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

        await runtimeEventLogService.append({
            entityType: 'profile',
            entityId: input.profileId,
            eventType: 'profile.deleted',
            payload: {
                profileId: input.profileId,
                activeProfileId: result.activeProfileId,
                promotedProfileId: result.promotedProfileId ?? null,
            },
        });

        return result;
    }),
});

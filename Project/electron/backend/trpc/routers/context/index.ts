import { appContextSettingsStore, profileContextSettingsStore } from '@/app/backend/persistence/stores';
import {
    compactSessionInputSchema,
    profileInputSchema,
    resolvedContextStateInputSchema,
    setContextGlobalSettingsInputSchema,
    setContextProfileSettingsInputSchema,
} from '@/app/backend/runtime/contracts';
import { sessionContextService } from '@/app/backend/runtime/services/context/sessionContextService';
import { buildSessionSystemPrelude } from '@/app/backend/runtime/services/runExecution/contextPrelude';
import { resolveModeExecution } from '@/app/backend/runtime/services/runExecution/mode';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { toTrpcError } from '@/app/backend/trpc/trpcErrorMap';

export const contextRouter = router({
    getGlobalSettings: publicProcedure.query(async () => {
        return {
            settings: await appContextSettingsStore.get(),
        };
    }),
    setGlobalSettings: publicProcedure.input(setContextGlobalSettingsInputSchema).mutation(async ({ input }) => {
        return {
            settings: await appContextSettingsStore.set(input),
        };
    }),
    getProfileSettings: publicProcedure.input(profileInputSchema).query(async ({ input }) => {
        return {
            settings: await profileContextSettingsStore.get(input.profileId),
        };
    }),
    setProfileSettings: publicProcedure.input(setContextProfileSettingsInputSchema).mutation(async ({ input }) => {
        return {
            settings: await profileContextSettingsStore.set(input),
        };
    }),
    getResolvedState: publicProcedure.input(resolvedContextStateInputSchema).query(async ({ input }) => {
        if (!input.sessionId || !input.topLevelTab || !input.modeKey) {
            return sessionContextService.getResolvedState({
                profileId: input.profileId,
                providerId: input.providerId,
                modelId: input.modelId,
            });
        }

        const resolvedModeResult = await resolveModeExecution({
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        if (resolvedModeResult.isErr()) {
            throw toTrpcError(resolvedModeResult.error);
        }

        const systemPreludeResult = await buildSessionSystemPrelude({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            resolvedMode: resolvedModeResult.value,
        });
        if (systemPreludeResult.isErr()) {
            throw toTrpcError(systemPreludeResult.error);
        }

        return sessionContextService.getResolvedState({
            profileId: input.profileId,
            sessionId: input.sessionId,
            providerId: input.providerId,
            modelId: input.modelId,
            systemMessages: systemPreludeResult.value,
        });
    }),
    compactSession: publicProcedure.input(compactSessionInputSchema).mutation(async ({ input }) => {
        const result = await sessionContextService.compactSession({
            profileId: input.profileId,
            sessionId: input.sessionId,
            providerId: input.providerId,
            modelId: input.modelId,
            source: 'manual',
        });
        if (result.isErr()) {
            throw toTrpcError(result.error);
        }

        return result.value;
    }),
});

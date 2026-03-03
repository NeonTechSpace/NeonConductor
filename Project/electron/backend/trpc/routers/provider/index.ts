import { providerStore } from '@/app/backend/persistence/stores';
import {
    providerListProvidersInputSchema,
    providerListModelsInputSchema,
    providerSetDefaultInputSchema,
} from '@/app/backend/runtime/contracts';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const providerRouter = router({
    listProviders: publicProcedure.input(providerListProvidersInputSchema).query(async ({ input }) => {
        const [providers, defaults] = await Promise.all([
            providerStore.listProviders(),
            providerStore.getDefaults(input.profileId),
        ]);

        return {
            providers: providers.map((provider) => ({
                ...provider,
                isDefault: provider.id === defaults.providerId,
            })),
        };
    }),
    listModels: publicProcedure.input(providerListModelsInputSchema).query(async ({ input }) => {
        return { models: await providerStore.listModels(input.providerId) };
    }),
    setDefault: publicProcedure.input(providerSetDefaultInputSchema).mutation(async ({ input }) => {
        const hasProvider = await providerStore.providerExists(input.providerId);
        if (!hasProvider) {
            const defaults = await providerStore.getDefaults(input.profileId);
            return {
                success: false as const,
                reason: 'provider_not_found' as const,
                defaultProviderId: defaults.providerId,
                defaultModelId: defaults.modelId,
            };
        }

        const hasModel = await providerStore.modelExists(input.providerId, input.modelId);
        if (!hasModel) {
            const defaults = await providerStore.getDefaults(input.profileId);
            return {
                success: false as const,
                reason: 'model_not_found' as const,
                defaultProviderId: defaults.providerId,
                defaultModelId: defaults.modelId,
            };
        }

        await providerStore.setDefaults(input.profileId, input.providerId, input.modelId);
        const defaults = await providerStore.getDefaults(input.profileId);

        await runtimeEventLogService.append({
            entityType: 'provider',
            entityId: input.providerId,
            eventType: 'provider.default-set',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                modelId: input.modelId,
            },
        });

        return {
            success: true as const,
            reason: null,
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }),
});

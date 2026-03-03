import { providerManagementService } from '@/app/backend/providers/service';
import {
    providerByIdInputSchema,
    providerClearAuthInputSchema,
    providerListProvidersInputSchema,
    providerListModelsInputSchema,
    providerSetApiKeyInputSchema,
    providerSetDefaultInputSchema,
    providerSyncCatalogInputSchema,
} from '@/app/backend/runtime/contracts';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

function isProviderNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return (
        error.message.includes('Unsupported provider') ||
        error.message.includes('not registered') ||
        error.message.includes('provider_not_found')
    );
}

export const providerRouter = router({
    listProviders: publicProcedure.input(providerListProvidersInputSchema).query(async ({ input }) => {
        return { providers: await providerManagementService.listProviders(input.profileId) };
    }),
    listModels: publicProcedure.input(providerListModelsInputSchema).query(async ({ input }) => {
        try {
            return {
                models: await providerManagementService.listModels(input.profileId, input.providerId),
                reason: null,
            };
        } catch (error) {
            if (isProviderNotFoundError(error)) {
                return { models: [], reason: 'provider_not_found' as const };
            }

            throw error;
        }
    }),
    getAuthState: publicProcedure.input(providerByIdInputSchema).query(async ({ input }) => {
        try {
            const state = await providerManagementService.getAuthState(input.profileId, input.providerId);
            return {
                found: true as const,
                state,
            };
        } catch (error) {
            if (isProviderNotFoundError(error)) {
                return {
                    found: false as const,
                    reason: 'provider_not_found' as const,
                };
            }

            throw error;
        }
    }),
    setApiKey: publicProcedure.input(providerSetApiKeyInputSchema).mutation(async ({ input }) => {
        try {
            const state = await providerManagementService.setApiKey(input.profileId, input.providerId, input.apiKey);
            await runtimeEventLogService.append({
                entityType: 'provider',
                entityId: input.providerId,
                eventType: 'provider.auth.api-key-set',
                payload: {
                    profileId: input.profileId,
                    providerId: input.providerId,
                },
            });

            return {
                success: true as const,
                reason: null,
                state,
            };
        } catch (error) {
            if (isProviderNotFoundError(error)) {
                return {
                    success: false as const,
                    reason: 'provider_not_found' as const,
                };
            }

            throw error;
        }
    }),
    clearAuth: publicProcedure.input(providerClearAuthInputSchema).mutation(async ({ input }) => {
        try {
            const result = await providerManagementService.clearAuth(input.profileId, input.providerId);
            await runtimeEventLogService.append({
                entityType: 'provider',
                entityId: input.providerId,
                eventType: 'provider.auth.cleared',
                payload: {
                    profileId: input.profileId,
                    providerId: input.providerId,
                },
            });

            return {
                success: true as const,
                reason: null,
                ...result,
            };
        } catch (error) {
            if (isProviderNotFoundError(error)) {
                return {
                    success: false as const,
                    reason: 'provider_not_found' as const,
                };
            }

            throw error;
        }
    }),
    syncCatalog: publicProcedure.input(providerSyncCatalogInputSchema).mutation(async ({ input }) => {
        try {
            const result = await providerManagementService.syncCatalog(input.profileId, input.providerId, input.force);
            await runtimeEventLogService.append({
                entityType: 'provider',
                entityId: input.providerId,
                eventType: 'provider.catalog.sync',
                payload: {
                    profileId: input.profileId,
                    providerId: input.providerId,
                    ok: result.ok,
                    reason: result.reason ?? null,
                    modelCount: result.modelCount,
                },
            });
            return result;
        } catch (error) {
            if (isProviderNotFoundError(error)) {
                return {
                    ok: false as const,
                    providerId: input.providerId,
                    reason: 'provider_not_found' as const,
                    modelCount: 0,
                };
            }

            throw error;
        }
    }),
    setDefault: publicProcedure.input(providerSetDefaultInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.setDefault(input.profileId, input.providerId, input.modelId);

        if (result.success) {
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
        }

        return result;
    }),
});

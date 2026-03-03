import { providerManagementService } from '@/app/backend/providers/service';
import {
    providerByIdInputSchema,
    providerCancelAuthInputSchema,
    providerClearAuthInputSchema,
    providerCompleteAuthInputSchema,
    providerGetAccountContextInputSchema,
    providerListAuthMethodsInputSchema,
    providerListModelsInputSchema,
    providerListProvidersInputSchema,
    providerPollAuthInputSchema,
    providerRefreshAuthInputSchema,
    providerSetApiKeyInputSchema,
    providerSetDefaultInputSchema,
    providerSetOrganizationInputSchema,
    providerStartAuthInputSchema,
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
    listAuthMethods: publicProcedure.input(providerListAuthMethodsInputSchema).query(({ input }) => {
        return {
            methods: providerManagementService.listAuthMethods(input.profileId),
        };
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
    startAuth: publicProcedure.input(providerStartAuthInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.startAuth(input);
        await runtimeEventLogService.append({
            entityType: 'provider',
            entityId: input.providerId,
            eventType: 'provider.auth.started',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                method: input.method,
                flowId: result.flow.id,
            },
        });

        return result;
    }),
    pollAuth: publicProcedure.input(providerPollAuthInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.pollAuth(input);
        await runtimeEventLogService.append({
            entityType: 'provider',
            entityId: input.providerId,
            eventType: 'provider.auth.polled',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                flowStatus: result.flow.status,
                authState: result.state.authState,
            },
        });

        return result;
    }),
    completeAuth: publicProcedure.input(providerCompleteAuthInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.completeAuth(input);
        await runtimeEventLogService.append({
            entityType: 'provider',
            entityId: input.providerId,
            eventType: 'provider.auth.completed',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                flowStatus: result.flow.status,
                authState: result.state.authState,
            },
        });

        return result;
    }),
    cancelAuth: publicProcedure.input(providerCancelAuthInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.cancelAuth(input);
        await runtimeEventLogService.append({
            entityType: 'provider',
            entityId: input.providerId,
            eventType: 'provider.auth.cancelled',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
            },
        });

        return result;
    }),
    refreshAuth: publicProcedure.input(providerRefreshAuthInputSchema).mutation(async ({ input }) => {
        const state = await providerManagementService.refreshAuth(input.profileId, input.providerId);
        await runtimeEventLogService.append({
            entityType: 'provider',
            entityId: input.providerId,
            eventType: 'provider.auth.refreshed',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                authState: state.authState,
            },
        });

        return { state };
    }),
    getAccountContext: publicProcedure.input(providerGetAccountContextInputSchema).query(async ({ input }) => {
        return providerManagementService.getAccountContext(input.profileId, input.providerId);
    }),
    setOrganization: publicProcedure.input(providerSetOrganizationInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.setOrganization(
            input.profileId,
            input.providerId,
            input.organizationId
        );
        await runtimeEventLogService.append({
            entityType: 'provider',
            entityId: input.providerId,
            eventType: 'provider.organization.set',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                organizationId: input.organizationId ?? null,
            },
        });

        return result;
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
                    status: result.status,
                    reason: result.reason ?? null,
                    modelCount: result.modelCount,
                },
            });
            return result;
        } catch (error) {
            if (isProviderNotFoundError(error)) {
                return {
                    ok: false as const,
                    status: 'error' as const,
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

import { providerManagementService } from '@/app/backend/providers/service';
import {
    providerCancelAuthInputSchema,
    providerClearAuthInputSchema,
    providerCompleteAuthInputSchema,
    providerPollAuthInputSchema,
    providerRefreshAuthInputSchema,
    providerSetApiKeyInputSchema,
    providerSetDefaultInputSchema,
    providerSetConnectionProfileInputSchema,
    providerSetModelRoutingPreferenceInputSchema,
    providerSetOrganizationInputSchema,
    providerStartAuthInputSchema,
    providerSyncCatalogInputSchema,
    type RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import { publicProcedure } from '@/app/backend/trpc/init';
import {
    emitProviderStatusEvent,
    emitProviderSyncEvent,
    emitProviderUpsertEvent,
} from '@/app/backend/trpc/routers/provider/events';
import { isProviderNotFoundCode, mapAuthErrorToOperationalCode, throwWithCode } from '@/app/backend/trpc/routers/provider/shared';

async function getProviderListItem(profileId: string, providerId: RuntimeProviderId) {
    const providers = await providerManagementService.listProviders(profileId);
    return providers.find((provider) => provider.id === providerId) ?? null;
}

export const providerMutationProcedures = {
    startAuth: publicProcedure.input(providerStartAuthInputSchema).mutation(async ({ input, ctx }) => {
        const result = await providerManagementService.startAuth(input, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (result.isErr()) {
            throwWithCode(mapAuthErrorToOperationalCode(result.error.code), result.error.message);
        }

        await emitProviderStatusEvent({
            providerId: input.providerId,
            eventType: 'provider.auth.started',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                method: input.method,
                flowId: result.value.flow.id,
            },
        });

        return result.value;
    }),
    pollAuth: publicProcedure.input(providerPollAuthInputSchema).mutation(async ({ input, ctx }) => {
        const result = await providerManagementService.pollAuth(input, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (result.isErr()) {
            throwWithCode(mapAuthErrorToOperationalCode(result.error.code), result.error.message);
        }

        await emitProviderStatusEvent({
            providerId: input.providerId,
            eventType: 'provider.auth.polled',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                flowStatus: result.value.flow.status,
                authState: result.value.state.authState,
                state: result.value.state,
            },
        });

        return result.value;
    }),
    completeAuth: publicProcedure.input(providerCompleteAuthInputSchema).mutation(async ({ input, ctx }) => {
        const result = await providerManagementService.completeAuth(input, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (result.isErr()) {
            throwWithCode(mapAuthErrorToOperationalCode(result.error.code), result.error.message);
        }

        await emitProviderStatusEvent({
            providerId: input.providerId,
            eventType: 'provider.auth.completed',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                flowStatus: result.value.flow.status,
                authState: result.value.state.authState,
                state: result.value.state,
            },
        });

        return result.value;
    }),
    cancelAuth: publicProcedure.input(providerCancelAuthInputSchema).mutation(async ({ input, ctx }) => {
        const result = await providerManagementService.cancelAuth(input, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (result.isErr()) {
            throwWithCode(mapAuthErrorToOperationalCode(result.error.code), result.error.message);
        }

        await emitProviderStatusEvent({
            providerId: input.providerId,
            eventType: 'provider.auth.cancelled',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                state: result.value.state,
            },
        });

        return result.value;
    }),
    refreshAuth: publicProcedure.input(providerRefreshAuthInputSchema).mutation(async ({ input, ctx }) => {
        const stateResult = await providerManagementService.refreshAuth(input.profileId, input.providerId, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (stateResult.isErr()) {
            throwWithCode(mapAuthErrorToOperationalCode(stateResult.error.code), stateResult.error.message);
        }

        await emitProviderStatusEvent({
            providerId: input.providerId,
            eventType: 'provider.auth.refreshed',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                authState: stateResult.value.authState,
                state: stateResult.value,
            },
        });

        return { state: stateResult.value };
    }),
    setConnectionProfile: publicProcedure
        .input(providerSetConnectionProfileInputSchema)
        .mutation(async ({ input, ctx }) => {
            const connectionProfileResult = await providerManagementService.setConnectionProfile(
                input.profileId,
                input.providerId,
                {
                    optionProfileId: input.optionProfileId,
                    ...(input.baseUrlOverride !== undefined ? { baseUrlOverride: input.baseUrlOverride } : {}),
                    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
                },
                {
                    requestId: ctx.requestId,
                    correlationId: ctx.correlationId,
                }
            );
            if (connectionProfileResult.isErr()) {
                throwWithCode(connectionProfileResult.error.code, connectionProfileResult.error.message);
            }

            const [provider, defaults, models] = await Promise.all([
                getProviderListItem(input.profileId, input.providerId),
                providerManagementService.getDefaults(input.profileId),
                providerManagementService.listModels(input.profileId, input.providerId),
            ]);
            if (models.isErr()) {
                throwWithCode(models.error.code, models.error.message);
            }

            await emitProviderUpsertEvent({
                providerId: input.providerId,
                eventType: 'provider.endpoint-profile.set',
                payload: {
                    profileId: input.profileId,
                    providerId: input.providerId,
                    value: connectionProfileResult.value.optionProfileId,
                    connectionProfile: connectionProfileResult.value,
                    defaults,
                    models: models.value,
                    ...(provider ? { provider } : {}),
                },
            });

            return {
                connectionProfile: connectionProfileResult.value,
                defaults,
                models: models.value,
                ...(provider ? { provider } : {}),
            };
        }),
    setOrganization: publicProcedure.input(providerSetOrganizationInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.setOrganization(
            input.profileId,
            input.providerId,
            input.organizationId
        );
        if (result.isErr()) {
            throwWithCode(mapAuthErrorToOperationalCode(result.error.code), result.error.message);
        }

        const [provider, defaults, models, authState] = await Promise.all([
            getProviderListItem(input.profileId, input.providerId),
            providerManagementService.getDefaults(input.profileId),
            providerManagementService.listModels(input.profileId, input.providerId),
            providerManagementService.getAuthState(input.profileId, input.providerId),
        ]);
        if (models.isErr()) {
            throwWithCode(models.error.code, models.error.message);
        }

        await emitProviderUpsertEvent({
            providerId: input.providerId,
            eventType: 'provider.organization.set',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                organizationId: input.organizationId ?? null,
                accountContext: result.value,
                authState,
                defaults,
                models: models.value,
                ...(provider ? { provider } : {}),
            },
        });

        return {
            ...result.value,
            authState,
            defaults,
            models: models.value,
            ...(provider ? { provider } : {}),
        };
    }),
    setModelRoutingPreference: publicProcedure
        .input(providerSetModelRoutingPreferenceInputSchema)
        .mutation(async ({ input }) => {
            const result = await providerManagementService.setModelRoutingPreference(input);
            if (result.isErr()) {
                throwWithCode(result.error.code, result.error.message);
            }

            const preference = result.value;

            const providers = await providerManagementService.listModelProviders(input);
            if (providers.isErr()) {
                throwWithCode(providers.error.code, providers.error.message);
            }

            await emitProviderUpsertEvent({
                providerId: input.providerId,
                eventType: 'provider.kilo-routing.set',
                payload: {
                    profileId: input.profileId,
                    providerId: input.providerId,
                    modelId: input.modelId,
                    routingMode: preference.routingMode,
                    sort: preference.sort ?? null,
                    pinnedProviderId: preference.pinnedProviderId ?? null,
                    preference,
                    providers: providers.value,
                },
            });

            return {
                preference,
                providers: providers.value,
            };
        }),
    setApiKey: publicProcedure.input(providerSetApiKeyInputSchema).mutation(async ({ input, ctx }) => {
        const stateResult = await providerManagementService.setApiKey(input.profileId, input.providerId, input.apiKey, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (stateResult.isErr()) {
            if (stateResult.error.code === 'method_not_supported') {
                return {
                    success: false as const,
                    reason: 'provider_not_found' as const,
                };
            }
            throwWithCode(mapAuthErrorToOperationalCode(stateResult.error.code), stateResult.error.message);
        }

        await emitProviderUpsertEvent({
            providerId: input.providerId,
            eventType: 'provider.auth.api-key-set',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                state: stateResult.value,
            },
        });

        return {
            success: true as const,
            reason: null,
            state: stateResult.value,
        };
    }),
    clearAuth: publicProcedure.input(providerClearAuthInputSchema).mutation(async ({ input, ctx }) => {
        const clearResult = await providerManagementService.clearAuth(input.profileId, input.providerId, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (clearResult.isErr()) {
            if (clearResult.error.code === 'method_not_supported') {
                return {
                    success: false as const,
                    reason: 'provider_not_found' as const,
                };
            }
            throwWithCode(mapAuthErrorToOperationalCode(clearResult.error.code), clearResult.error.message);
        }

        await emitProviderStatusEvent({
            providerId: input.providerId,
            eventType: 'provider.auth.cleared',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                state: clearResult.value.authState,
            },
        });

        return {
            success: true as const,
            reason: null,
            ...clearResult.value,
        };
    }),
    syncCatalog: publicProcedure.input(providerSyncCatalogInputSchema).mutation(async ({ input, ctx }) => {
        const result = await providerManagementService.syncCatalog(input.profileId, input.providerId, input.force, {
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });
        if (result.isErr()) {
            if (isProviderNotFoundCode(result.error.code)) {
                return {
                    ok: false as const,
                    status: 'error' as const,
                    providerId: input.providerId,
                    reason: 'provider_not_found' as const,
                    modelCount: 0,
                };
            }
            throwWithCode(result.error.code, result.error.message);
        }

        const [provider, defaults, models] = await Promise.all([
            getProviderListItem(input.profileId, input.providerId),
            providerManagementService.getDefaults(input.profileId),
            providerManagementService.listModels(input.profileId, input.providerId),
        ]);
        if (models.isErr()) {
            throwWithCode(models.error.code, models.error.message);
        }

        await emitProviderSyncEvent({
            providerId: input.providerId,
            eventType: 'provider.catalog.sync',
            payload: {
                profileId: input.profileId,
                providerId: input.providerId,
                ok: result.value.ok,
                status: result.value.status,
                reason: result.value.reason ?? null,
                modelCount: result.value.modelCount,
                defaults,
                models: models.value,
                ...(provider ? { provider } : {}),
            },
        });

        return {
            ...result.value,
            defaults,
            models: models.value,
            ...(provider ? { provider } : {}),
        };
    }),
    setDefault: publicProcedure.input(providerSetDefaultInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.setDefault(input.profileId, input.providerId, input.modelId);

        if (result.success) {
            await emitProviderUpsertEvent({
                providerId: input.providerId,
                eventType: 'provider.default-set',
                payload: {
                    profileId: input.profileId,
                    providerId: input.providerId,
                    modelId: input.modelId,
                    defaults: {
                        providerId: result.defaultProviderId,
                        modelId: result.defaultModelId,
                    },
                },
            });
        }

        return result;
    }),
};

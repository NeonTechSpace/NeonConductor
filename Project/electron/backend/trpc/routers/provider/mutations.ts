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
    providerSetExecutionPreferenceInputSchema,
    providerSetModelRoutingPreferenceInputSchema,
    providerSetSpecialistDefaultInputSchema,
    providerSetOrganizationInputSchema,
    providerStartAuthInputSchema,
    providerSyncCatalogInputSchema,
    type RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import { publicProcedure } from '@/app/backend/trpc/init';
import { resolveEmptyCatalogState } from '@/app/backend/trpc/routers/provider/catalogState';
import {
    emitProviderStatusEvent,
    emitProviderSyncEvent,
    emitProviderUpsertEvent,
} from '@/app/backend/trpc/routers/provider/events';
import {
    buildProviderApiKeySetEventPayload,
    buildProviderAuthCancelledEventPayload,
    buildProviderAuthClearedEventPayload,
    buildProviderAuthCompletedEventPayload,
    buildProviderAuthPolledEventPayload,
    buildProviderAuthRefreshedEventPayload,
    buildProviderAuthStartedEventPayload,
    buildProviderConnectionProfileSetEventPayload,
    buildProviderExecutionPreferenceSetEventPayload,
    buildProviderKiloRoutingSetEventPayload,
    buildProviderOrganizationSetEventPayload,
    buildProviderSyncEventPayload,
} from '@/app/backend/trpc/routers/provider/providerMutationEventProjector';
import {
    buildProviderConnectionProfileMutationReadback,
    buildProviderExecutionPreferenceMutationReadback,
    buildProviderModelRoutingPreferenceMutationReadback,
    buildProviderOrganizationMutationReadback,
    buildProviderSyncMutationReadback,
    readProviderMutationReadback,
} from '@/app/backend/trpc/routers/provider/providerMutationReadbackProjector';
import {
    isProviderNotFoundCode,
    mapAuthErrorToOperationalCode,
    throwWithCode,
} from '@/app/backend/trpc/routers/provider/shared';

async function readProviderMutationState(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    includeAuthState?: boolean;
    includeDefaults?: boolean;
    includeModels?: boolean;
    includeProvider?: boolean;
}) {
    const result = await readProviderMutationReadback(
        {
            listProviders: providerManagementService.listProviders.bind(providerManagementService),
            getDefaults: providerManagementService.getDefaults.bind(providerManagementService),
            listModels: providerManagementService.listModels.bind(providerManagementService),
            getAuthState: providerManagementService.getAuthState.bind(providerManagementService),
        },
        input
    );
    if (result.isErr()) {
        throwWithCode(result.error.code, result.error.message);
    }

    return result.value;
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
            payload: buildProviderAuthStartedEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                method: input.method,
                flowId: result.value.flow.id,
            }),
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
            payload: buildProviderAuthPolledEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                flowStatus: result.value.flow.status,
                authState: result.value.state.authState,
                state: result.value.state,
            }),
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
            payload: buildProviderAuthCompletedEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                flowStatus: result.value.flow.status,
                authState: result.value.state.authState,
                state: result.value.state,
            }),
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
            payload: buildProviderAuthCancelledEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                flowId: input.flowId,
                state: result.value.state,
            }),
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
            payload: buildProviderAuthRefreshedEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                authState: stateResult.value.authState,
                state: stateResult.value,
            }),
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

            const readback = await readProviderMutationState({
                profileId: input.profileId,
                providerId: input.providerId,
            });

            await emitProviderUpsertEvent({
                providerId: input.providerId,
                eventType: 'provider.endpoint-profile.set',
                payload: buildProviderConnectionProfileSetEventPayload({
                    profileId: input.profileId,
                    providerId: input.providerId,
                    value: connectionProfileResult.value.optionProfileId,
                    connectionProfile: connectionProfileResult.value,
                    defaults: readback.defaults,
                    models: readback.models,
                    ...(readback.provider ? { provider: readback.provider } : {}),
                }),
            });

            return buildProviderConnectionProfileMutationReadback({
                connectionProfile: connectionProfileResult.value,
                defaults: readback.defaults,
                models: readback.models,
                ...(readback.provider ? { provider: readback.provider } : {}),
            });
        }),
    setExecutionPreference: publicProcedure
        .input(providerSetExecutionPreferenceInputSchema)
        .mutation(async ({ input }) => {
            const executionPreferenceResult = await providerManagementService.setExecutionPreference(
                input.profileId,
                input.providerId,
                input.mode
            );
            if (executionPreferenceResult.isErr()) {
                throwWithCode(executionPreferenceResult.error.code, executionPreferenceResult.error.message);
            }

            const readback = await readProviderMutationState({
                profileId: input.profileId,
                providerId: input.providerId,
                includeDefaults: false,
                includeModels: false,
            });
            await emitProviderUpsertEvent({
                providerId: input.providerId,
                eventType: 'provider.execution-preference.set',
                payload: buildProviderExecutionPreferenceSetEventPayload({
                    profileId: input.profileId,
                    providerId: input.providerId,
                    executionPreference: executionPreferenceResult.value,
                    ...(readback.provider ? { provider: readback.provider } : {}),
                }),
            });

            return buildProviderExecutionPreferenceMutationReadback({
                executionPreference: executionPreferenceResult.value,
                ...(readback.provider ? { provider: readback.provider } : {}),
            });
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

        const readback = await readProviderMutationState({
            profileId: input.profileId,
            providerId: input.providerId,
            includeAuthState: true,
        });

        await emitProviderUpsertEvent({
            providerId: input.providerId,
            eventType: 'provider.organization.set',
            payload: buildProviderOrganizationSetEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                organizationId: input.organizationId ?? null,
                accountContext: result.value,
                authState: readback.authState!,
                defaults: readback.defaults,
                models: readback.models,
                ...(readback.provider ? { provider: readback.provider } : {}),
            }),
        });

        return buildProviderOrganizationMutationReadback({
            accountContext: result.value,
            authState: readback.authState!,
            defaults: readback.defaults,
            models: readback.models,
            ...(readback.provider ? { provider: readback.provider } : {}),
        });
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
            payload: buildProviderKiloRoutingSetEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                modelId: input.modelId,
                preference,
                providers: providers.value,
            }),
        });

        return buildProviderModelRoutingPreferenceMutationReadback({
            preference,
            providers: providers.value,
        });
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
            payload: buildProviderApiKeySetEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                state: stateResult.value,
            }),
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
            payload: buildProviderAuthClearedEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                state: clearResult.value.authState,
            }),
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

        const readback = await readProviderMutationState({
            profileId: input.profileId,
            providerId: input.providerId,
        });
        const emptyCatalogState =
            readback.models.length === 0 ? await resolveEmptyCatalogState(input.profileId, input.providerId) : null;

        await emitProviderSyncEvent({
            providerId: input.providerId,
            eventType: 'provider.catalog.sync',
            payload: buildProviderSyncEventPayload({
                profileId: input.profileId,
                providerId: input.providerId,
                syncResult: result.value,
                defaults: readback.defaults,
                models: readback.models,
                ...(readback.provider ? { provider: readback.provider } : {}),
                ...(emptyCatalogState ? { emptyCatalogState } : {}),
            }),
        });

        return buildProviderSyncMutationReadback({
            syncResult: result.value,
            defaults: readback.defaults,
            models: readback.models,
            ...(readback.provider ? { provider: readback.provider } : {}),
            ...(emptyCatalogState ? { emptyCatalogState } : {}),
        });
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
    setSpecialistDefault: publicProcedure.input(providerSetSpecialistDefaultInputSchema).mutation(async ({ input }) => {
        const result = await providerManagementService.setSpecialistDefault(input);

        if (result.success) {
            await emitProviderUpsertEvent({
                providerId: input.providerId,
                eventType: 'provider.specialist-default-set',
                payload: {
                    profileId: input.profileId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                    providerId: input.providerId,
                    modelId: input.modelId,
                    specialistDefaults: result.specialistDefaults,
                },
            });
        }

        return result;
    }),
};

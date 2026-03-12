import { providerManagementService } from '@/app/backend/providers/service';
import {
    providerByIdInputSchema,
    providerGetCredentialInputSchema,
    providerGetAccountContextInputSchema,
    providerGetConnectionProfileInputSchema,
    providerGetModelRoutingPreferenceInputSchema,
    providerListAuthMethodsInputSchema,
    providerListModelProvidersInputSchema,
    providerListModelsInputSchema,
    providerListProvidersInputSchema,
} from '@/app/backend/runtime/contracts';
import { publicProcedure } from '@/app/backend/trpc/init';
import { isProviderNotFoundCode, mapAuthErrorToOperationalCode, throwWithCode } from '@/app/backend/trpc/routers/provider/shared';

export const providerQueryProcedures = {
    listProviders: publicProcedure.input(providerListProvidersInputSchema).query(async ({ input }) => {
        return { providers: await providerManagementService.listProviders(input.profileId) };
    }),
    getDefaults: publicProcedure.input(providerListProvidersInputSchema).query(async ({ input }) => {
        return {
            defaults: await providerManagementService.getDefaults(input.profileId),
        };
    }),
    getUsageSummary: publicProcedure.input(providerListProvidersInputSchema).query(async ({ input }) => {
        return { summaries: await providerManagementService.listUsageSummaries(input.profileId) };
    }),
    getOpenAISubscriptionUsage: publicProcedure.input(providerListProvidersInputSchema).query(async ({ input }) => {
        return { usage: await providerManagementService.getOpenAISubscriptionUsage(input.profileId) };
    }),
    getOpenAISubscriptionRateLimits: publicProcedure
        .input(providerListProvidersInputSchema)
        .query(async ({ input }) => {
            return { rateLimits: await providerManagementService.getOpenAISubscriptionRateLimits(input.profileId) };
        }),
    listModels: publicProcedure.input(providerListModelsInputSchema).query(async ({ input }) => {
        const modelsResult = await providerManagementService.listModels(input.profileId, input.providerId);
        if (modelsResult.isErr()) {
            if (isProviderNotFoundCode(modelsResult.error.code)) {
                return { models: [], reason: 'provider_not_found' as const };
            }

            throwWithCode(modelsResult.error.code, modelsResult.error.message);
        }

        return {
            models: modelsResult.value,
            reason: null,
        };
    }),
    listAuthMethods: publicProcedure.input(providerListAuthMethodsInputSchema).query(({ input }) => {
        return {
            methods: providerManagementService.listAuthMethods(input.profileId),
        };
    }),
    getAuthState: publicProcedure.input(providerByIdInputSchema).query(async ({ input }) => {
        const state = await providerManagementService.getAuthState(input.profileId, input.providerId);
        return {
            found: true as const,
            state,
        };
    }),
    getCredentialSummary: publicProcedure.input(providerGetCredentialInputSchema).query(async ({ input }) => {
        const result = await providerManagementService.getCredentialSummary(input.profileId, input.providerId);
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        return {
            credential: result.value,
        };
    }),
    getCredentialValue: publicProcedure.input(providerGetCredentialInputSchema).query(async ({ input }) => {
        const result = await providerManagementService.getCredentialValue(input.profileId, input.providerId);
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        return {
            credential: result.value,
        };
    }),
    getAccountContext: publicProcedure.input(providerGetAccountContextInputSchema).query(async ({ input }) => {
        const result = await providerManagementService.getAccountContext(input.profileId, input.providerId);
        if (result.isErr()) {
            throwWithCode(mapAuthErrorToOperationalCode(result.error.code), result.error.message);
        }

        return result.value;
    }),
    getConnectionProfile: publicProcedure.input(providerGetConnectionProfileInputSchema).query(async ({ input }) => {
        const connectionProfileResult = await providerManagementService.getConnectionProfile(
            input.profileId,
            input.providerId
        );
        if (connectionProfileResult.isErr()) {
            throwWithCode(connectionProfileResult.error.code, connectionProfileResult.error.message);
        }

        return {
            connectionProfile: connectionProfileResult.value,
        };
    }),
    getModelRoutingPreference: publicProcedure
        .input(providerGetModelRoutingPreferenceInputSchema)
        .query(async ({ input }) => {
            const result = await providerManagementService.getModelRoutingPreference(input);
            if (result.isErr()) {
                throwWithCode(result.error.code, result.error.message);
            }

            return {
                preference: result.value,
            };
        }),
    listModelProviders: publicProcedure.input(providerListModelProvidersInputSchema).query(async ({ input }) => {
        const result = await providerManagementService.listModelProviders(input);
        if (result.isErr()) {
            throwWithCode(result.error.code, result.error.message);
        }

        return {
            providers: result.value,
        };
    }),
};

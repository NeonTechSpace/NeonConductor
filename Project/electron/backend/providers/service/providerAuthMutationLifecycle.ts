import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import type { AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import type { PollAuthResult } from '@/app/backend/providers/auth/types';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import {
    applyProviderCatalogInvalidationDecision,
    providerCatalogInvalidationActions,
    providerCatalogInvalidationPolicy,
} from '@/app/backend/providers/service/providerCatalogInvalidationPolicy';
import { providerProfileNormalizationGate } from '@/app/backend/providers/service/providerProfileNormalizationGate';
import type { ProviderMutationContext } from '@/app/backend/providers/service/providerMutationLifecycle.types';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

export function createProviderAuthMutationLifecycle(input = {
    ensureNormalizedProviderProfileState: providerProfileNormalizationGate.ensureNormalized.bind(
        providerProfileNormalizationGate
    ),
    authExecutionGateway: {
        setApiKey: providerAuthExecutionService.setApiKey.bind(providerAuthExecutionService),
        clearAuth: providerAuthExecutionService.clearAuth.bind(providerAuthExecutionService),
        startAuth: providerAuthExecutionService.startAuth.bind(providerAuthExecutionService),
        pollAuth: providerAuthExecutionService.pollAuth.bind(providerAuthExecutionService),
        completeAuth: providerAuthExecutionService.completeAuth.bind(providerAuthExecutionService),
        cancelAuth: providerAuthExecutionService.cancelAuth.bind(providerAuthExecutionService),
        refreshAuth: providerAuthExecutionService.refreshAuth.bind(providerAuthExecutionService),
        getAccountContext: providerAuthExecutionService.getAccountContext.bind(providerAuthExecutionService),
    },
    catalogInvalidationPolicy: providerCatalogInvalidationPolicy,
    catalogInvalidationActions: providerCatalogInvalidationActions,
}) {
    return {
        async setApiKey(
            profileId: string,
            providerId: RuntimeProviderId,
            apiKey: string,
            context?: ProviderMutationContext
        ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
            await input.ensureNormalizedProviderProfileState(profileId);
            const result = await input.authExecutionGateway.setApiKey(profileId, providerId, apiKey, context);
            if (result.isOk()) {
                await applyProviderCatalogInvalidationDecision(
                    input.catalogInvalidationActions,
                    input.catalogInvalidationPolicy.resolveAuthMutation(profileId, providerId)
                );
            }

            return result;
        },

        async clearAuth(
            profileId: string,
            providerId: RuntimeProviderId,
            context?: ProviderMutationContext
        ): Promise<AuthExecutionResult<{ cleared: boolean; authState: ProviderAuthStateRecord }>> {
            await input.ensureNormalizedProviderProfileState(profileId);
            const result = await input.authExecutionGateway.clearAuth(profileId, providerId, context);
            if (result.isOk()) {
                await applyProviderCatalogInvalidationDecision(
                    input.catalogInvalidationActions,
                    input.catalogInvalidationPolicy.resolveAuthMutation(profileId, providerId)
                );
            }

            return result;
        },

        async startAuth(
            authInput: { profileId: string; providerId: RuntimeProviderId; method: ProviderAuthMethod },
            context?: ProviderMutationContext
        ) {
            await input.ensureNormalizedProviderProfileState(authInput.profileId);
            return input.authExecutionGateway.startAuth(authInput, context);
        },

        async pollAuth(
            authInput: { profileId: string; providerId: RuntimeProviderId; flowId: string },
            context?: ProviderMutationContext
        ): Promise<AuthExecutionResult<PollAuthResult>> {
            await input.ensureNormalizedProviderProfileState(authInput.profileId);
            const result = await input.authExecutionGateway.pollAuth(authInput, context);
            if (result.isOk()) {
                await applyProviderCatalogInvalidationDecision(
                    input.catalogInvalidationActions,
                    input.catalogInvalidationPolicy.resolveAuthPoll(result.value.state)
                );
            }

            return result;
        },

        async completeAuth(
            authInput: { profileId: string; providerId: RuntimeProviderId; flowId: string; code?: string },
            context?: ProviderMutationContext
        ): Promise<AuthExecutionResult<PollAuthResult>> {
            await input.ensureNormalizedProviderProfileState(authInput.profileId);
            const result = await input.authExecutionGateway.completeAuth(authInput, context);
            if (result.isOk()) {
                await applyProviderCatalogInvalidationDecision(
                    input.catalogInvalidationActions,
                    input.catalogInvalidationPolicy.resolveAuthMutation(authInput.profileId, authInput.providerId)
                );
            }

            return result;
        },

        async cancelAuth(
            authInput: { profileId: string; providerId: RuntimeProviderId; flowId: string },
            context?: ProviderMutationContext
        ) {
            await input.ensureNormalizedProviderProfileState(authInput.profileId);
            return input.authExecutionGateway.cancelAuth(authInput, context);
        },

        async refreshAuth(
            profileId: string,
            providerId: RuntimeProviderId,
            context?: ProviderMutationContext
        ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
            await input.ensureNormalizedProviderProfileState(profileId);
            const result = await input.authExecutionGateway.refreshAuth(profileId, providerId, context);
            if (result.isOk()) {
                await applyProviderCatalogInvalidationDecision(
                    input.catalogInvalidationActions,
                    input.catalogInvalidationPolicy.resolveAuthMutation(profileId, providerId)
                );
            }

            return result;
        },

        async getAccountContext(profileId: string, providerId: RuntimeProviderId) {
            await input.ensureNormalizedProviderProfileState(profileId);
            return input.authExecutionGateway.getAccountContext(profileId, providerId);
        },
    };
}

export const providerAuthMutationLifecycle = createProviderAuthMutationLifecycle();

export const {
    setApiKey: setProviderApiKey,
    clearAuth: clearProviderAuth,
    startAuth: startProviderAuth,
    pollAuth: pollProviderAuth,
    completeAuth: completeProviderAuth,
    cancelAuth: cancelProviderAuth,
    refreshAuth: refreshProviderAuth,
    getAccountContext: getProviderAccountContext,
} = providerAuthMutationLifecycle;

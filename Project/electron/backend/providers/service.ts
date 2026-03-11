import { providerStore } from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import type { ProviderAccountContextResult, PollAuthResult, StartAuthResult } from '@/app/backend/providers/auth/types';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { syncCatalog } from '@/app/backend/providers/service/catalogSync';
import { getEndpointProfileState, setEndpointProfileState } from '@/app/backend/providers/service/endpointProfiles';
import { errProviderService, type ProviderServiceResult } from '@/app/backend/providers/service/errors';
import {
    getModelRoutingPreference,
    listModelProviders,
    setModelRoutingPreference,
} from '@/app/backend/providers/service/kiloRoutingService';
import {
    getCredentialSummary,
    getCredentialValue,
    getOpenAISubscriptionRateLimits,
    getOpenAISubscriptionUsage,
    listAuthStates,
    listDiscoverySnapshots,
    listModelsByProfile,
    getDefaults,
    listModels,
    listProviders,
    listUsageSummaries,
    setDefault,
} from '@/app/backend/providers/service/readService';
import type {
    ProviderCredentialSummaryResult,
    ProviderCredentialValueResult,
    KiloModelProviderOption,
    ProviderEndpointProfileResult,
    ProviderListItem,
    ProviderSyncResult,
} from '@/app/backend/providers/service/types';
import type {
    KiloModelRoutingPreference,
    ProviderAuthMethod,
    ProviderGetModelRoutingPreferenceInput,
    ProviderListModelProvidersInput,
    ProviderSetModelRoutingPreferenceInput,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';

class ProviderManagementService {
    async listProviders(profileId: string): Promise<ProviderListItem[]> {
        return listProviders(profileId);
    }

    async listModels(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderModelRecord[]>> {
        return listModels(profileId, providerId);
    }

    async listModelsByProfile(profileId: string) {
        return listModelsByProfile(profileId);
    }

    async getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
        return getDefaults(profileId);
    }

    async setDefault(profileId: string, providerId: RuntimeProviderId, modelId: string) {
        return setDefault(profileId, providerId, modelId);
    }

    async getAuthState(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
        return providerAuthExecutionService.getAuthState(profileId, providerId);
    }

    async getCredentialSummary(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderCredentialSummaryResult>> {
        return getCredentialSummary(profileId, providerId);
    }

    async getCredentialValue(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderCredentialValueResult>> {
        return getCredentialValue(profileId, providerId);
    }

    async listAuthStates(profileId: string) {
        return listAuthStates(profileId);
    }

    async listDiscoverySnapshots(profileId: string) {
        return listDiscoverySnapshots(profileId);
    }

    async listUsageSummaries(profileId: string) {
        return listUsageSummaries(profileId);
    }

    async getOpenAISubscriptionUsage(profileId: string) {
        return getOpenAISubscriptionUsage(profileId);
    }

    async getOpenAISubscriptionRateLimits(profileId: string) {
        return getOpenAISubscriptionRateLimits(profileId);
    }

    listAuthMethods(profileId: string) {
        return providerAuthExecutionService.listAuthMethods(profileId);
    }

    async setApiKey(
        profileId: string,
        providerId: RuntimeProviderId,
        apiKey: string,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
        return providerAuthExecutionService.setApiKey(profileId, providerId, apiKey, context);
    }

    async clearAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<{ cleared: boolean; authState: ProviderAuthStateRecord }>> {
        return providerAuthExecutionService.clearAuth(profileId, providerId, context);
    }

    async startAuth(
        input: { profileId: string; providerId: RuntimeProviderId; method: ProviderAuthMethod },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<StartAuthResult>> {
        return providerAuthExecutionService.startAuth(input, context);
    }

    async pollAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return providerAuthExecutionService.pollAuth(input, context);
    }

    async completeAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string; code?: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return providerAuthExecutionService.completeAuth(input, context);
    }

    async cancelAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return providerAuthExecutionService.cancelAuth(input, context);
    }

    async refreshAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
        return providerAuthExecutionService.refreshAuth(profileId, providerId, context);
    }

    async getAccountContext(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        return providerAuthExecutionService.getAccountContext(profileId, providerId);
    }

    async getEndpointProfile(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderEndpointProfileResult>> {
        return getEndpointProfileState(profileId, providerId);
    }

    async setEndpointProfile(
        profileId: string,
        providerId: RuntimeProviderId,
        value: string,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<ProviderServiceResult<ProviderEndpointProfileResult>> {
        const stateResult = await setEndpointProfileState(profileId, providerId, value);
        if (stateResult.isErr()) {
            return stateResult;
        }

        const syncResult = await syncCatalog(profileId, providerId, true, context);
        if (syncResult.isErr()) {
            return errProviderService(syncResult.error.code, syncResult.error.message);
        }

        const [defaults, models] = await Promise.all([
            providerStore.getDefaults(profileId),
            providerStore.listModels(profileId, providerId),
        ]);
        if (defaults.providerId === providerId && models.length > 0) {
            const exists = models.some((model) => model.id === defaults.modelId);
            if (!exists) {
                const firstModel = models[0];
                if (firstModel) {
                    await providerStore.setDefaults(profileId, providerId, firstModel.id);
                }
            }
        }

        return stateResult;
    }

    async setOrganization(
        profileId: string,
        providerId: 'kilo',
        organizationId?: string | null
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        return providerAuthExecutionService.setOrganization(profileId, providerId, organizationId);
    }

    async syncCatalog(
        profileId: string,
        providerId: RuntimeProviderId,
        force = false,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<ProviderServiceResult<ProviderSyncResult>> {
        return syncCatalog(profileId, providerId, force, context);
    }

    async getModelRoutingPreference(
        input: ProviderGetModelRoutingPreferenceInput
    ): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
        return getModelRoutingPreference(input);
    }

    async setModelRoutingPreference(
        input: ProviderSetModelRoutingPreferenceInput
    ): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
        return setModelRoutingPreference(input);
    }

    async listModelProviders(input: ProviderListModelProvidersInput): Promise<ProviderServiceResult<KiloModelProviderOption[]>> {
        return listModelProviders(input);
    }
}

export const providerManagementService = new ProviderManagementService();
export type { ProviderListItem, ProviderSyncResult } from '@/app/backend/providers/service/types';

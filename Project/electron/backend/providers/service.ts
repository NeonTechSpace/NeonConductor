import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { syncCatalog } from '@/app/backend/providers/service/catalogSync';
import {
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
import type { ProviderListItem, ProviderSyncResult } from '@/app/backend/providers/service/types';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

class ProviderManagementService {
    async listProviders(profileId: string): Promise<ProviderListItem[]> {
        return listProviders(profileId);
    }

    async listModels(profileId: string, providerId: RuntimeProviderId) {
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

    async setApiKey(profileId: string, providerId: RuntimeProviderId, apiKey: string) {
        return providerAuthExecutionService.setApiKey(profileId, providerId, apiKey);
    }

    async clearAuth(profileId: string, providerId: RuntimeProviderId) {
        return providerAuthExecutionService.clearAuth(profileId, providerId);
    }

    async startAuth(input: { profileId: string; providerId: RuntimeProviderId; method: ProviderAuthMethod }) {
        return providerAuthExecutionService.startAuth(input);
    }

    async pollAuth(input: { profileId: string; providerId: RuntimeProviderId; flowId: string }) {
        return providerAuthExecutionService.pollAuth(input);
    }

    async completeAuth(input: { profileId: string; providerId: RuntimeProviderId; flowId: string; code?: string }) {
        return providerAuthExecutionService.completeAuth(input);
    }

    async cancelAuth(input: { profileId: string; providerId: RuntimeProviderId; flowId: string }) {
        return providerAuthExecutionService.cancelAuth(input);
    }

    async refreshAuth(profileId: string, providerId: RuntimeProviderId) {
        return providerAuthExecutionService.refreshAuth(profileId, providerId);
    }

    async getAccountContext(profileId: string, providerId: RuntimeProviderId) {
        return providerAuthExecutionService.getAccountContext(profileId, providerId);
    }

    async setOrganization(profileId: string, providerId: 'kilo', organizationId?: string | null) {
        return providerAuthExecutionService.setOrganization(profileId, providerId, organizationId);
    }

    async syncCatalog(profileId: string, providerId: RuntimeProviderId, force = false): Promise<ProviderSyncResult> {
        return syncCatalog(profileId, providerId, force);
    }
}

export const providerManagementService = new ProviderManagementService();
export type { ProviderListItem, ProviderSyncResult } from '@/app/backend/providers/service/types';

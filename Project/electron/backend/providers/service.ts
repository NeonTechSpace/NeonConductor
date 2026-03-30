import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import type { ProviderAccountContextResult, PollAuthResult, StartAuthResult } from '@/app/backend/providers/auth/types';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { getConnectionProfileState } from '@/app/backend/providers/service/endpointProfiles';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import {
    getExecutionPreferenceState,
    setExecutionPreferenceState,
} from '@/app/backend/providers/service/executionPreferences';
import {
    getModelRoutingPreference,
    listModelProviders,
    setModelRoutingPreference,
} from '@/app/backend/providers/service/kiloRoutingService';
import {
    getDefaults,
    getSpecialistDefaults,
    setDefault,
    setSpecialistDefault,
} from '@/app/backend/providers/service/preferenceService';
import {
    cancelProviderAuth,
    clearProviderAuth,
    completeProviderAuth,
    getProviderAccountContext,
    pollProviderAuth,
    refreshProviderAuth,
    startProviderAuth,
    setProviderApiKey,
} from '@/app/backend/providers/service/providerAuthMutationLifecycle';
import { syncProviderCatalog } from '@/app/backend/providers/service/providerCatalogSyncMutationLifecycle';
import { setProviderConnectionProfile } from '@/app/backend/providers/service/providerConnectionProfileMutationLifecycle';
import { setProviderOrganization } from '@/app/backend/providers/service/providerOrganizationMutationLifecycle';
import { providerProfileNormalizationGate } from '@/app/backend/providers/service/providerProfileNormalizationGate';
import { getProviderControlSnapshot } from '@/app/backend/providers/service/projectionService';
import {
    getCredentialSummary,
    getCredentialValue,
    getOpenAISubscriptionRateLimits,
    getOpenAISubscriptionUsage,
    listAuthStates,
    listDiscoverySnapshots,
    listModelsByProfile,
    listModels,
    listProviders,
    listUsageSummaries,
} from '@/app/backend/providers/service/readService';
import type {
    ProviderControlSnapshot,
    ProviderCredentialSummaryResult,
    ProviderCredentialValueResult,
    KiloModelProviderOption,
    ProviderConnectionProfileResult,
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
    private async ensureNormalizedProviderProfileState(profileId: string): Promise<void> {
        await providerProfileNormalizationGate.ensureNormalized(profileId);
    }

    async listProviders(profileId: string): Promise<ProviderListItem[]> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return listProviders(profileId);
    }

    async listModels(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderModelRecord[]>> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return listModels(profileId, providerId);
    }

    async listModelsByProfile(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return listModelsByProfile(profileId);
    }

    async getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getDefaults(profileId);
    }

    async getControlPlane(profileId: string): Promise<ProviderServiceResult<ProviderControlSnapshot>> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getProviderControlSnapshot(profileId);
    }

    async setDefault(profileId: string, providerId: RuntimeProviderId, modelId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return setDefault(profileId, providerId, modelId);
    }

    async getSpecialistDefaults(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getSpecialistDefaults(profileId);
    }

    async setSpecialistDefault(input: {
        profileId: string;
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: RuntimeProviderId;
        modelId: string;
    }) {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return setSpecialistDefault(input);
    }

    async getAuthState(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return providerAuthExecutionService.getAuthState(profileId, providerId);
    }

    async getCredentialSummary(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderCredentialSummaryResult>> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getCredentialSummary(profileId, providerId);
    }

    async getCredentialValue(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderCredentialValueResult>> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getCredentialValue(profileId, providerId);
    }

    async listAuthStates(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return listAuthStates(profileId);
    }

    async listDiscoverySnapshots(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return listDiscoverySnapshots(profileId);
    }

    async listUsageSummaries(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return listUsageSummaries(profileId);
    }

    async getOpenAISubscriptionUsage(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getOpenAISubscriptionUsage(profileId);
    }

    async getOpenAISubscriptionRateLimits(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
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
        return setProviderApiKey(profileId, providerId, apiKey, context);
    }

    async clearAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<{ cleared: boolean; authState: ProviderAuthStateRecord }>> {
        return clearProviderAuth(profileId, providerId, context);
    }

    async startAuth(
        input: { profileId: string; providerId: RuntimeProviderId; method: ProviderAuthMethod },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<StartAuthResult>> {
        return startProviderAuth(input, context);
    }

    async pollAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return pollProviderAuth(input, context);
    }

    async completeAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string; code?: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return completeProviderAuth(input, context);
    }

    async cancelAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return cancelProviderAuth(input, context);
    }

    async refreshAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
        return refreshProviderAuth(profileId, providerId, context);
    }

    async getAccountContext(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        return getProviderAccountContext(profileId, providerId);
    }

    async getConnectionProfile(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderConnectionProfileResult>> {
        await this.ensureNormalizedProviderProfileState(profileId);
        const stateResult = await getConnectionProfileState(profileId, providerId);
        if (stateResult.isErr()) {
            return errProviderService(stateResult.error.code, stateResult.error.message);
        }

        const authState = await providerAuthExecutionService.getAuthState(profileId, providerId);
        return okProviderService({
            ...stateResult.value,
            ...(authState.organizationId ? { organizationId: authState.organizationId } : {}),
        });
    }

    async getExecutionPreference(profileId: string, providerId: RuntimeProviderId) {
        await this.ensureNormalizedProviderProfileState(profileId);
        if (providerId !== 'openai') {
            return errProviderService(
                'invalid_payload',
                `Provider "${providerId}" does not support execution mode overrides.`
            );
        }

        return getExecutionPreferenceState(profileId, 'openai');
    }

    async setExecutionPreference(
        profileId: string,
        providerId: RuntimeProviderId,
        mode: import('@/app/backend/runtime/contracts').OpenAIExecutionMode
    ) {
        await this.ensureNormalizedProviderProfileState(profileId);
        if (providerId !== 'openai') {
            return errProviderService(
                'invalid_payload',
                `Provider "${providerId}" does not support execution mode overrides.`
            );
        }

        return setExecutionPreferenceState(profileId, 'openai', mode);
    }

    async setConnectionProfile(
        profileId: string,
        providerId: RuntimeProviderId,
        input: {
            optionProfileId: string;
            baseUrlOverride?: string | null;
            organizationId?: string | null;
        },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<ProviderServiceResult<ProviderConnectionProfileResult>> {
        const result = await setProviderConnectionProfile(profileId, providerId, input, context);
        if (result.isErr()) {
            return errProviderService(result.error.code, result.error.message);
        }

        return result.map((value) => value.connectionProfile);
    }

    async setOrganization(
        profileId: string,
        providerId: 'kilo',
        organizationId?: string | null
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        const result = await setProviderOrganization(profileId, providerId, organizationId);
        return result.map((value) => value.accountContext);
    }

    async syncCatalog(
        profileId: string,
        providerId: RuntimeProviderId,
        force = false,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<ProviderServiceResult<ProviderSyncResult>> {
        return syncProviderCatalog(profileId, providerId, force, context);
    }

    async getModelRoutingPreference(
        input: ProviderGetModelRoutingPreferenceInput
    ): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return getModelRoutingPreference(input);
    }

    async setModelRoutingPreference(
        input: ProviderSetModelRoutingPreferenceInput
    ): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return setModelRoutingPreference(input);
    }

    async listModelProviders(
        input: ProviderListModelProvidersInput
    ): Promise<ProviderServiceResult<KiloModelProviderOption[]>> {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return listModelProviders(input);
    }
}

export const providerManagementService = new ProviderManagementService();
export type { ProviderListItem, ProviderSyncResult } from '@/app/backend/providers/service/types';

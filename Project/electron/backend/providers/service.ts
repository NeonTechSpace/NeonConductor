import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import type { ProviderAccountContextResult, PollAuthResult, StartAuthResult } from '@/app/backend/providers/auth/types';
import {
    getKiloCloudSessionPrerequisites,
    refreshKiloAccountContext,
} from '@/app/backend/providers/cloudSessions/kiloCloudSessionPrerequisites';
import { providerEmbeddingCatalogService } from '@/app/backend/providers/embeddingCatalog/service';
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
    getWorkflowRoutingPreferences,
    getSpecialistDefaults,
    setWorkflowRoutingPreference,
    setDefault,
    clearWorkflowRoutingPreference,
    setSpecialistDefault,
} from '@/app/backend/providers/service/preferenceService';
import { modelRoleDefaultService } from '@/app/backend/runtime/services/profile/modelRoleDefaults';
import { getProviderControlSnapshot } from '@/app/backend/providers/service/projectionService';
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
    ProviderEmbeddingControlSnapshot,
    ProviderCredentialSummaryResult,
    ProviderCredentialValueResult,
    KiloModelProviderOption,
    ProviderConnectionProfileResult,
    ProviderListItem,
    ProviderSyncResult,
} from '@/app/backend/providers/service/types';
import type {
    KiloCloudSessionPrerequisites,
    KiloModelRoutingPreference,
    ProviderAuthMethod,
    ProviderGetModelRoutingPreferenceInput,
    ProviderListModelProvidersInput,
    ProviderSetModelRoutingPreferenceInput,
    ProviderSetWorkflowRoutingPreferenceInput,
    ProviderSetModelRoleDefaultInput,
    ProviderClearModelRoleDefaultInput,
    ProviderClearWorkflowRoutingPreferenceInput,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import type { WorkflowRoutingPreferenceRecord } from '@/app/backend/runtime/contracts/types/provider';

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

    async getWorkflowRoutingPreferences(profileId: string): Promise<WorkflowRoutingPreferenceRecord[]> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getWorkflowRoutingPreferences(profileId);
    }

    async getControlPlane(profileId: string): Promise<ProviderServiceResult<ProviderControlSnapshot>> {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getProviderControlSnapshot(profileId);
    }

    async getEmbeddingControlPlane(
        profileId: string
    ): Promise<ProviderServiceResult<ProviderEmbeddingControlSnapshot>> {
        return providerEmbeddingCatalogService.getControlPlane(profileId);
    }

    async setDefault(profileId: string, providerId: RuntimeProviderId, modelId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return setDefault(profileId, providerId, modelId);
    }

    async getSpecialistDefaults(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return getSpecialistDefaults(profileId);
    }

    async getModelRoleDefaults(profileId: string) {
        await this.ensureNormalizedProviderProfileState(profileId);
        return modelRoleDefaultService.listRoleDefaults(profileId);
    }

    async setModelRoleDefault(input: ProviderSetModelRoleDefaultInput) {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return modelRoleDefaultService.setRoleDefault(input);
    }

    async clearModelRoleDefault(input: ProviderClearModelRoleDefaultInput) {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return modelRoleDefaultService.clearRoleDefault(input);
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

    async setWorkflowRoutingPreference(input: ProviderSetWorkflowRoutingPreferenceInput) {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return setWorkflowRoutingPreference(input);
    }

    async clearWorkflowRoutingPreference(input: ProviderClearWorkflowRoutingPreferenceInput) {
        await this.ensureNormalizedProviderProfileState(input.profileId);
        return clearWorkflowRoutingPreference(input);
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

    async listEmbeddingModels(profileId: string, providerId: RuntimeProviderId) {
        return providerEmbeddingCatalogService.listModels(profileId, providerId);
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

    async getCloudSessionPrerequisites(
        profileId: string,
        providerId: 'kilo'
    ): Promise<ProviderServiceResult<KiloCloudSessionPrerequisites>> {
        void providerId;
        await this.ensureNormalizedProviderProfileState(profileId);
        return getKiloCloudSessionPrerequisites(profileId);
    }

    async refreshAccountContext(
        profileId: string,
        providerId: 'kilo'
    ): Promise<ProviderServiceResult<KiloCloudSessionPrerequisites>> {
        void providerId;
        await this.ensureNormalizedProviderProfileState(profileId);
        return refreshKiloAccountContext(profileId);
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

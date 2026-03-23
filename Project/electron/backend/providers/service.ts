import { providerStore } from '@/app/backend/persistence/stores';
import { normalizeOpenAIBoundaryForProfile } from '@/app/backend/providers/openAIBoundaryNormalization';
import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import type { ProviderAccountContextResult, PollAuthResult, StartAuthResult } from '@/app/backend/providers/auth/types';
import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { getProviderDefinition } from '@/app/backend/providers/registry';
import {
    getExecutionPreferenceState,
    setExecutionPreferenceState,
} from '@/app/backend/providers/service/executionPreferences';
import { syncCatalog } from '@/app/backend/providers/service/catalogSync';
import { getConnectionProfileState, setConnectionProfileState } from '@/app/backend/providers/service/endpointProfiles';
import { errProviderService, okProviderService, type ProviderServiceResult } from '@/app/backend/providers/service/errors';
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
    getSpecialistDefaults,
    listAuthStates,
    listDiscoverySnapshots,
    listModelsByProfile,
    getDefaults,
    listModels,
    listProviders,
    listUsageSummaries,
    setDefault,
    setSpecialistDefault,
} from '@/app/backend/providers/service/readService';
import type {
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
    private readonly openAIBoundaryNormalization = new Map<string, Promise<void>>();

    private async ensureOpenAIBoundaryNormalized(profileId: string): Promise<void> {
        const inFlight = this.openAIBoundaryNormalization.get(profileId);
        if (inFlight) {
            return inFlight;
        }

        const normalization = normalizeOpenAIBoundaryForProfile(profileId);
        this.openAIBoundaryNormalization.set(profileId, normalization);
        try {
            await normalization;
        } finally {
            this.openAIBoundaryNormalization.delete(profileId);
        }
    }

    private async invalidateCatalogAfterAuthMutation(profileId: string, providerId: RuntimeProviderId): Promise<void> {
        if (providerId === 'kilo') {
            await providerMetadataOrchestrator.invalidateProviderScope(profileId, providerId);
            return;
        }

        await providerMetadataOrchestrator.flushProviderScope(profileId, providerId);
    }

    async listProviders(profileId: string): Promise<ProviderListItem[]> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return listProviders(profileId);
    }

    async listModels(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderModelRecord[]>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return listModels(profileId, providerId);
    }

    async listModelsByProfile(profileId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return listModelsByProfile(profileId);
    }

    async getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return getDefaults(profileId);
    }

    async setDefault(profileId: string, providerId: RuntimeProviderId, modelId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return setDefault(profileId, providerId, modelId);
    }

    async getSpecialistDefaults(profileId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return getSpecialistDefaults(profileId);
    }

    async setSpecialistDefault(input: {
        profileId: string;
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: RuntimeProviderId;
        modelId: string;
    }) {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        return setSpecialistDefault(input);
    }

    async getAuthState(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return providerAuthExecutionService.getAuthState(profileId, providerId);
    }

    async getCredentialSummary(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderCredentialSummaryResult>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return getCredentialSummary(profileId, providerId);
    }

    async getCredentialValue(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderCredentialValueResult>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return getCredentialValue(profileId, providerId);
    }

    async listAuthStates(profileId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return listAuthStates(profileId);
    }

    async listDiscoverySnapshots(profileId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return listDiscoverySnapshots(profileId);
    }

    async listUsageSummaries(profileId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return listUsageSummaries(profileId);
    }

    async getOpenAISubscriptionUsage(profileId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return getOpenAISubscriptionUsage(profileId);
    }

    async getOpenAISubscriptionRateLimits(profileId: string) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
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
        await this.ensureOpenAIBoundaryNormalized(profileId);
        const result = await providerAuthExecutionService.setApiKey(profileId, providerId, apiKey, context);
        if (result.isOk()) {
            await this.invalidateCatalogAfterAuthMutation(profileId, providerId);
        }

        return result;
    }

    async clearAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<{ cleared: boolean; authState: ProviderAuthStateRecord }>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        const result = await providerAuthExecutionService.clearAuth(profileId, providerId, context);
        if (result.isOk()) {
            await this.invalidateCatalogAfterAuthMutation(profileId, providerId);
        }

        return result;
    }

    async startAuth(
        input: { profileId: string; providerId: RuntimeProviderId; method: ProviderAuthMethod },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<StartAuthResult>> {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        return providerAuthExecutionService.startAuth(input, context);
    }

    async pollAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        const result = await providerAuthExecutionService.pollAuth(input, context);
        if (result.isOk() && result.value.state.authState !== 'pending') {
            await this.invalidateCatalogAfterAuthMutation(input.profileId, input.providerId);
        }

        return result;
    }

    async completeAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string; code?: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        const result = await providerAuthExecutionService.completeAuth(input, context);
        if (result.isOk()) {
            await this.invalidateCatalogAfterAuthMutation(input.profileId, input.providerId);
        }

        return result;
    }

    async cancelAuth(
        input: { profileId: string; providerId: RuntimeProviderId; flowId: string },
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        return providerAuthExecutionService.cancelAuth(input, context);
    }

    async refreshAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        const result = await providerAuthExecutionService.refreshAuth(profileId, providerId, context);
        if (result.isOk()) {
            await this.invalidateCatalogAfterAuthMutation(profileId, providerId);
        }

        return result;
    }

    async getAccountContext(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return providerAuthExecutionService.getAccountContext(profileId, providerId);
    }

    async getConnectionProfile(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderConnectionProfileResult>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
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

    async getExecutionPreference(
        profileId: string,
        providerId: RuntimeProviderId
    ) {
        await this.ensureOpenAIBoundaryNormalized(profileId);
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
        await this.ensureOpenAIBoundaryNormalized(profileId);
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
        await this.ensureOpenAIBoundaryNormalized(profileId);
        const providerDefinition = getProviderDefinition(providerId);
        if (input.organizationId !== undefined && !providerDefinition.supportsOrganizationScope) {
            return errProviderService(
                'invalid_payload',
                `Provider "${providerId}" does not support organization-scoped connection profiles.`
            );
        }

        const stateResult = await setConnectionProfileState(profileId, providerId, {
            optionProfileId: input.optionProfileId,
            ...(input.baseUrlOverride !== undefined ? { baseUrlOverride: input.baseUrlOverride } : {}),
        });
        if (stateResult.isErr()) {
            return errProviderService(stateResult.error.code, stateResult.error.message);
        }

        if (providerId === 'kilo' && input.organizationId !== undefined) {
            const organizationResult = await providerAuthExecutionService.setOrganization(
                profileId,
                providerId,
                input.organizationId
            );
            if (organizationResult.isErr()) {
                return errProviderService('invalid_payload', organizationResult.error.message);
            }
        }

        await providerMetadataOrchestrator.invalidateProviderScope(profileId, providerId);

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

        const authState = await providerAuthExecutionService.getAuthState(profileId, providerId);
        return okProviderService({
            ...stateResult.value,
            ...(authState.organizationId ? { organizationId: authState.organizationId } : {}),
        });
    }

    async setOrganization(
        profileId: string,
        providerId: 'kilo',
        organizationId?: string | null
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        const result = await providerAuthExecutionService.setOrganization(profileId, providerId, organizationId);
        if (result.isOk()) {
            await providerMetadataOrchestrator.invalidateProviderScope(profileId, providerId);
        }

        return result;
    }

    async syncCatalog(
        profileId: string,
        providerId: RuntimeProviderId,
        force = false,
        context?: { requestId?: string; correlationId?: string }
    ): Promise<ProviderServiceResult<ProviderSyncResult>> {
        await this.ensureOpenAIBoundaryNormalized(profileId);
        return syncCatalog(profileId, providerId, force, context);
    }

    async getModelRoutingPreference(
        input: ProviderGetModelRoutingPreferenceInput
    ): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        return getModelRoutingPreference(input);
    }

    async setModelRoutingPreference(
        input: ProviderSetModelRoutingPreferenceInput
    ): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        return setModelRoutingPreference(input);
    }

    async listModelProviders(input: ProviderListModelProvidersInput): Promise<ProviderServiceResult<KiloModelProviderOption[]>> {
        await this.ensureOpenAIBoundaryNormalized(input.profileId);
        return listModelProviders(input);
    }
}

export const providerManagementService = new ProviderManagementService();
export type { ProviderListItem, ProviderSyncResult } from '@/app/backend/providers/service/types';

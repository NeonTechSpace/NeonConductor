import type {
    KiloDynamicSort,
    KiloRoutingMode,
    OpenAIExecutionMode,
    ProviderAuthMethod,
    ProviderSecretKind,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts/enums';
import type {
    ProviderSpecialistDefaultModeKey,
    ProviderSpecialistDefaultTopLevelTab,
} from '@/app/backend/runtime/contracts/specialistDefaults';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { WorkflowRoutingTargetKey } from '@/app/backend/runtime/contracts/workflowRouting';

export interface MarketplacePackage {
    id: string;
    packageKind: string;
    slug: string;
    version: string;
    enabled: boolean;
    pinned: boolean;
    source: Record<string, unknown>;
    installedAt: string;
    updatedAt: string;
    assets: Array<{
        assetKind: string;
        assetId: string;
        createdAt: string;
    }>;
}

export interface KiloAccountContext {
    profileId: string;
    accountId?: string;
    displayName: string;
    emailMasked: string;
    authState: string;
    tokenExpiresAt?: string;
    balance?: {
        amount: number;
        currency: string;
        updatedAt: string;
    };
    organizations: Array<{
        id: string;
        organizationId: string;
        name: string;
        isActive: boolean;
        entitlement: Record<string, unknown>;
    }>;
    updatedAt: string;
}

export interface ProviderSetDefaultInput extends ProfileInput {
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface ProviderSpecialistDefaultRecord {
    topLevelTab: ProviderSpecialistDefaultTopLevelTab;
    modeKey: ProviderSpecialistDefaultModeKey;
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface ProviderSetSpecialistDefaultInput extends ProfileInput {
    topLevelTab: ProviderSpecialistDefaultTopLevelTab;
    modeKey: ProviderSpecialistDefaultModeKey;
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface WorkflowRoutingPreferenceRecord {
    targetKey: WorkflowRoutingTargetKey;
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface ProviderSetWorkflowRoutingPreferenceInput extends ProfileInput {
    targetKey: WorkflowRoutingTargetKey;
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface ProviderClearWorkflowRoutingPreferenceInput extends ProfileInput {
    targetKey: WorkflowRoutingTargetKey;
}

export type ProviderListProvidersInput = ProfileInput;

export interface ProviderByIdInput extends ProfileInput {
    providerId: RuntimeProviderId;
}

export type ProviderListModelsInput = ProviderByIdInput;

export interface ProviderSetApiKeyInput extends ProviderByIdInput {
    apiKey: string;
}

export type ProviderGetCredentialInput = ProviderByIdInput;

export type ProviderClearAuthInput = ProviderByIdInput;

export interface ProviderSyncCatalogInput extends ProviderByIdInput {
    force?: boolean;
}

export type ProviderListAuthMethodsInput = ProfileInput;

export interface ProviderStartAuthInput extends ProfileInput {
    providerId: RuntimeProviderId;
    method: ProviderAuthMethod;
}

export interface ProviderFlowInput extends ProviderByIdInput {
    flowId: string;
}

export type ProviderPollAuthInput = ProviderFlowInput;

export interface ProviderCompleteAuthInput extends ProviderFlowInput {
    code?: string;
}

export type ProviderCancelAuthInput = ProviderFlowInput;

export type ProviderRefreshAuthInput = ProviderByIdInput;

export type ProviderGetAccountContextInput = ProviderByIdInput;

export interface ProviderGetCloudSessionPrerequisitesInput extends ProfileInput {
    providerId: 'kilo';
}

export type ProviderRefreshAccountContextInput = ProviderGetCloudSessionPrerequisitesInput;

export type KiloCloudSessionPrerequisiteBlocker =
    | 'auth_required'
    | 'credential_required'
    | 'account_context_required'
    | 'organization_unavailable';

export interface KiloCloudSessionScope {
    scopeKind: 'account' | 'organization';
    remoteScopeKey: string;
    accountId?: string;
    organizationId?: string;
    organizationName?: string;
}

export interface KiloCloudSessionPrerequisites {
    profileId: string;
    providerId: 'kilo';
    authState: string;
    hasStoredCredential: boolean;
    accountContext: KiloAccountContext;
    scope?: KiloCloudSessionScope;
    blockers: KiloCloudSessionPrerequisiteBlocker[];
    canBrowseRemoteSessions: boolean;
    canContinueRemoteSessions: boolean;
}

export type ProviderGetConnectionProfileInput = ProviderByIdInput;

export interface ProviderGetExecutionPreferenceInput extends ProfileInput {
    providerId: 'openai';
}

export interface ProviderSetConnectionProfileInput extends ProviderByIdInput {
    optionProfileId: string;
    baseUrlOverride?: string | null;
    organizationId?: string | null;
}

export interface ProviderConnectionProfileOption {
    value: string;
    label: string;
}

export interface ProviderConnectionProfile {
    providerId: RuntimeProviderId;
    optionProfileId: string;
    label: string;
    options: ProviderConnectionProfileOption[];
    baseUrlOverride?: string;
    resolvedBaseUrl: string | null;
    organizationId?: string | null;
}

export interface ProviderExecutionPreference {
    providerId: 'openai';
    mode: OpenAIExecutionMode;
    canUseRealtimeWebSocket: boolean;
    disabledReason?: 'provider_not_supported' | 'api_key_required' | 'base_url_not_supported';
}

export interface ProviderSetExecutionPreferenceInput extends ProfileInput {
    providerId: 'openai';
    mode: OpenAIExecutionMode;
}

export interface ProviderSetOrganizationInput extends ProfileInput {
    providerId: 'kilo';
    organizationId?: string | null;
}

export interface KiloModelRoutingPreference {
    profileId: string;
    providerId: 'kilo';
    modelId: string;
    routingMode: KiloRoutingMode;
    sort?: KiloDynamicSort;
    pinnedProviderId?: string;
}

export interface ProviderGetModelRoutingPreferenceInput extends ProfileInput {
    providerId: 'kilo';
    modelId: string;
}

export interface ProviderSetModelRoutingPreferenceInput extends ProviderGetModelRoutingPreferenceInput {
    routingMode: KiloRoutingMode;
    sort?: KiloDynamicSort;
    pinnedProviderId?: string;
}

export type ProviderListModelProvidersInput = ProviderGetModelRoutingPreferenceInput;

export interface KiloModelProviderInfo {
    providerId: string;
    label: string;
    inputPrice?: number;
    outputPrice?: number;
    cacheReadPrice?: number;
    cacheWritePrice?: number;
    contextLength?: number;
    maxCompletionTokens?: number;
}

export interface ProviderSecret {
    id: string;
    profileId: string;
    providerId: RuntimeProviderId;
    secretKind: ProviderSecretKind;
    updatedAt: string;
}

export interface ProviderCredentialSummary {
    providerId: RuntimeProviderId;
    hasStoredCredential: boolean;
    credentialSource: 'api_key' | 'access_token' | null;
    maskedValue?: string;
}

export interface ProviderCredentialValue {
    providerId: RuntimeProviderId;
    credentialSource: 'api_key' | 'access_token';
    value: string;
}

export interface ProviderEmbeddingModelRecord {
    id: string;
    providerId: RuntimeProviderId;
    label: string;
    dimensions: number;
    maxInputTokens?: number;
    inputPrice?: number;
    source?: string;
    updatedAt?: string;
    raw?: Record<string, unknown>;
}

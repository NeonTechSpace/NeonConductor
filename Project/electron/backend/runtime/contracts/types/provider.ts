import type {
    KiloDynamicSort,
    KiloRoutingMode,
    ProviderAuthMethod,
    ProviderSecretKind,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

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

export type ProviderEndpointProfileValue =
    | 'gateway'
    | 'default'
    | 'coding_international'
    | 'general_international'
    | 'coding_plan'
    | 'standard_api';

export type ProviderGetEndpointProfileInput = ProviderByIdInput;

export interface ProviderSetEndpointProfileInput extends ProviderByIdInput {
    value: string;
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

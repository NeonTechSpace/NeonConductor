import type { ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';
import type { ProviderCatalogStrategy } from '@/app/backend/providers/registry';
import type {
    ProviderConnectionProfile,
    ProviderExecutionPreference,
    KiloModelProviderInfo,
    ProviderAuthMethod,
    ProviderCredentialSummary,
    ProviderCredentialValue,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';

export interface ProviderListItem extends ProviderRecord {
    isDefault: boolean;
    authMethod: ProviderAuthMethod | 'none';
    authState: string;
    availableAuthMethods: ProviderAuthMethod[];
    connectionProfile: ProviderConnectionProfile;
    executionPreference?: ProviderExecutionPreference;
    apiKeyCta: {
        label: string;
        url: string;
    };
    features: {
        catalogStrategy: ProviderCatalogStrategy;
        supportsKiloRouting: boolean;
        supportsModelProviderListing: boolean;
        supportsConnectionOptions: boolean;
        supportsCustomBaseUrl: boolean;
        supportsOrganizationScope: boolean;
    };
}

export type ProviderCatalogStateReason =
    | 'provider_not_found'
    | 'catalog_sync_failed'
    | 'catalog_empty_after_normalization'
    | null;

export interface ProviderCatalogState {
    reason: ProviderCatalogStateReason;
    detail?: string;
    invalidModelCount: number;
}

export interface ProviderControlEntry {
    provider: ProviderListItem;
    models: ProviderModelRecord[];
    catalogState: ProviderCatalogState;
}

export interface ProviderControlSnapshot {
    entries: ProviderControlEntry[];
    defaults: {
        providerId: string;
        modelId: string;
    };
    specialistDefaults: import('@/app/backend/runtime/contracts/types/provider').ProviderSpecialistDefaultRecord[];
}

export interface ProviderSyncResult {
    ok: boolean;
    status: 'synced' | 'unchanged' | 'error';
    providerId: RuntimeProviderId;
    reason?: string;
    detail?: string;
    modelCount: number;
}

export type KiloModelProviderOption = KiloModelProviderInfo;

export type ProviderConnectionProfileResult = ProviderConnectionProfile;

export type ProviderCredentialSummaryResult = ProviderCredentialSummary;

export type ProviderCredentialValueResult = ProviderCredentialValue | null;

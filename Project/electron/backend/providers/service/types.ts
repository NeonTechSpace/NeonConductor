import type { ProviderRecord } from '@/app/backend/persistence/types';
import type { ProviderCatalogStrategy } from '@/app/backend/providers/registry';
import type {
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
    endpointProfile: {
        value: string;
        label: string;
    };
    endpointProfiles: Array<{
        value: string;
        label: string;
    }>;
    apiKeyCta: {
        label: string;
        url: string;
    };
    features: {
        catalogStrategy: ProviderCatalogStrategy;
        supportsKiloRouting: boolean;
        supportsModelProviderListing: boolean;
        supportsEndpointProfiles: boolean;
    };
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

export interface ProviderEndpointProfileResult {
    providerId: RuntimeProviderId;
    value: string;
    label: string;
    options: Array<{
        value: string;
        label: string;
    }>;
}

export type ProviderCredentialSummaryResult = ProviderCredentialSummary;

export type ProviderCredentialValueResult = ProviderCredentialValue | null;

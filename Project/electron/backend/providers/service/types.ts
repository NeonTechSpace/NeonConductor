import type { ProviderRecord } from '@/app/backend/persistence/types';
import type { ProviderCatalogStrategy } from '@/app/backend/providers/registry';
import type {
    ProviderConnectionProfile,
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

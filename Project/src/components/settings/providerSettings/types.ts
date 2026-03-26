import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import type {
    KiloDynamicSort,
    KiloModelProviderInfo,
    KiloModelRoutingPreference,
    KiloRoutingMode,
    ProviderCredentialSummary,
    ProviderCredentialValue,
    RuntimeProviderId,
} from '@/shared/contracts';

export interface ActiveAuthFlow {
    providerId: RuntimeProviderId;
    flowId: string;
    userCode?: string;
    verificationUri?: string;
    pollAfterSeconds: number;
}

export interface ProviderListItem {
    id: RuntimeProviderId;
    label: string;
    isDefault: boolean;
    authState: string;
    authMethod: string;
    availableAuthMethods: string[];
    connectionProfile: {
        optionProfileId: string;
        label: string;
        options: Array<{
            value: string;
            label: string;
        }>;
        baseUrlOverride?: string;
        resolvedBaseUrl: string | null;
        organizationId?: string | null;
    };
    executionPreference?: {
        providerId: RuntimeProviderId;
        mode: 'standard_http' | 'realtime_websocket';
        canUseRealtimeWebSocket: boolean;
        disabledReason?: 'provider_not_supported' | 'api_key_required' | 'base_url_not_supported';
    };
    apiKeyCta: {
        label: string;
        url: string;
    };
    features: {
        catalogStrategy: 'dynamic' | 'static';
        supportsKiloRouting: boolean;
        supportsModelProviderListing: boolean;
        supportsConnectionOptions: boolean;
        supportsCustomBaseUrl: boolean;
        supportsOrganizationScope: boolean;
    };
}

export interface ProviderAuthStateView {
    authState: string;
    authMethod: string;
    accountId?: string;
    tokenExpiresAt?: string;
}

export type ProviderCredentialSummaryView = ProviderCredentialSummary;

export type ProviderCredentialValueView = ProviderCredentialValue | null;

export type ProviderModelOption = ModelPickerOption;

export type ProviderCatalogStateReason =
    | 'provider_not_found'
    | 'catalog_sync_failed'
    | 'catalog_empty_after_normalization'
    | null;

export interface KiloRoutingDraft {
    routingMode: KiloRoutingMode;
    sort: KiloDynamicSort;
    pinnedProviderId?: string;
}

export interface KiloRoutingSectionPreference extends KiloModelRoutingPreference {
    providerId: 'kilo';
}

export type KiloModelProviderOption = KiloModelProviderInfo;

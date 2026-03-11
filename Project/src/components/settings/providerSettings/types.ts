import type { ProviderModelRecord } from '@/app/backend/persistence/types';

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
        catalogStrategy: 'dynamic' | 'static';
        supportsKiloRouting: boolean;
        supportsModelProviderListing: boolean;
        supportsEndpointProfiles: boolean;
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

export type ProviderModelOption = ProviderModelRecord;

export interface KiloRoutingDraft {
    routingMode: KiloRoutingMode;
    sort: KiloDynamicSort;
    pinnedProviderId: string;
}

export interface KiloRoutingSectionPreference extends KiloModelRoutingPreference {
    providerId: 'kilo';
}

export type KiloModelProviderOption = KiloModelProviderInfo;


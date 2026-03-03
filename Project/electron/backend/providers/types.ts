import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { ProviderAuthMethod } from '@/app/backend/runtime/contracts';

export interface ProviderCatalogModel {
    modelId: string;
    label: string;
    upstreamProvider?: string;
    isFree: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
    contextLength?: number;
    pricing: Record<string, unknown>;
    raw: Record<string, unknown>;
}

export interface ProviderCatalogSyncSuccess {
    ok: true;
    status: 'synced' | 'unchanged';
    providerId: FirstPartyProviderId;
    models: ProviderCatalogModel[];
    providerPayload: Record<string, unknown>;
    modelPayload: Record<string, unknown>;
}

export interface ProviderCatalogSyncFailure {
    ok: false;
    status: 'error';
    providerId: FirstPartyProviderId;
    reason: 'auth_required' | 'sync_failed';
    detail?: string;
}

export type ProviderCatalogSyncResult = ProviderCatalogSyncSuccess | ProviderCatalogSyncFailure;

export interface ProviderAdapter {
    readonly id: FirstPartyProviderId;
    syncCatalog(input: {
        profileId: string;
        authMethod: ProviderAuthMethod | 'none';
        apiKey?: string;
        accessToken?: string;
        organizationId?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult>;
}

import type { FirstPartyProviderId } from '@/app/backend/providers/registry';

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
    providerId: FirstPartyProviderId;
    models: ProviderCatalogModel[];
    providerPayload: Record<string, unknown>;
    modelPayload: Record<string, unknown>;
}

export interface ProviderCatalogSyncFailure {
    ok: false;
    providerId: FirstPartyProviderId;
    reason: 'not_implemented' | 'sync_failed';
    detail?: string;
}

export type ProviderCatalogSyncResult = ProviderCatalogSyncSuccess | ProviderCatalogSyncFailure;

export interface ProviderAdapter {
    readonly id: FirstPartyProviderId;
    syncCatalog(input: {
        profileId: string;
        apiKey?: string;
        organizationId?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult>;
}

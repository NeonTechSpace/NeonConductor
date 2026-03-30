import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import type {
    ProviderConnectionProfileResult,
    ProviderListItem,
    ProviderSyncResult,
} from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export interface ProviderMutationContext {
    requestId?: string;
    correlationId?: string;
}

export interface ProviderCatalogInvalidationDecision {
    kind: 'none' | 'flush' | 'invalidate';
    profileId: string;
    providerId: RuntimeProviderId;
}

export interface ProviderConnectionProfileMutationResult {
    connectionProfile: ProviderConnectionProfileResult;
}

export interface ProviderOrganizationMutationResult {
    accountContext: ProviderAccountContextResult;
}

export interface ProviderCatalogSyncMutationResult {
    syncResult: ProviderSyncResult;
}

export interface ProviderMutationReadback {
    provider?: ProviderListItem;
    defaults: {
        providerId: string;
        modelId: string;
    };
    models: ProviderModelRecord[];
    authState?: ProviderAuthStateRecord;
}

export interface ProviderMutationEventPayload {
    providerId: string;
    eventType: string;
    payload: Record<string, unknown>;
}

export interface KiloProviderOptionSnapshotRow {
    providerId: string;
    label: string;
    inputPrice?: number;
    outputPrice?: number;
    cacheReadPrice?: number;
    cacheWritePrice?: number;
    contextLength?: number;
    maxCompletionTokens?: number;
}

export interface KiloRoutingPreferenceDecision {
    routingMode: 'dynamic' | 'pinned';
    sort?: 'default' | 'price' | 'throughput' | 'latency';
    pinnedProviderId?: string;
}

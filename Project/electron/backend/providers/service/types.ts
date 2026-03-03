import type { ProviderRecord } from '@/app/backend/persistence/types';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

export interface ProviderListItem extends ProviderRecord {
    isDefault: boolean;
    authMethod: ProviderAuthMethod | 'none';
    authState: string;
}

export interface ProviderSyncResult {
    ok: boolean;
    status: 'synced' | 'unchanged' | 'error';
    providerId: RuntimeProviderId;
    reason?: string;
    detail?: string;
    modelCount: number;
}

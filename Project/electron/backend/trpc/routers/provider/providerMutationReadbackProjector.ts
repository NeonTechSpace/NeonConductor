import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import type { ProviderMutationReadback } from '@/app/backend/providers/service/providerMutationLifecycle.types';
import type {
    KiloModelProviderOption,
    ProviderConnectionProfileResult,
    ProviderListItem,
    ProviderSyncResult,
} from '@/app/backend/providers/service/types';
import type {
    KiloModelRoutingPreference,
    ProviderExecutionPreference,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';

type MaybeProviderListItem = ProviderListItem | null | undefined;

export interface ProviderMutationReadbackReaders {
    listProviders(profileId: string): Promise<ProviderListItem[]>;
    getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }>;
    listModels(profileId: string, providerId: RuntimeProviderId): Promise<ProviderServiceResult<ProviderModelRecord[]>>;
    getAuthState?(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderAuthStateRecord>;
}

export async function readProviderMutationReadback(
    readers: ProviderMutationReadbackReaders,
    input: {
        profileId: string;
        providerId: RuntimeProviderId;
        includeProvider?: boolean;
        includeDefaults?: boolean;
        includeModels?: boolean;
        includeAuthState?: boolean;
    }
): Promise<ProviderServiceResult<ProviderMutationReadback>> {
    const [providers, defaults, models, authState] = await Promise.all([
        input.includeProvider === false ? Promise.resolve<ProviderListItem[] | null>(null) : readers.listProviders(input.profileId),
        input.includeDefaults === false
            ? Promise.resolve<{ providerId: string; modelId: string } | null>(null)
            : readers.getDefaults(input.profileId),
        input.includeModels === false
            ? Promise.resolve<ProviderServiceResult<ProviderModelRecord[]> | null>(null)
            : readers.listModels(input.profileId, input.providerId),
        input.includeAuthState && readers.getAuthState
            ? readers.getAuthState(input.profileId, input.providerId)
            : Promise.resolve<ProviderAuthStateRecord | undefined>(undefined),
    ]);

    if (models?.isErr()) {
        return errProviderService(models.error.code, models.error.message);
    }

    const provider = providers?.find((entry) => entry.id === input.providerId) ?? undefined;
    const resolvedModels = models && models.isOk() ? models.value : [];

    return okProviderService({
        ...(provider ? { provider } : {}),
        defaults: defaults ?? {
            providerId: input.providerId,
            modelId: '',
        },
        models: resolvedModels,
        ...(authState ? { authState } : {}),
    });
}

export function buildProviderConnectionProfileMutationReadback(input: {
    connectionProfile: ProviderConnectionProfileResult;
    defaults: { providerId: string; modelId: string };
    models: ProviderModelRecord[];
    provider?: MaybeProviderListItem;
}) {
    return {
        connectionProfile: input.connectionProfile,
        defaults: input.defaults,
        models: input.models,
        ...(input.provider ? { provider: input.provider } : {}),
    };
}

export function buildProviderOrganizationMutationReadback(input: {
    accountContext: ProviderAccountContextResult;
    authState: ProviderAuthStateRecord;
    defaults: { providerId: string; modelId: string };
    models: ProviderModelRecord[];
    provider?: MaybeProviderListItem;
}) {
    return {
        ...input.accountContext,
        authState: input.authState,
        defaults: input.defaults,
        models: input.models,
        ...(input.provider ? { provider: input.provider } : {}),
    };
}

export function buildProviderExecutionPreferenceMutationReadback(input: {
    executionPreference: ProviderExecutionPreference;
    provider?: MaybeProviderListItem;
}) {
    return {
        executionPreference: input.executionPreference,
        ...(input.provider ? { provider: input.provider } : {}),
    };
}

export function buildProviderSyncMutationReadback(input: {
    syncResult: ProviderSyncResult;
    defaults: { providerId: string; modelId: string };
    models: ProviderModelRecord[];
    provider?: MaybeProviderListItem;
    emptyCatalogState?: {
        reason: 'catalog_sync_failed' | 'catalog_empty_after_normalization';
        detail?: string;
    } | null;
}) {
    return {
        ...input.syncResult,
        ...(input.emptyCatalogState
            ? {
                  reason: input.emptyCatalogState.reason,
                  detail: input.emptyCatalogState.detail,
              }
            : {}),
        defaults: input.defaults,
        models: input.models,
        ...(input.provider ? { provider: input.provider } : {}),
    };
}

export function buildProviderModelRoutingPreferenceMutationReadback(input: {
    preference: KiloModelRoutingPreference;
    providers: KiloModelProviderOption[];
}) {
    return {
        preference: input.preference,
        providers: input.providers,
    };
}

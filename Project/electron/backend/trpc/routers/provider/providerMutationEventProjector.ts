import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import type {
    KiloModelProviderOption,
    ProviderConnectionProfileResult,
    ProviderListItem,
    ProviderSyncResult,
} from '@/app/backend/providers/service/types';
import type { KiloModelRoutingPreference, ProviderExecutionPreference } from '@/app/backend/runtime/contracts';

type MaybeProviderListItem = ProviderListItem | null | undefined;

type EmptyCatalogState = {
    reason: 'catalog_sync_failed' | 'catalog_empty_after_normalization';
    detail?: string;
} | null | undefined;

function mergeProvider(input: { provider?: MaybeProviderListItem }) {
    return input.provider ? { provider: input.provider } : {};
}

export function buildProviderAuthStartedEventPayload(input: {
    profileId: string;
    providerId: string;
    method: string;
    flowId: string;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        method: input.method,
        flowId: input.flowId,
    };
}

export function buildProviderAuthPolledEventPayload(input: {
    profileId: string;
    providerId: string;
    flowId: string;
    flowStatus: string;
    authState: string;
    state: ProviderAuthStateRecord;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        flowId: input.flowId,
        flowStatus: input.flowStatus,
        authState: input.authState,
        state: input.state,
    };
}

export function buildProviderAuthCompletedEventPayload(input: {
    profileId: string;
    providerId: string;
    flowId: string;
    flowStatus: string;
    authState: string;
    state: ProviderAuthStateRecord;
}) {
    return buildProviderAuthPolledEventPayload(input);
}

export function buildProviderAuthCancelledEventPayload(input: {
    profileId: string;
    providerId: string;
    flowId: string;
    state: ProviderAuthStateRecord;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        flowId: input.flowId,
        state: input.state,
    };
}

export function buildProviderAuthRefreshedEventPayload(input: {
    profileId: string;
    providerId: string;
    authState: string;
    state: ProviderAuthStateRecord;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        authState: input.authState,
        state: input.state,
    };
}

export function buildProviderApiKeySetEventPayload(input: {
    profileId: string;
    providerId: string;
    state: ProviderAuthStateRecord;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        state: input.state,
    };
}

export function buildProviderAuthClearedEventPayload(input: {
    profileId: string;
    providerId: string;
    state: ProviderAuthStateRecord;
}) {
    return buildProviderApiKeySetEventPayload(input);
}

export function buildProviderConnectionProfileSetEventPayload(input: {
    profileId: string;
    providerId: string;
    value: string;
    connectionProfile: ProviderConnectionProfileResult;
    defaults: { providerId: string; modelId: string };
    models: ProviderModelRecord[];
    provider?: MaybeProviderListItem;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        value: input.value,
        connectionProfile: input.connectionProfile,
        defaults: input.defaults,
        models: input.models,
        ...mergeProvider({ provider: input.provider }),
    };
}

export function buildProviderExecutionPreferenceSetEventPayload(input: {
    profileId: string;
    providerId: string;
    executionPreference: ProviderExecutionPreference;
    provider?: MaybeProviderListItem;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        executionPreference: input.executionPreference,
        ...mergeProvider({ provider: input.provider }),
    };
}

export function buildProviderOrganizationSetEventPayload(input: {
    profileId: string;
    providerId: string;
    organizationId: string | null;
    accountContext: ProviderAccountContextResult;
    authState: ProviderAuthStateRecord;
    defaults: { providerId: string; modelId: string };
    models: ProviderModelRecord[];
    provider?: MaybeProviderListItem;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        organizationId: input.organizationId,
        accountContext: input.accountContext,
        authState: input.authState,
        defaults: input.defaults,
        models: input.models,
        ...mergeProvider({ provider: input.provider }),
    };
}

export function buildProviderKiloRoutingSetEventPayload(input: {
    profileId: string;
    providerId: string;
    modelId: string;
    preference: KiloModelRoutingPreference;
    providers: KiloModelProviderOption[];
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        modelId: input.modelId,
        routingMode: input.preference.routingMode,
        sort: input.preference.sort ?? null,
        pinnedProviderId: input.preference.pinnedProviderId ?? null,
        preference: input.preference,
        providers: input.providers,
    };
}

export function buildProviderSyncEventPayload(input: {
    profileId: string;
    providerId: string;
    syncResult: ProviderSyncResult;
    defaults: { providerId: string; modelId: string };
    models: ProviderModelRecord[];
    provider?: MaybeProviderListItem;
    emptyCatalogState?: EmptyCatalogState;
}) {
    return {
        profileId: input.profileId,
        providerId: input.providerId,
        ok: input.syncResult.ok,
        status: input.syncResult.status,
        reason: input.emptyCatalogState?.reason ?? input.syncResult.reason ?? null,
        detail: input.emptyCatalogState?.detail ?? input.syncResult.detail ?? null,
        modelCount: input.syncResult.modelCount,
        defaults: input.defaults,
        models: input.models,
        ...mergeProvider({ provider: input.provider }),
    };
}

import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    KiloModelProviderOption,
    ProviderConnectionProfileResult,
    ProviderListItem,
} from '@/app/backend/providers/service/types';
import type { KiloModelRoutingPreference, RuntimeProviderId } from '@/shared/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/shared/contracts/types/provider';

type TrpcUtils = ReturnType<typeof import('@/web/trpc/client').trpc.useUtils>;

export type ProviderSettingsCacheUtils = TrpcUtils;

export type EmptyCatalogStateReason = 'catalog_sync_failed' | 'catalog_empty_after_normalization';

type ProviderListData = Awaited<ReturnType<TrpcUtils['provider']['listProviders']['fetch']>>;
type ProviderDefaultsData = Awaited<ReturnType<TrpcUtils['provider']['getDefaults']['fetch']>>;
type ProviderControlData = Awaited<ReturnType<TrpcUtils['provider']['getControlPlane']['fetch']>>;
type ProviderModelsData = Awaited<ReturnType<TrpcUtils['provider']['listModels']['fetch']>>;
type ProviderAuthStateData = Awaited<ReturnType<TrpcUtils['provider']['getAuthState']['fetch']>>;
type ProviderAccountContextData = Awaited<ReturnType<TrpcUtils['provider']['getAccountContext']['fetch']>>;
type ProviderConnectionProfileData = Awaited<ReturnType<TrpcUtils['provider']['getConnectionProfile']['fetch']>>;
type ProviderExecutionPreferenceData = Awaited<ReturnType<TrpcUtils['provider']['getExecutionPreference']['fetch']>>;
type ProviderModelProvidersData = Awaited<ReturnType<TrpcUtils['provider']['listModelProviders']['fetch']>>;
type ProviderRoutingPreferenceData = Awaited<ReturnType<TrpcUtils['provider']['getModelRoutingPreference']['fetch']>>;
type ShellBootstrapData = Awaited<ReturnType<TrpcUtils['runtime']['getShellBootstrap']['fetch']>>;

export interface ProviderSettingsCacheProjectionInput {
    utils: ProviderSettingsCacheUtils;
    profileId: string;
    providerId: RuntimeProviderId;
    provider?: ProviderListItem;
    defaults?: { providerId: string; modelId: string };
    specialistDefaults?: ProviderSpecialistDefaultRecord[];
    models?: ProviderModelRecord[];
    catalogStateReason?: EmptyCatalogStateReason;
    catalogStateDetail?: string;
    authState?: ProviderAuthStateRecord;
    accountContext?: ProviderAccountContextData;
    connectionProfile?: ProviderConnectionProfileResult;
    executionPreference?: ProviderListItem['executionPreference'];
    routingPreference?: KiloModelRoutingPreference;
    routingProviders?: KiloModelProviderOption[];
    routingModelId?: string;
}

export type {
    ProviderAccountContextData,
    ProviderAuthStateData,
    ProviderConnectionProfileData,
    ProviderControlData,
    ProviderDefaultsData,
    ProviderExecutionPreferenceData,
    ProviderListData,
    ProviderModelProvidersData,
    ProviderModelsData,
    ProviderRoutingPreferenceData,
    ShellBootstrapData,
};

import { trpc } from '@/web/trpc/client';

import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    KiloModelProviderOption,
    ProviderEndpointProfileResult,
    ProviderListItem,
} from '@/app/backend/providers/service/types';
import type {
    KiloModelRoutingPreference,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type ProviderListData = Awaited<ReturnType<TrpcUtils['provider']['listProviders']['fetch']>>;
type ProviderDefaultsData = Awaited<ReturnType<TrpcUtils['provider']['getDefaults']['fetch']>>;
type ProviderModelsData = Awaited<ReturnType<TrpcUtils['provider']['listModels']['fetch']>>;
type ProviderAuthStateData = Awaited<ReturnType<TrpcUtils['provider']['getAuthState']['fetch']>>;
type ProviderAccountContextData = Awaited<ReturnType<TrpcUtils['provider']['getAccountContext']['fetch']>>;
type ProviderEndpointProfileData = Awaited<ReturnType<TrpcUtils['provider']['getEndpointProfile']['fetch']>>;
type ProviderModelProvidersData = Awaited<ReturnType<TrpcUtils['provider']['listModelProviders']['fetch']>>;
type ProviderRoutingPreferenceData = Awaited<ReturnType<TrpcUtils['provider']['getModelRoutingPreference']['fetch']>>;

function replaceProvider(
    current: ProviderListData | undefined,
    provider: ProviderListItem
): ProviderListData | undefined {
    if (!current) {
        return current;
    }

    return {
        providers: current.providers.map((candidate) => (candidate.id === provider.id ? provider : candidate)),
    };
}

export function patchProviderCache(input: {
    utils: TrpcUtils;
    profileId: string;
    providerId: RuntimeProviderId;
    provider?: ProviderListItem;
    defaults?: { providerId: string; modelId: string };
    models?: ProviderModelRecord[];
    authState?: ProviderAuthStateRecord;
    accountContext?: ProviderAccountContextData;
    endpointProfile?: ProviderEndpointProfileResult;
    routingPreference?: KiloModelRoutingPreference;
    routingProviders?: KiloModelProviderOption[];
    routingModelId?: string;
}) {
    if (input.provider) {
        const provider = input.provider;
        input.utils.provider.listProviders.setData(
            { profileId: input.profileId },
            (current: ProviderListData | undefined) => replaceProvider(current, provider)
        );
    }

    if (input.defaults) {
        input.utils.provider.getDefaults.setData(
            { profileId: input.profileId },
            {
                defaults: input.defaults,
            } satisfies ProviderDefaultsData
        );
    }

    if (input.models) {
        input.utils.provider.listModels.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                models: input.models,
                reason: null,
            } satisfies ProviderModelsData
        );
    }

    if (input.authState) {
        input.utils.provider.getAuthState.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                found: true,
                state: input.authState,
            } satisfies ProviderAuthStateData
        );
    }

    if (input.accountContext && input.providerId === 'kilo') {
        input.utils.provider.getAccountContext.setData(
            {
                profileId: input.profileId,
                providerId: 'kilo',
            },
            input.accountContext
        );
    }

    if (input.endpointProfile) {
        input.utils.provider.getEndpointProfile.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                endpointProfile: input.endpointProfile,
            } satisfies ProviderEndpointProfileData
        );
    }

    if (input.routingPreference && input.routingModelId) {
        input.utils.provider.getModelRoutingPreference.setData(
            {
                profileId: input.profileId,
                providerId: 'kilo',
                modelId: input.routingModelId,
            },
            {
                preference: input.routingPreference,
            } satisfies ProviderRoutingPreferenceData
        );
    }

    if (input.routingProviders && input.routingModelId) {
        input.utils.provider.listModelProviders.setData(
            {
                profileId: input.profileId,
                providerId: 'kilo',
                modelId: input.routingModelId,
            },
            {
                providers: input.routingProviders,
            } satisfies ProviderModelProvidersData
        );
    }
}

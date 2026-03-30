import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';

import type {
    ProviderConnectionProfileData,
    ProviderExecutionPreferenceData,
    ProviderModelProvidersData,
    ProviderRoutingPreferenceData,
    ProviderSettingsCacheProjectionInput,
} from '@/web/components/settings/providerSettings/providerSettingsCache.types';

export function projectProviderSettingsSupplementalCache(input: ProviderSettingsCacheProjectionInput): void {
    if (input.authState) {
        input.utils.provider.getAuthState.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                found: true,
                state: input.authState as ProviderAuthStateRecord,
            }
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

    if (input.connectionProfile) {
        input.utils.provider.getConnectionProfile.setData(
            {
                profileId: input.profileId,
                providerId: input.providerId,
            },
            {
                connectionProfile: input.connectionProfile,
            } satisfies ProviderConnectionProfileData
        );
    }

    if (input.executionPreference && input.providerId === 'openai') {
        input.utils.provider.getExecutionPreference.setData(
            {
                profileId: input.profileId,
                providerId: 'openai',
            },
            {
                executionPreference: input.executionPreference,
            } satisfies ProviderExecutionPreferenceData
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

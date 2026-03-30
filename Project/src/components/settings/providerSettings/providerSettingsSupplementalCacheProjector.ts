import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';

import type {
    ProviderConnectionProfileData,
    ProviderExecutionPreferenceData,
    ProviderModelProvidersData,
    ProviderRoutingPreferenceData,
    ProviderSettingsCacheProjectionInput,
} from '@/web/components/settings/providerSettings/providerSettingsCache.types';

type ProviderSettingsCacheContext = Pick<ProviderSettingsCacheProjectionInput, 'utils' | 'profileId' | 'providerId'>;

function writeProviderAuthStateData(
    context: ProviderSettingsCacheContext,
    authState: ProviderAuthStateRecord
): void {
    context.utils.provider.getAuthState.setData(
        {
            profileId: context.profileId,
            providerId: context.providerId,
        },
        {
            found: true,
            state: authState,
        }
    );
}

function writeProviderAccountContextData(
    context: ProviderSettingsCacheContext,
    accountContext: ProviderSettingsCacheProjectionInput['accountContext']
): void {
    if (!accountContext) {
        return;
    }

    context.utils.provider.getAccountContext.setData(
        {
            profileId: context.profileId,
            providerId: 'kilo',
        },
        accountContext
    );
}

function writeProviderConnectionProfileData(
    context: ProviderSettingsCacheContext,
    connectionProfile: NonNullable<ProviderSettingsCacheProjectionInput['connectionProfile']>
): void {
    context.utils.provider.getConnectionProfile.setData(
        {
            profileId: context.profileId,
            providerId: context.providerId,
        },
        {
            connectionProfile,
        } satisfies ProviderConnectionProfileData
    );
}

function writeProviderExecutionPreferenceData(
    context: ProviderSettingsCacheContext,
    executionPreference: NonNullable<ProviderSettingsCacheProjectionInput['executionPreference']>
): void {
    context.utils.provider.getExecutionPreference.setData(
        {
            profileId: context.profileId,
            providerId: 'openai',
        },
        {
            executionPreference,
        } satisfies ProviderExecutionPreferenceData
    );
}

function writeProviderRoutingPreferenceData(
    context: ProviderSettingsCacheContext,
    routingModelId: string,
    routingPreference: NonNullable<ProviderSettingsCacheProjectionInput['routingPreference']>
): void {
    context.utils.provider.getModelRoutingPreference.setData(
        {
            profileId: context.profileId,
            providerId: 'kilo',
            modelId: routingModelId,
        },
        {
            preference: routingPreference,
        } satisfies ProviderRoutingPreferenceData
    );
}

function writeProviderRoutingProvidersData(
    context: ProviderSettingsCacheContext,
    routingModelId: string,
    routingProviders: NonNullable<ProviderSettingsCacheProjectionInput['routingProviders']>
): void {
    context.utils.provider.listModelProviders.setData(
        {
            profileId: context.profileId,
            providerId: 'kilo',
            modelId: routingModelId,
        },
        {
            providers: routingProviders,
        } satisfies ProviderModelProvidersData
    );
}

export function projectProviderSettingsSupplementalCache(input: ProviderSettingsCacheProjectionInput): void {
    if (input.authState) {
        writeProviderAuthStateData(input, input.authState);
    }

    if (input.accountContext && input.providerId === 'kilo') {
        writeProviderAccountContextData(input, input.accountContext);
    }

    if (input.connectionProfile) {
        writeProviderConnectionProfileData(input, input.connectionProfile);
    }

    if (input.executionPreference && input.providerId === 'openai') {
        writeProviderExecutionPreferenceData(input, input.executionPreference);
    }

    if (input.routingPreference && input.routingModelId) {
        writeProviderRoutingPreferenceData(input, input.routingModelId, input.routingPreference);
    }

    if (input.routingProviders && input.routingModelId) {
        writeProviderRoutingProvidersData(input, input.routingModelId, input.routingProviders);
    }
}

import { resolveProviderBaseUrl } from '@/app/backend/providers/providerBaseUrls';
import { getDefaultEndpointProfile, type FirstPartyProviderId } from '@/app/backend/providers/registry';
import { resolveConnectionProfile } from '@/app/backend/providers/service/endpointProfiles';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';

export interface ProviderRuntimePathContext {
    profileId: string;
    providerId: FirstPartyProviderId;
    optionProfileId: string;
    resolvedBaseUrl: string | null;
}

export async function resolveProviderRuntimePathContext(
    profileId: string,
    providerId: FirstPartyProviderId
): Promise<ProviderServiceResult<ProviderRuntimePathContext>> {
    const connectionProfileResult = await resolveConnectionProfile(profileId, providerId);
    if (connectionProfileResult.isErr()) {
        return errProviderService(connectionProfileResult.error.code, connectionProfileResult.error.message);
    }

    const optionProfileId = connectionProfileResult.value.optionProfileId || getDefaultEndpointProfile(providerId);
    return okProviderService({
        profileId,
        providerId,
        optionProfileId,
        resolvedBaseUrl:
            connectionProfileResult.value.resolvedBaseUrl ?? resolveProviderBaseUrl(providerId, optionProfileId),
    });
}

import {
    listStaticModelDefinitions,
    toStaticProviderCatalogModel,
} from '@/app/backend/providers/metadata/staticCatalog/registry';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import { resolveEndpointProfile } from '@/app/backend/providers/service/endpointProfiles';
import type { ProviderCatalogSyncResult } from '@/app/backend/providers/types';

type StaticProviderId = Exclude<FirstPartyProviderId, 'kilo'>;

function isStaticProvider(providerId: FirstPartyProviderId): providerId is StaticProviderId {
    return providerId === 'openai' || providerId === 'zai' || providerId === 'moonshot';
}

export async function syncStaticCatalog(
    providerId: FirstPartyProviderId,
    input: { profileId: string; endpointProfile?: string }
): Promise<ProviderCatalogSyncResult> {
    if (!isStaticProvider(providerId)) {
        return {
            ok: false,
            status: 'error',
            providerId,
            reason: 'sync_failed',
            detail: `Static catalog is not supported for provider "${providerId}".`,
        };
    }

    let endpointProfile = input.endpointProfile;
    if (!endpointProfile) {
        const endpointProfileResult = await resolveEndpointProfile(input.profileId, providerId);
        if (endpointProfileResult.isErr()) {
            return {
                ok: false,
                status: 'error',
                providerId,
                reason: 'sync_failed',
                detail: endpointProfileResult.error.message,
            };
        }

        endpointProfile = endpointProfileResult.value;
    }
    const definitions = listStaticModelDefinitions(providerId, endpointProfile);
    const models = definitions.map((definition) => toStaticProviderCatalogModel(definition, endpointProfile));

    return {
        ok: true,
        status: 'synced',
        providerId,
        models,
        providerPayload: {
            source: 'static_registry',
            providerId,
            endpointProfile,
        },
        modelPayload: {
            source: 'static_registry',
            count: models.length,
            endpointProfile,
            modelIds: models.map((model) => model.modelId),
        },
    };
}

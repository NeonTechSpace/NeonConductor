import { createHash } from 'node:crypto';

import { resolveProviderBaseUrl } from '@/app/backend/providers/providerBaseUrls';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { resolveConnectionProfile } from '@/app/backend/providers/service/endpointProfiles';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import { resolveSecret } from '@/app/backend/providers/service/helpers';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

export interface ResolvedProviderCatalogContext {
    providerId: FirstPartyProviderId;
    profileId: string;
    authMethod: ProviderAuthMethod | 'none';
    credentialFingerprint: string | null;
    organizationId: string | null;
    optionProfileId: string;
    resolvedBaseUrl: string | null;
    cacheKey: string;
}

export interface ResolvedProviderCatalogFetchState {
    context: ResolvedProviderCatalogContext;
    apiKey?: string;
    accessToken?: string;
}

export function buildProviderCatalogScopeKey(profileId: string, providerId: RuntimeProviderId): string {
    return `${profileId}:${providerId}`;
}

function hashCredential(value: string | null): string | null {
    if (!value) {
        return null;
    }

    return createHash('sha256').update(value).digest('hex');
}

function serializeContext(context: Omit<ResolvedProviderCatalogContext, 'cacheKey'>): string {
    return JSON.stringify({
        providerId: context.providerId,
        profileId: context.profileId,
        authMethod: context.authMethod,
        credentialFingerprint: context.credentialFingerprint,
        organizationId: context.organizationId,
        optionProfileId: context.optionProfileId,
        resolvedBaseUrl: context.resolvedBaseUrl,
    });
}

export async function resolveProviderCatalogFetchState(
    profileId: string,
    providerId: FirstPartyProviderId
): Promise<ProviderServiceResult<ResolvedProviderCatalogFetchState>> {
    const [authState, apiKey, accessToken, connectionProfileResult] = await Promise.all([
        providerAuthExecutionService.getAuthState(profileId, providerId),
        resolveSecret(profileId, providerId, 'api_key'),
        resolveSecret(profileId, providerId, 'access_token'),
        resolveConnectionProfile(profileId, providerId),
    ]);

    if (connectionProfileResult.isErr()) {
        return errProviderService(connectionProfileResult.error.code, connectionProfileResult.error.message);
    }

    const credentialFingerprint = hashCredential(apiKey ?? accessToken ?? null);
    const connectionProfile = connectionProfileResult.value;
    const contextWithoutCacheKey = {
        providerId,
        profileId,
        authMethod: authState.authMethod,
        credentialFingerprint,
        organizationId: authState.organizationId ?? null,
        optionProfileId: connectionProfile.optionProfileId,
        resolvedBaseUrl: connectionProfile.resolvedBaseUrl ?? resolveProviderBaseUrl(providerId, connectionProfile.optionProfileId),
    } satisfies Omit<ResolvedProviderCatalogContext, 'cacheKey'>;

    return okProviderService({
        context: {
            ...contextWithoutCacheKey,
            cacheKey: serializeContext(contextWithoutCacheKey),
        },
        ...(apiKey ? { apiKey } : {}),
        ...(accessToken ? { accessToken } : {}),
    });
}

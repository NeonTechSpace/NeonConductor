import {
    providerAuthStore,
    providerCatalogStore,
    providerStore,
    runUsageStore,
} from '@/app/backend/persistence/stores';
import type {
    OpenAISubscriptionRateLimitsSummary,
    OpenAISubscriptionUsageSummary,
    ProviderAuthStateRecord,
    ProviderModelRecord,
    ProviderUsageSummary,
} from '@/app/backend/persistence/types';
import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
import { getProviderDefinition } from '@/app/backend/providers/registry';
import { getEndpointProfileState, resolveApiKeyCta } from '@/app/backend/providers/service/endpointProfiles';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import { defaultAuthState, ensureSupportedProvider, resolveSecret } from '@/app/backend/providers/service/helpers';
import { getOpenAISubscriptionRateLimits as getOpenAISubscriptionRateLimitsFromWham } from '@/app/backend/providers/service/openaiSubscriptionRateLimits';
import type {
    ProviderCredentialSummaryResult,
    ProviderCredentialValueResult,
    ProviderListItem,
} from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { appLog } from '@/app/main/logging';

export async function listProviders(profileId: string): Promise<ProviderListItem[]> {
    const [providers, defaults, authStates] = await Promise.all([
        providerStore.listProviders(),
        providerStore.getDefaults(profileId),
        providerAuthStore.listByProfile(profileId),
    ]);

    const authStateByProvider = new Map(authStates.map((state) => [state.providerId, state]));
    return Promise.all(
        providers.map(async (provider) => {
            const authState = authStateByProvider.get(provider.id) ?? defaultAuthState(profileId, provider.id);
            const definition = getProviderDefinition(provider.id);
            const endpointProfileResult = await getEndpointProfileState(profileId, provider.id);
            const endpointProfile = endpointProfileResult.isErr()
                ? {
                      providerId: provider.id,
                      value: definition.endpointProfiles[0]?.value ?? 'default',
                      label: definition.endpointProfiles[0]?.label ?? 'Default',
                      options: definition.endpointProfiles.map((profile) => ({
                          value: profile.value,
                          label: profile.label,
                      })),
                  }
                : endpointProfileResult.value;
            const apiKeyCtaResult = await resolveApiKeyCta(profileId, provider.id);
            const apiKeyCta = apiKeyCtaResult.isErr()
                ? { label: 'Get API Key', url: 'https://kilocode.ai' }
                : apiKeyCtaResult.value;
            return {
                ...provider,
                isDefault: defaults.providerId === provider.id,
                authMethod: authState.authMethod,
                authState: authState.authState,
                availableAuthMethods: definition.authMethods,
                endpointProfile: {
                    value: endpointProfile.value,
                    label: endpointProfile.label,
                },
                endpointProfiles: endpointProfile.options,
                apiKeyCta,
                features: {
                    catalogStrategy: definition.catalogStrategy,
                    supportsKiloRouting: definition.supportsKiloRouting,
                    supportsModelProviderListing: definition.supportsModelProviderListing,
                    supportsEndpointProfiles: definition.endpointProfiles.length > 1,
                },
            };
        })
    );
}

function maskCredentialValue(value: string): string {
    const normalized = value.trim();
    if (normalized.length <= 8) {
        return `${normalized.slice(0, 2)}••••${normalized.slice(-2)}`;
    }

    return `${normalized.slice(0, 6)}••••${normalized.slice(-4)}`;
}

export async function getCredentialSummary(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<ProviderServiceResult<ProviderCredentialSummaryResult>> {
    const ensuredProvider = await ensureSupportedProvider(providerId);
    if (ensuredProvider.isErr()) {
        return errProviderService(ensuredProvider.error.code, ensuredProvider.error.message);
    }

    const [apiKey, accessToken] = await Promise.all([
        resolveSecret(profileId, providerId, 'api_key'),
        resolveSecret(profileId, providerId, 'access_token'),
    ]);
    const resolvedCredential = apiKey ?? accessToken;
    const credentialSource = apiKey ? ('api_key' as const) : accessToken ? ('access_token' as const) : null;

    return okProviderService({
        providerId,
        hasStoredCredential: resolvedCredential !== undefined,
        credentialSource,
        ...(resolvedCredential ? { maskedValue: maskCredentialValue(resolvedCredential) } : {}),
    });
}

export async function getCredentialValue(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<ProviderServiceResult<ProviderCredentialValueResult>> {
    const ensuredProvider = await ensureSupportedProvider(providerId);
    if (ensuredProvider.isErr()) {
        return errProviderService(ensuredProvider.error.code, ensuredProvider.error.message);
    }

    const [apiKey, accessToken] = await Promise.all([
        resolveSecret(profileId, providerId, 'api_key'),
        resolveSecret(profileId, providerId, 'access_token'),
    ]);
    if (apiKey) {
        return okProviderService({
            providerId,
            credentialSource: 'api_key',
            value: apiKey,
        });
    }

    if (accessToken) {
        return okProviderService({
            providerId,
            credentialSource: 'access_token',
            value: accessToken,
        });
    }

    return okProviderService(null);
}

export async function listModels(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<ProviderServiceResult<ProviderModelRecord[]>> {
    const result = await providerMetadataOrchestrator.listModels(profileId, providerId);
    if (result.isErr()) {
        return errProviderService(result.error.code, result.error.message);
    }

    return okProviderService(result.value);
}

export async function listModelsByProfile(profileId: string): Promise<ProviderModelRecord[]> {
    return providerMetadataOrchestrator.listModelsByProfile(profileId);
}

export async function getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
    return providerStore.getDefaults(profileId);
}

export async function setDefault(
    profileId: string,
    providerId: RuntimeProviderId,
    modelId: string
): Promise<{
    success: boolean;
    reason: 'provider_not_found' | 'model_not_found' | null;
    defaultProviderId: string;
    defaultModelId: string;
}> {
    const ensuredProviderResult = await ensureSupportedProvider(providerId);
    if (ensuredProviderResult.isErr()) {
        const defaults = await providerStore.getDefaults(profileId);
        appLog.warn({
            tag: 'provider.read-service',
            message: 'Rejected default provider update due to unsupported or unregistered provider.',
            profileId,
            providerId,
            error: ensuredProviderResult.error.message,
        });
        return {
            success: false,
            reason: 'provider_not_found',
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }

    const hasModel = await providerStore.modelExists(profileId, providerId, modelId);
    if (!hasModel) {
        const defaults = await providerStore.getDefaults(profileId);
        return {
            success: false,
            reason: 'model_not_found',
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }

    await providerStore.setDefaults(profileId, providerId, modelId);
    const defaults = await providerStore.getDefaults(profileId);
    return {
        success: true,
        reason: null,
        defaultProviderId: defaults.providerId,
        defaultModelId: defaults.modelId,
    };
}

export async function listAuthStates(profileId: string): Promise<ProviderAuthStateRecord[]> {
    return providerAuthStore.listByProfile(profileId);
}

export async function listDiscoverySnapshots(profileId: string) {
    return providerCatalogStore.listDiscoverySnapshotsByProfile(profileId);
}

export async function listUsageSummaries(profileId: string): Promise<ProviderUsageSummary[]> {
    return runUsageStore.summarizeByProfile(profileId);
}

export async function getOpenAISubscriptionUsage(profileId: string): Promise<OpenAISubscriptionUsageSummary> {
    return runUsageStore.summarizeOpenAISubscriptionUsage(profileId);
}

export async function getOpenAISubscriptionRateLimits(profileId: string): Promise<OpenAISubscriptionRateLimitsSummary> {
    const summary = await getOpenAISubscriptionRateLimitsFromWham(profileId);
    if (summary.source === 'unavailable') {
        appLog.warn({
            tag: 'provider.openai-subscription-rate-limits',
            message: 'OpenAI subscription rate limits unavailable.',
            profileId,
            reason: summary.reason ?? null,
            detail: summary.detail ?? null,
        });
        return summary;
    }

    appLog.info({
        tag: 'provider.openai-subscription-rate-limits',
        message: 'Fetched OpenAI subscription rate limits.',
        profileId,
        limitsCount: summary.limits.length,
        hasPrimary: Boolean(summary.primary),
        hasSecondary: Boolean(summary.secondary),
    });

    return summary;
}

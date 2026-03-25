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
import { getConnectionProfileState, resolveApiKeyCta } from '@/app/backend/providers/service/endpointProfiles';
import { getExecutionPreferenceState } from '@/app/backend/providers/service/executionPreferences';
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
import type {
    ProviderSpecialistDefaultModeKey,
    ProviderSpecialistDefaultTopLevelTab,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/app/backend/runtime/contracts/types/provider';
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
            const connectionProfileResult = await getConnectionProfileState(profileId, provider.id);
            const connectionProfile = connectionProfileResult.isErr()
                ? {
                      providerId: provider.id,
                      optionProfileId: definition.endpointProfiles[0]?.value ?? 'default',
                      label: definition.endpointProfiles[0]?.label ?? 'Default',
                      options: definition.endpointProfiles.map((profile) => ({
                          value: profile.value,
                          label: profile.label,
                      })),
                      resolvedBaseUrl: null,
                  }
                : connectionProfileResult.value;
            const apiKeyCtaResult = await resolveApiKeyCta(profileId, provider.id);
            const apiKeyCta = apiKeyCtaResult.isErr()
                ? { label: 'Get API Key', url: 'https://kilocode.ai' }
                : apiKeyCtaResult.value;
            const executionPreferenceResult =
                provider.id === 'openai'
                    ? await getExecutionPreferenceState(profileId, provider.id)
                    : null;
            return {
                ...provider,
                isDefault: defaults.providerId === provider.id,
                authMethod: authState.authMethod,
                authState: authState.authState,
                availableAuthMethods: definition.authMethods,
                connectionProfile: {
                    ...connectionProfile,
                    ...(authState.organizationId ? { organizationId: authState.organizationId } : {}),
                },
                apiKeyCta,
                ...(executionPreferenceResult && executionPreferenceResult.isOk()
                    ? { executionPreference: executionPreferenceResult.value }
                    : {}),
                features: {
                    catalogStrategy: definition.catalogStrategy,
                    supportsKiloRouting: definition.supportsKiloRouting,
                    supportsModelProviderListing: definition.supportsModelProviderListing,
                    supportsConnectionOptions:
                        definition.endpointProfiles.length > 1 ||
                        definition.supportsCustomBaseUrl ||
                        definition.supportsOrganizationScope,
                    supportsCustomBaseUrl: definition.supportsCustomBaseUrl,
                    supportsOrganizationScope: definition.supportsOrganizationScope,
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

export async function getSpecialistDefaults(profileId: string): Promise<ProviderSpecialistDefaultRecord[]> {
    return providerStore.getSpecialistDefaults(profileId);
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

export async function setSpecialistDefault(input: {
    profileId: string;
    topLevelTab: ProviderSpecialistDefaultTopLevelTab;
    modeKey: ProviderSpecialistDefaultModeKey;
    providerId: RuntimeProviderId;
    modelId: string;
}): Promise<{
    success: boolean;
    reason:
        | 'provider_not_found'
        | 'model_not_found'
        | 'model_tools_required'
        | 'specialist_default_not_supported'
        | null;
    specialistDefaults: ProviderSpecialistDefaultRecord[];
    specialistDefault?: ProviderSpecialistDefaultRecord;
}> {
    const supportedTarget =
        (input.topLevelTab === 'agent' &&
            (input.modeKey === 'ask' || input.modeKey === 'code' || input.modeKey === 'debug')) ||
        (input.topLevelTab === 'orchestrator' && (input.modeKey === 'orchestrate' || input.modeKey === 'debug'));
    if (!supportedTarget) {
        return {
            success: false,
            reason: 'specialist_default_not_supported',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    const ensuredProviderResult = await ensureSupportedProvider(input.providerId);
    if (ensuredProviderResult.isErr()) {
        appLog.warn({
            tag: 'provider.read-service',
            message: 'Rejected specialist default update due to unsupported or unregistered provider.',
            profileId: input.profileId,
            providerId: input.providerId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            error: ensuredProviderResult.error.message,
        });
        return {
            success: false,
            reason: 'provider_not_found',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    const modelCapabilities = await providerStore.getModelCapabilities(input.profileId, input.providerId, input.modelId);
    if (!modelCapabilities) {
        return {
            success: false,
            reason: 'model_not_found',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    if (!modelCapabilities.features.supportsTools) {
        return {
            success: false,
            reason: 'model_tools_required',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    const specialistDefaults = await providerStore.setSpecialistDefault(input.profileId, input);
    const specialistDefault = specialistDefaults.find(
        (value) => value.topLevelTab === input.topLevelTab && value.modeKey === input.modeKey
    );
    return {
        success: true,
        reason: null,
        specialistDefaults,
        ...(specialistDefault ? { specialistDefault } : {}),
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

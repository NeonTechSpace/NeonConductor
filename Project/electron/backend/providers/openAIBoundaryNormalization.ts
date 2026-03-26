import { getPersistence } from '@/app/backend/persistence/db';
import { providerAuthStore, providerSecretStore } from '@/app/backend/persistence/stores';
import { settingsStore } from '@/app/backend/persistence/stores/profile/settingsStore';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import { isSupportedProviderSpecialistDefaultTarget } from '@/app/backend/runtime/contracts/specialistDefaults';
import type { ProviderSpecialistDefaultRecord } from '@/app/backend/runtime/contracts/types/provider';
import { appLog } from '@/app/main/logging';

import { providerIds } from '@/shared/contracts';

const SPECIALIST_DEFAULTS_KEY = 'specialist_defaults';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCodexModelId(modelId: string): boolean {
    return modelId.startsWith('openai/') && modelId.toLowerCase().includes('codex');
}

function toCodexModelId(modelId: string): string {
    return isCodexModelId(modelId) ? modelId.replace(/^openai\//, 'openai_codex/') : modelId;
}

function isProviderSpecialistDefaultProviderId(value: string): value is ProviderSpecialistDefaultRecord['providerId'] {
    return providerIds.some((providerId) => providerId === value);
}

export function normalizeSpecialistDefaults(value: unknown): ProviderSpecialistDefaultRecord[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    let changed = false;
    const normalized: ProviderSpecialistDefaultRecord[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) {
            return undefined;
        }

        const topLevelTab = typeof entry.topLevelTab === 'string' ? entry.topLevelTab : undefined;
        const modeKey = typeof entry.modeKey === 'string' ? entry.modeKey : undefined;
        const providerId = typeof entry.providerId === 'string' ? entry.providerId : undefined;
        const modelId = typeof entry.modelId === 'string' ? entry.modelId : undefined;
        if (!topLevelTab || !modeKey || !providerId || !modelId) {
            return undefined;
        }
        const target = { topLevelTab, modeKey };
        if (!isSupportedProviderSpecialistDefaultTarget(target)) {
            return undefined;
        }
        if (!isProviderSpecialistDefaultProviderId(providerId)) {
            return undefined;
        }

        const nextProviderId = providerId === 'openai' && isCodexModelId(modelId) ? 'openai_codex' : providerId;
        const nextModelId =
            providerId === 'openai_codex' || nextProviderId === 'openai_codex' ? toCodexModelId(modelId) : modelId;
        if (nextProviderId !== providerId || nextModelId !== modelId) {
            changed = true;
        }

        normalized.push({
            topLevelTab: target.topLevelTab,
            modeKey: target.modeKey,
            providerId: nextProviderId,
            modelId: nextModelId,
        });
    }

    return changed ? normalized : undefined;
}

export async function normalizeOpenAIBoundaryForProfile(profileId: string): Promise<void> {
    const { db } = getPersistence();
    const [
        openAIAuthState,
        codexAuthState,
        openAIApiKey,
        openAIAccessToken,
        openAIRefreshToken,
        defaults,
        specialistDefaults,
    ] = await Promise.all([
        providerAuthStore.getByProfileAndProvider(profileId, 'openai'),
        providerAuthStore.getByProfileAndProvider(profileId, 'openai_codex'),
        providerSecretStore.getValue(profileId, 'openai', 'api_key'),
        providerSecretStore.getValue(profileId, 'openai', 'access_token'),
        providerSecretStore.getValue(profileId, 'openai', 'refresh_token'),
        Promise.all([
            settingsStore.getStringOptional(profileId, 'default_provider_id'),
            settingsStore.getStringOptional(profileId, 'default_model_id'),
        ]),
        settingsStore.getJsonOptional(profileId, SPECIALIST_DEFAULTS_KEY, Array.isArray),
    ]);

    const shouldMigrateOAuthState =
        openAIAuthState !== null &&
        (openAIAuthState.authMethod === 'oauth_pkce' || openAIAuthState.authMethod === 'oauth_device');

    if (openAIAccessToken) {
        await providerSecretStore.upsertValue({
            profileId,
            providerId: 'openai_codex',
            secretKind: 'access_token',
            secretValue: openAIAccessToken,
        });
        await providerSecretStore.deleteByProfileProviderAndKind(profileId, 'openai', 'access_token');
    }

    if (openAIRefreshToken) {
        await providerSecretStore.upsertValue({
            profileId,
            providerId: 'openai_codex',
            secretKind: 'refresh_token',
            secretValue: openAIRefreshToken,
        });
        await providerSecretStore.deleteByProfileProviderAndKind(profileId, 'openai', 'refresh_token');
    }

    if (shouldMigrateOAuthState) {
        const nextCodexAuthState =
            codexAuthState && codexAuthState.authState !== 'logged_out' ? codexAuthState : openAIAuthState;
        await providerAuthStore.upsert({
            profileId,
            providerId: 'openai_codex',
            authMethod: nextCodexAuthState.authMethod,
            authState: nextCodexAuthState.authState,
            ...(nextCodexAuthState.accountId ? { accountId: nextCodexAuthState.accountId } : {}),
            ...(nextCodexAuthState.tokenExpiresAt ? { tokenExpiresAt: nextCodexAuthState.tokenExpiresAt } : {}),
            ...(nextCodexAuthState.lastErrorCode ? { lastErrorCode: nextCodexAuthState.lastErrorCode } : {}),
            ...(nextCodexAuthState.lastErrorMessage ? { lastErrorMessage: nextCodexAuthState.lastErrorMessage } : {}),
        });

        await providerAuthStore.upsert({
            profileId,
            providerId: 'openai',
            authMethod: openAIApiKey ? 'api_key' : 'none',
            authState: openAIApiKey ? 'configured' : 'logged_out',
        });
    }

    await db
        .updateTable('provider_auth_flows')
        .set({
            provider_id: 'openai_codex',
            updated_at: nowIso(),
        })
        .where('profile_id', '=', profileId)
        .where('provider_id', '=', 'openai')
        .where('auth_method', 'in', ['oauth_pkce', 'oauth_device'])
        .execute();

    const [defaultProviderId, defaultModelId] = defaults;
    if (defaultProviderId === 'openai' && defaultModelId && isCodexModelId(defaultModelId)) {
        await settingsStore.setString(profileId, 'default_provider_id', 'openai_codex');
        await settingsStore.setString(profileId, 'default_model_id', toCodexModelId(defaultModelId));
    } else if (defaultProviderId === 'openai_codex' && defaultModelId) {
        const normalizedModelId = toCodexModelId(defaultModelId);
        if (normalizedModelId !== defaultModelId) {
            await settingsStore.setString(profileId, 'default_model_id', normalizedModelId);
        }
    }

    const normalizedSpecialistDefaults = normalizeSpecialistDefaults(specialistDefaults);
    if (normalizedSpecialistDefaults) {
        await settingsStore.setJson(profileId, SPECIALIST_DEFAULTS_KEY, normalizedSpecialistDefaults);
    }

    if (
        openAIAccessToken ||
        openAIRefreshToken ||
        shouldMigrateOAuthState ||
        (defaultProviderId === 'openai' && defaultModelId !== undefined && isCodexModelId(defaultModelId)) ||
        normalizedSpecialistDefaults
    ) {
        appLog.info({
            tag: 'provider.openai-boundary-normalization',
            message: 'Normalized legacy OpenAI OAuth/Codex state to the dedicated openai_codex provider boundary.',
            profileId,
        });
    }
}

import { getProviderDefinition, providerIds } from '@/app/backend/providers/registry';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

export const OPENAI_OAUTH_AUTHORIZE_URL =
    process.env['OPENAI_OAUTH_AUTHORIZE_URL']?.trim() || 'https://auth.openai.com/oauth/authorize';
export const OPENAI_OAUTH_TOKEN_URL =
    process.env['OPENAI_OAUTH_TOKEN_URL']?.trim() || 'https://auth.openai.com/oauth/token';
export const OPENAI_OAUTH_DEVICE_CODE_URL =
    process.env['OPENAI_OAUTH_DEVICE_CODE_URL']?.trim() || 'https://auth.openai.com/oauth/device/code';
export const OPENAI_OAUTH_CLIENT_ID = process.env['OPENAI_OAUTH_CLIENT_ID']?.trim() || 'openai-codex';
export const OPENAI_OAUTH_REDIRECT_URI =
    process.env['OPENAI_OAUTH_REDIRECT_URI']?.trim() || 'http://127.0.0.1:1455/provider/openai_codex/callback';

export function getAuthMethodsForProvider(providerId: RuntimeProviderId): ProviderAuthMethod[] {
    return getProviderDefinition(providerId).authMethods;
}

export function listProviderAuthMethods(): Array<{ providerId: RuntimeProviderId; methods: ProviderAuthMethod[] }> {
    return providerIds.map((providerId) => ({
        providerId,
        methods: getAuthMethodsForProvider(providerId),
    }));
}

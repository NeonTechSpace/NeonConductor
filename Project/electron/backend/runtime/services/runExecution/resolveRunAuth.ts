import { providerAuthStore } from '@/app/backend/persistence/stores';
import { readProviderSecretValue } from '@/app/backend/providers/auth/providerSecrets';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { ResolvedRunAuth } from '@/app/backend/runtime/services/runExecution/types';

function isOauthMethod(method: string): method is 'device_code' | 'oauth_pkce' | 'oauth_device' {
    return method === 'device_code' || method === 'oauth_pkce' || method === 'oauth_device';
}

export async function resolveRunAuth(input: {
    profileId: string;
    providerId: RuntimeProviderId;
}): Promise<RunExecutionResult<ResolvedRunAuth>> {
    const state = await providerAuthStore.getByProfileAndProvider(input.profileId, input.providerId);
    if (!state || state.authMethod === 'none' || state.authState === 'logged_out') {
        return errRunExecution(
            'provider_not_authenticated',
            `Provider "${input.providerId}" is not authenticated/configured.`,
            {
                action: {
                    code: 'provider_not_runnable',
                    providerId: input.providerId,
                },
            }
        );
    }

    if (state.authMethod === 'api_key') {
        if (state.authState !== 'configured' && state.authState !== 'authenticated') {
            return errRunExecution(
                'provider_auth_invalid_state',
                `Provider "${input.providerId}" auth state "${state.authState}" is not runnable for API key mode.`,
                {
                    action: {
                        code: 'provider_not_runnable',
                        providerId: input.providerId,
                    },
                }
            );
        }

        const apiKey = await readProviderSecretValue(input.profileId, input.providerId, 'api_key');
        if (!apiKey) {
            return errRunExecution(
                'provider_secret_missing',
                `Provider "${input.providerId}" API key is missing from secret store.`,
                {
                    action: {
                        code: 'provider_not_runnable',
                        providerId: input.providerId,
                    },
                }
            );
        }

        return okRunExecution({
            authMethod: state.authMethod,
            apiKey,
            ...(state.organizationId ? { organizationId: state.organizationId } : {}),
        });
    }

    if (isOauthMethod(state.authMethod)) {
        if (state.authState !== 'authenticated') {
            return errRunExecution(
                'provider_auth_invalid_state',
                `Provider "${input.providerId}" auth state "${state.authState}" is not runnable for OAuth/device mode.`,
                {
                    action: {
                        code: 'provider_not_runnable',
                        providerId: input.providerId,
                    },
                }
            );
        }

        const accessToken = await readProviderSecretValue(input.profileId, input.providerId, 'access_token');
        if (!accessToken) {
            return errRunExecution(
                'provider_secret_missing',
                `Provider "${input.providerId}" access token is missing from secret store.`,
                {
                    action: {
                        code: 'provider_not_runnable',
                        providerId: input.providerId,
                    },
                }
            );
        }

        return okRunExecution({
            authMethod: state.authMethod,
            accessToken,
            ...(state.organizationId ? { organizationId: state.organizationId } : {}),
        });
    }

    return errRunExecution(
        'provider_auth_unsupported',
        `Provider "${input.providerId}" auth method is not supported for runtime.`,
        {
            action: {
                code: 'provider_not_runnable',
                providerId: input.providerId,
            },
        }
    );
}

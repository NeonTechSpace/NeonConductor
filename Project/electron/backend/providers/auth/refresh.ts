import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { persistAuthenticatedState } from '@/app/backend/providers/auth/authStateService';
import { errAuthExecution, okAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import { refreshOpenAIToken } from '@/app/backend/providers/auth/openaiOAuthClient';
import { readProviderSecretValue } from '@/app/backend/providers/auth/providerSecrets';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export async function runRefreshOperation(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    refreshLocks: Map<string, Promise<AuthExecutionResult<ProviderAuthStateRecord>>>;
}): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
    if (input.providerId !== 'openai_codex') {
        return errAuthExecution('refresh_not_supported', 'Refresh auth is currently supported only for openai_codex.');
    }

    const lockKey = `${input.profileId}:${input.providerId}`;
    const inFlight = input.refreshLocks.get(lockKey);
    if (inFlight) {
        return inFlight;
    }

    const refreshPromise = (async (): Promise<AuthExecutionResult<ProviderAuthStateRecord>> => {
        const refreshToken = await readProviderSecretValue(input.profileId, input.providerId, 'refresh_token');
        if (!refreshToken) {
            return errAuthExecution('refresh_token_missing', 'No refresh token configured for provider.');
        }

        const tokenResult = await refreshOpenAIToken(refreshToken);
        if (tokenResult.isErr()) {
            return errAuthExecution(tokenResult.error.code, tokenResult.error.message);
        }

        const token = tokenResult.value;
        const state = await persistAuthenticatedState({
            profileId: input.profileId,
            providerId: input.providerId,
            authMethod: 'oauth_pkce',
            accessToken: token.accessToken,
            refreshToken: token.refreshToken ?? refreshToken,
            ...(token.expiresAt ? { tokenExpiresAt: token.expiresAt } : {}),
            ...(token.accountId ? { accountId: token.accountId } : {}),
        });
        return okAuthExecution(state);
    })();

    input.refreshLocks.set(lockKey, refreshPromise);
    try {
        return await refreshPromise;
    } finally {
        input.refreshLocks.delete(lockKey);
    }
}

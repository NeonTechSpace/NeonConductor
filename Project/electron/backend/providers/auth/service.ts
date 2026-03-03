import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import {
    getAccountContext,
    setOrganization as setOrganizationContext,
} from '@/app/backend/providers/auth/authAccountContextService';
import {
    clearAuth,
    ensureProviderExists,
    getAuthState,
    setApiKey,
    persistAuthenticatedState,
} from '@/app/backend/providers/auth/authStateService';
import { AUTH_METHODS_BY_PROVIDER } from '@/app/backend/providers/auth/constants';
import { refreshOpenAIToken } from '@/app/backend/providers/auth/openaiOAuthClient';
import { cancelAuthFlow, completeAuthFlow, pollAuthFlow } from '@/app/backend/providers/auth/pollAuthFlow';
import { readSecretValue } from '@/app/backend/providers/auth/secretRefs';
import { startAuthFlow } from '@/app/backend/providers/auth/startAuthFlow';
import type { PollAuthResult, ProviderAccountContextResult, StartAuthResult } from '@/app/backend/providers/auth/types';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

export class ProviderAuthExecutionService {
    private readonly refreshLocks = new Map<string, Promise<ProviderAuthStateRecord>>();

    listAuthMethods(profileId: string): Array<{ providerId: RuntimeProviderId; methods: ProviderAuthMethod[] }> {
        void profileId;
        return (Object.keys(AUTH_METHODS_BY_PROVIDER) as RuntimeProviderId[]).map((providerId) => ({
            providerId,
            methods: AUTH_METHODS_BY_PROVIDER[providerId],
        }));
    }

    getAuthState(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
        return getAuthState(profileId, providerId);
    }

    setApiKey(profileId: string, providerId: RuntimeProviderId, apiKey: string): Promise<ProviderAuthStateRecord> {
        return setApiKey(profileId, providerId, apiKey);
    }

    clearAuth(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<{ cleared: boolean; authState: ProviderAuthStateRecord }> {
        return clearAuth(profileId, providerId);
    }

    async startAuth(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        method: ProviderAuthMethod;
    }): Promise<StartAuthResult> {
        await ensureProviderExists(input.providerId);
        return startAuthFlow(input);
    }

    async pollAuth(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        flowId: string;
    }): Promise<PollAuthResult> {
        await ensureProviderExists(input.providerId);
        return pollAuthFlow(input);
    }

    async completeAuth(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        flowId: string;
        code?: string;
    }): Promise<PollAuthResult> {
        await ensureProviderExists(input.providerId);
        return completeAuthFlow(input);
    }

    async cancelAuth(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        flowId: string;
    }): Promise<PollAuthResult> {
        await ensureProviderExists(input.providerId);
        return cancelAuthFlow(input);
    }

    async refreshAuth(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
        await ensureProviderExists(providerId);
        if (providerId !== 'openai') {
            throw new Error('Refresh auth is currently supported only for openai.');
        }

        const lockKey = `${profileId}:${providerId}`;
        const inFlight = this.refreshLocks.get(lockKey);
        if (inFlight) {
            return inFlight;
        }

        const refreshPromise = (async () => {
            const refreshToken = await readSecretValue(profileId, providerId, 'refresh_token');
            if (!refreshToken) {
                throw new Error('No refresh token configured for provider.');
            }

            const token = await refreshOpenAIToken(refreshToken);
            return persistAuthenticatedState({
                profileId,
                providerId,
                authMethod: 'oauth_pkce',
                accessToken: token.accessToken,
                refreshToken: token.refreshToken ?? refreshToken,
                ...(token.expiresAt ? { tokenExpiresAt: token.expiresAt } : {}),
                ...(token.accountId ? { accountId: token.accountId } : {}),
            });
        })();

        this.refreshLocks.set(lockKey, refreshPromise);
        try {
            return await refreshPromise;
        } finally {
            this.refreshLocks.delete(lockKey);
        }
    }

    getAccountContext(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAccountContextResult> {
        return getAccountContext(profileId, providerId);
    }

    setOrganization(
        profileId: string,
        providerId: 'kilo',
        organizationId?: string | null
    ): Promise<ProviderAccountContextResult> {
        return setOrganizationContext(profileId, providerId, organizationId);
    }
}

export const providerAuthExecutionService = new ProviderAuthExecutionService();

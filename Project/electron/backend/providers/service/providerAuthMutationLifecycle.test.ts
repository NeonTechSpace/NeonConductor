import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { errAuthExecution, okAuthExecution } from '@/app/backend/providers/auth/errors';
import {
    createProviderCatalogInvalidationPolicy,
} from '@/app/backend/providers/service/providerCatalogInvalidationPolicy';
import { createProviderAuthMutationLifecycle } from '@/app/backend/providers/service/providerAuthMutationLifecycle';

const ensureNormalizedProviderProfileStateMock = vi.fn();
const setApiKeyMock = vi.fn();
const clearAuthMock = vi.fn();
const startAuthMock = vi.fn();
const pollAuthMock = vi.fn();
const completeAuthMock = vi.fn();
const cancelAuthMock = vi.fn();
const refreshAuthMock = vi.fn();
const getAccountContextMock = vi.fn();
const flushProviderScopeMock = vi.fn();
const invalidateProviderScopeMock = vi.fn();

function createAuthState(
    providerId: 'openai' | 'kilo',
    authState: ProviderAuthStateRecord['authState']
): ProviderAuthStateRecord {
    return {
        profileId: 'profile_local_default',
        providerId,
        authMethod: 'api_key',
        authState,
        updatedAt: '2026-03-30T00:00:00.000Z',
    } as ProviderAuthStateRecord;
}

function createLifecycle() {
    return createProviderAuthMutationLifecycle({
        ensureNormalizedProviderProfileState: ensureNormalizedProviderProfileStateMock,
        authExecutionGateway: {
            setApiKey: setApiKeyMock,
            clearAuth: clearAuthMock,
            startAuth: startAuthMock,
            pollAuth: pollAuthMock,
            completeAuth: completeAuthMock,
            cancelAuth: cancelAuthMock,
            refreshAuth: refreshAuthMock,
            getAccountContext: getAccountContextMock,
        },
        catalogInvalidationPolicy: createProviderCatalogInvalidationPolicy(),
        catalogInvalidationActions: {
            flushProviderScope: flushProviderScopeMock,
            invalidateProviderScope: invalidateProviderScopeMock,
        },
    });
}

describe('providerAuthMutationLifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ensureNormalizedProviderProfileStateMock.mockResolvedValue(undefined);
        flushProviderScopeMock.mockResolvedValue(undefined);
        invalidateProviderScopeMock.mockResolvedValue(undefined);
        setApiKeyMock.mockResolvedValue(okAuthExecution(createAuthState('openai', 'configured')));
        clearAuthMock.mockResolvedValue(
            okAuthExecution({
                cleared: true,
                authState: createAuthState('openai', 'logged_out'),
            })
        );
        startAuthMock.mockResolvedValue(okAuthExecution({ flow: { id: 'flow_1' }, pollAfterSeconds: 1 }));
        pollAuthMock.mockResolvedValue(
            okAuthExecution({
                flow: { id: 'flow_1' },
                state: createAuthState('openai', 'authenticated'),
            })
        );
        completeAuthMock.mockResolvedValue(
            okAuthExecution({
                flow: { id: 'flow_1' },
                state: createAuthState('openai', 'authenticated'),
            })
        );
        cancelAuthMock.mockResolvedValue(
            okAuthExecution({
                flow: { id: 'flow_1' },
                state: createAuthState('openai', 'logged_out'),
            })
        );
        refreshAuthMock.mockResolvedValue(okAuthExecution(createAuthState('openai', 'authenticated')));
        getAccountContextMock.mockResolvedValue(
            okAuthExecution({
                profileId: 'profile_local_default',
                providerId: 'openai',
                authState: createAuthState('openai', 'authenticated'),
            })
        );
    });

    it('flushes non-Kilo auth mutations and invalidates Kilo auth mutations', async () => {
        const lifecycle = createLifecycle();

        await lifecycle.setApiKey('profile_local_default', 'openai', 'test-key');
        await lifecycle.setApiKey('profile_local_default', 'kilo', 'test-key');

        expect(flushProviderScopeMock).toHaveBeenCalledWith('profile_local_default', 'openai');
        expect(invalidateProviderScopeMock).toHaveBeenCalledWith('profile_local_default', 'kilo');
    });

    it('does not invalidate when auth polling remains pending', async () => {
        pollAuthMock.mockResolvedValueOnce(
            okAuthExecution({
                flow: { id: 'flow_1' },
                state: createAuthState('openai', 'pending'),
            })
        );

        const lifecycle = createLifecycle();
        await lifecycle.pollAuth({ profileId: 'profile_local_default', providerId: 'openai', flowId: 'flow_1' });

        expect(flushProviderScopeMock).not.toHaveBeenCalled();
        expect(invalidateProviderScopeMock).not.toHaveBeenCalled();
    });

    it('invalidates after auth polling leaves the pending state', async () => {
        pollAuthMock.mockResolvedValueOnce(
            okAuthExecution({
                flow: { id: 'flow_1' },
                state: createAuthState('kilo', 'authenticated'),
            })
        );

        const lifecycle = createLifecycle();
        await lifecycle.pollAuth({ profileId: 'profile_local_default', providerId: 'kilo', flowId: 'flow_1' });

        expect(invalidateProviderScopeMock).toHaveBeenCalledWith('profile_local_default', 'kilo');
    });

    it('does not invalidate on failed auth operations', async () => {
        setApiKeyMock.mockResolvedValueOnce(errAuthExecution('invalid_payload', 'bad key'));

        const lifecycle = createLifecycle();
        const result = await lifecycle.setApiKey('profile_local_default', 'openai', 'bad-key');

        expect(result.isErr()).toBe(true);
        expect(flushProviderScopeMock).not.toHaveBeenCalled();
        expect(invalidateProviderScopeMock).not.toHaveBeenCalled();
    });

    it('delegates non-mutating auth helpers after normalization', async () => {
        const lifecycle = createLifecycle();

        await lifecycle.startAuth({ profileId: 'profile_local_default', providerId: 'openai', method: 'api_key' });
        await lifecycle.cancelAuth({ profileId: 'profile_local_default', providerId: 'openai', flowId: 'flow_1' });
        await lifecycle.getAccountContext('profile_local_default', 'openai');

        expect(ensureNormalizedProviderProfileStateMock).toHaveBeenCalledTimes(3);
        expect(startAuthMock).toHaveBeenCalled();
        expect(cancelAuthMock).toHaveBeenCalled();
        expect(getAccountContextMock).toHaveBeenCalled();
    });

    it('applies the expected catalog fallout for clear, complete, and refresh auth mutations', async () => {
        const lifecycle = createLifecycle();

        await lifecycle.clearAuth('profile_local_default', 'openai');
        await lifecycle.completeAuth({ profileId: 'profile_local_default', providerId: 'kilo', flowId: 'flow_1' });
        await lifecycle.refreshAuth('profile_local_default', 'openai');

        expect(flushProviderScopeMock).toHaveBeenCalledWith('profile_local_default', 'openai');
        expect(invalidateProviderScopeMock).toHaveBeenCalledWith('profile_local_default', 'kilo');
        expect(refreshAuthMock).toHaveBeenCalledWith('profile_local_default', 'openai', undefined);
    });
});

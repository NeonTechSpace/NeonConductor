import { describe, expect, it, vi } from 'vitest';

import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import {
    applyProviderCatalogInvalidationDecision,
    createProviderCatalogInvalidationPolicy,
} from '@/app/backend/providers/service/providerCatalogInvalidationPolicy';

function createAuthState(
    providerId: ProviderAuthStateRecord['providerId'],
    authState: ProviderAuthStateRecord['authState']
): ProviderAuthStateRecord {
    return {
        profileId: 'profile_local_default',
        providerId,
        authMethod: 'none',
        authState,
        updatedAt: '2026-03-30T00:00:00.000Z',
    };
}

describe('providerCatalogInvalidationPolicy', () => {
    it('flushes auth fallout for non-Kilo providers', () => {
        const policy = createProviderCatalogInvalidationPolicy();
        expect(policy.resolveAuthMutation('profile_local_default', 'openai')).toEqual({
            kind: 'flush',
            profileId: 'profile_local_default',
            providerId: 'openai',
        });
    });

    it('invalidates auth fallout for Kilo providers', () => {
        const policy = createProviderCatalogInvalidationPolicy();
        expect(policy.resolveAuthMutation('profile_local_default', 'kilo')).toEqual({
            kind: 'invalidate',
            profileId: 'profile_local_default',
            providerId: 'kilo',
        });
    });

    it('skips invalidation when auth poll remains pending', () => {
        const policy = createProviderCatalogInvalidationPolicy();
        expect(policy.resolveAuthPoll(createAuthState('openai', 'pending'))).toEqual({
            kind: 'none',
            profileId: 'profile_local_default',
            providerId: 'openai',
        });
    });

    it('applies the expected fallback action for auth poll completion', async () => {
        const policy = createProviderCatalogInvalidationPolicy();
        const actions = {
            flushProviderScope: vi.fn().mockResolvedValue(undefined),
            invalidateProviderScope: vi.fn().mockResolvedValue(undefined),
        };

        await applyProviderCatalogInvalidationDecision(actions, policy.resolveAuthPoll(createAuthState('kilo', 'authenticated')));

        expect(actions.flushProviderScope).not.toHaveBeenCalled();
        expect(actions.invalidateProviderScope).toHaveBeenCalledWith('profile_local_default', 'kilo');
    });

    it('always invalidates catalog changes for connection profile and organization mutations', () => {
        const policy = createProviderCatalogInvalidationPolicy();

        expect(policy.resolveConnectionProfileMutation('profile_local_default', 'openai')).toEqual({
            kind: 'invalidate',
            profileId: 'profile_local_default',
            providerId: 'openai',
        });
        expect(policy.resolveOrganizationMutation('profile_local_default', 'kilo')).toEqual({
            kind: 'invalidate',
            profileId: 'profile_local_default',
            providerId: 'kilo',
        });
        expect(policy.resolveCatalogSyncMutation('profile_local_default', 'openai')).toEqual({
            kind: 'none',
            profileId: 'profile_local_default',
            providerId: 'openai',
        });
    });
});

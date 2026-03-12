import { beforeEach, describe, expect, it, vi } from 'vitest';

import { okProviderService } from '@/app/backend/providers/service/errors';

const {
    getAuthStateMock,
    resolveSecretMock,
    resolveConnectionProfileMock,
    resolveProviderBaseUrlMock,
} = vi.hoisted(() => ({
    getAuthStateMock: vi.fn(),
    resolveSecretMock: vi.fn(),
    resolveConnectionProfileMock: vi.fn(),
    resolveProviderBaseUrlMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/providerAuthExecutionService', () => ({
    providerAuthExecutionService: {
        getAuthState: getAuthStateMock,
    },
}));

vi.mock('@/app/backend/providers/service/helpers', async () => {
    const actual = await vi.importActual<typeof import('@/app/backend/providers/service/helpers')>(
        '@/app/backend/providers/service/helpers'
    );
    return {
        ...actual,
        resolveSecret: resolveSecretMock,
    };
});

vi.mock('@/app/backend/providers/service/endpointProfiles', () => ({
    resolveConnectionProfile: resolveConnectionProfileMock,
}));

vi.mock('@/app/backend/providers/providerBaseUrls', () => ({
    resolveProviderBaseUrl: resolveProviderBaseUrlMock,
}));

import { resolveProviderCatalogFetchState } from '@/app/backend/providers/metadata/catalogContext';

describe('provider catalog context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getAuthStateMock.mockResolvedValue({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            authMethod: 'api_key',
            authState: 'configured',
            updatedAt: '2026-03-12T00:00:00.000Z',
        });
        resolveSecretMock.mockImplementation(
            async (_profileId: string, _providerId: string, secretKind: 'api_key' | 'access_token') =>
                secretKind === 'api_key' ? 'credential-a' : undefined
        );
        resolveConnectionProfileMock.mockResolvedValue(
            okProviderService({
                providerId: 'kilo',
                optionProfileId: 'gateway',
                label: 'Gateway',
                options: [{ value: 'gateway', label: 'Gateway' }],
                resolvedBaseUrl: 'https://api.kilo.ai/api/gateway',
            })
        );
        resolveProviderBaseUrlMock.mockReturnValue('https://api.kilo.ai/api/gateway');
    });

    it('separates cache keys for different auth credentials', async () => {
        const firstResult = await resolveProviderCatalogFetchState('profile_local_default', 'kilo');
        expect(firstResult.isOk()).toBe(true);
        if (firstResult.isErr()) {
            throw new Error(firstResult.error.message);
        }

        resolveSecretMock.mockImplementationOnce(
            async (_profileId: string, _providerId: string, secretKind: 'api_key' | 'access_token') =>
                secretKind === 'api_key' ? 'credential-b' : undefined
        );

        const secondResult = await resolveProviderCatalogFetchState('profile_local_default', 'kilo');
        expect(secondResult.isOk()).toBe(true);
        if (secondResult.isErr()) {
            throw new Error(secondResult.error.message);
        }

        expect(firstResult.value.context.credentialFingerprint).not.toBe(secondResult.value.context.credentialFingerprint);
        expect(firstResult.value.context.cacheKey).not.toBe(secondResult.value.context.cacheKey);
    });

    it('separates cache keys for different organizations', async () => {
        const firstResult = await resolveProviderCatalogFetchState('profile_local_default', 'kilo');
        expect(firstResult.isOk()).toBe(true);
        if (firstResult.isErr()) {
            throw new Error(firstResult.error.message);
        }

        getAuthStateMock.mockResolvedValueOnce({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            authMethod: 'api_key',
            authState: 'configured',
            organizationId: 'org_b',
            updatedAt: '2026-03-12T00:00:00.000Z',
        });

        const secondResult = await resolveProviderCatalogFetchState('profile_local_default', 'kilo');
        expect(secondResult.isOk()).toBe(true);
        if (secondResult.isErr()) {
            throw new Error(secondResult.error.message);
        }

        expect(firstResult.value.context.organizationId).toBeNull();
        expect(secondResult.value.context.organizationId).toBe('org_b');
        expect(firstResult.value.context.cacheKey).not.toBe(secondResult.value.context.cacheKey);
    });

    it('separates cache keys for different endpoint profiles and base urls', async () => {
        const firstResult = await resolveProviderCatalogFetchState('profile_local_default', 'moonshot');
        expect(firstResult.isOk()).toBe(true);
        if (firstResult.isErr()) {
            throw new Error(firstResult.error.message);
        }

        resolveConnectionProfileMock.mockResolvedValueOnce(
            okProviderService({
                providerId: 'moonshot',
                optionProfileId: 'coding_plan',
                label: 'Coding Plan',
                options: [{ value: 'coding_plan', label: 'Coding Plan' }],
                resolvedBaseUrl: 'https://api.kimi.com/coding/v1',
            })
        );
        resolveProviderBaseUrlMock.mockReturnValueOnce('https://api.kimi.com/coding/v1');

        const secondResult = await resolveProviderCatalogFetchState('profile_local_default', 'moonshot');
        expect(secondResult.isOk()).toBe(true);
        if (secondResult.isErr()) {
            throw new Error(secondResult.error.message);
        }

        expect(firstResult.value.context.optionProfileId).not.toBe(secondResult.value.context.optionProfileId);
        expect(firstResult.value.context.resolvedBaseUrl).not.toBe(secondResult.value.context.resolvedBaseUrl);
        expect(firstResult.value.context.cacheKey).not.toBe(secondResult.value.context.cacheKey);
    });
});

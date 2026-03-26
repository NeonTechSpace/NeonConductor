import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveProviderCatalogFetchState } from '@/app/backend/providers/metadata/catalogContext';
import { okProviderService } from '@/app/backend/providers/service/errors';

const { getAuthStateMock, resolveSecretMock, resolveConnectionProfileMock, resolveProviderBaseUrlMock } = vi.hoisted(
    () => ({
        getAuthStateMock: vi.fn(),
        resolveSecretMock: vi.fn(),
        resolveConnectionProfileMock: vi.fn(),
        resolveProviderBaseUrlMock: vi.fn(),
    })
);

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

describe('provider catalog context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const gatewayConnectionProfileResult = okProviderService({
            providerId: 'kilo',
            optionProfileId: 'gateway',
            label: 'Gateway',
            options: [{ value: 'gateway', label: 'Gateway' }],
            resolvedBaseUrl: 'https://api.kilo.ai/api/gateway',
        });
        gatewayConnectionProfileResult._unsafeUnwrap();
        getAuthStateMock.mockResolvedValue({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            authMethod: 'api_key',
            authState: 'configured',
            updatedAt: '2026-03-12T00:00:00.000Z',
        });
        resolveSecretMock.mockImplementation(
            (_profileId: string, _providerId: string, secretKind: 'api_key' | 'access_token') =>
                Promise.resolve(secretKind === 'api_key' ? 'credential-a' : undefined)
        );
        resolveConnectionProfileMock.mockResolvedValue(gatewayConnectionProfileResult);
        resolveProviderBaseUrlMock.mockReturnValue('https://api.kilo.ai/api/gateway');
    });

    it('separates cache keys for different auth credentials', async () => {
        const firstResult = await resolveProviderCatalogFetchState('profile_local_default', 'kilo');
        expect(firstResult.isOk()).toBe(true);
        const firstValue = firstResult._unsafeUnwrap();

        resolveSecretMock.mockImplementationOnce(
            (_profileId: string, _providerId: string, secretKind: 'api_key' | 'access_token') =>
                Promise.resolve(secretKind === 'api_key' ? 'credential-b' : undefined)
        );

        const secondResult = await resolveProviderCatalogFetchState('profile_local_default', 'kilo');
        expect(secondResult.isOk()).toBe(true);
        const secondValue = secondResult._unsafeUnwrap();

        expect(firstValue.context.credentialFingerprint).not.toBe(secondValue.context.credentialFingerprint);
        expect(firstValue.context.cacheKey).not.toBe(secondValue.context.cacheKey);
    });

    it('separates cache keys for different organizations', async () => {
        const firstResult = await resolveProviderCatalogFetchState('profile_local_default', 'kilo');
        expect(firstResult.isOk()).toBe(true);
        const firstValue = firstResult._unsafeUnwrap();

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
        const secondValue = secondResult._unsafeUnwrap();

        expect(firstValue.context.organizationId).toBeNull();
        expect(secondValue.context.organizationId).toBe('org_b');
        expect(firstValue.context.cacheKey).not.toBe(secondValue.context.cacheKey);
    });

    it('separates cache keys for different endpoint profiles and base urls', async () => {
        const firstResult = await resolveProviderCatalogFetchState('profile_local_default', 'moonshot');
        expect(firstResult.isOk()).toBe(true);
        const firstValue = firstResult._unsafeUnwrap();

        const codingPlanConnectionProfileResult = okProviderService({
            providerId: 'moonshot',
            optionProfileId: 'coding_plan',
            label: 'Coding Plan',
            options: [{ value: 'coding_plan', label: 'Coding Plan' }],
            resolvedBaseUrl: 'https://api.kimi.com/coding/v1',
        });
        codingPlanConnectionProfileResult._unsafeUnwrap();
        resolveConnectionProfileMock.mockResolvedValueOnce(codingPlanConnectionProfileResult);
        resolveProviderBaseUrlMock.mockReturnValueOnce('https://api.kimi.com/coding/v1');

        const secondResult = await resolveProviderCatalogFetchState('profile_local_default', 'moonshot');
        expect(secondResult.isOk()).toBe(true);
        const secondValue = secondResult._unsafeUnwrap();

        expect(firstValue.context.optionProfileId).not.toBe(secondValue.context.optionProfileId);
        expect(firstValue.context.resolvedBaseUrl).not.toBe(secondValue.context.resolvedBaseUrl);
        expect(firstValue.context.cacheKey).not.toBe(secondValue.context.cacheKey);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { okAuthExecution } from '@/app/backend/providers/auth/errors';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { okProviderService, errProviderService } from '@/app/backend/providers/service/errors';
import { createProviderCatalogInvalidationPolicy } from '@/app/backend/providers/service/providerCatalogInvalidationPolicy';
import { createProviderConnectionProfileMutationLifecycle } from '@/app/backend/providers/service/providerConnectionProfileMutationLifecycle';

const ensureNormalizedProviderProfileStateMock = vi.fn();
const getProviderDefinitionMock = vi.fn();
const setConnectionProfileStateMock = vi.fn();
const setOrganizationMock = vi.fn();
const flushProviderScopeMock = vi.fn();
const invalidateProviderScopeMock = vi.fn();
const syncCatalogMock = vi.fn();
const repairDefaultModelIfMissingMock = vi.fn();
const getAuthStateMock = vi.fn();

function createAuthState(): ProviderAuthStateRecord {
    return {
        profileId: 'profile_local_default',
        providerId: 'kilo',
        authMethod: 'api_key',
        authState: 'authenticated',
        organizationId: 'org-1',
        updatedAt: '2026-03-30T00:00:00.000Z',
    } as ProviderAuthStateRecord;
}

function createLifecycle() {
    return createProviderConnectionProfileMutationLifecycle({
        ensureNormalizedProviderProfileState: ensureNormalizedProviderProfileStateMock,
        getProviderDefinition: getProviderDefinitionMock,
        setConnectionProfileState: setConnectionProfileStateMock,
        setOrganization: setOrganizationMock,
        catalogInvalidationPolicy: createProviderCatalogInvalidationPolicy(),
        catalogInvalidationActions: {
            flushProviderScope: flushProviderScopeMock,
            invalidateProviderScope: invalidateProviderScopeMock,
        },
        syncCatalog: syncCatalogMock,
        defaultModelRepairService: {
            repairDefaultModelIfMissing: repairDefaultModelIfMissingMock,
        },
        getAuthState: getAuthStateMock,
    });
}

describe('providerConnectionProfileMutationLifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ensureNormalizedProviderProfileStateMock.mockResolvedValue(undefined);
        getProviderDefinitionMock.mockReturnValue({ supportsOrganizationScope: false });
        setConnectionProfileStateMock.mockResolvedValue(
            okProviderService({
                providerId: 'openai',
                optionProfileId: 'default',
                label: 'Default',
                options: [],
                resolvedBaseUrl: 'https://api.openai.com/v1',
            })
        );
        setOrganizationMock.mockResolvedValue(
            okAuthExecution({
                profileId: 'profile_local_default',
                providerId: 'kilo',
                authState: createAuthState(),
            })
        );
        flushProviderScopeMock.mockResolvedValue(undefined);
        invalidateProviderScopeMock.mockResolvedValue(undefined);
        syncCatalogMock.mockResolvedValue(
            okProviderService({
                ok: true,
                status: 'synced',
                providerId: 'openai',
                modelCount: 1,
            })
        );
        repairDefaultModelIfMissingMock.mockResolvedValue(undefined);
        getAuthStateMock.mockResolvedValue(createAuthState());
    });

    it('fails closed when organization-scoped connection profiles are not supported', async () => {
        const lifecycle = createLifecycle();

        const result = await lifecycle.setConnectionProfile('profile_local_default', 'openai', {
            optionProfileId: 'default',
            organizationId: 'org-1',
        });

        expect(result.isErr()).toBe(true);
        expect(setConnectionProfileStateMock).not.toHaveBeenCalled();
        expect(syncCatalogMock).not.toHaveBeenCalled();
    });

    it('invalidates, syncs, repairs defaults, and returns the rehydrated organization state for Kilo', async () => {
        getProviderDefinitionMock.mockReturnValueOnce({ supportsOrganizationScope: true });
        setConnectionProfileStateMock.mockResolvedValueOnce(
            okProviderService({
                providerId: 'kilo',
                optionProfileId: 'gateway',
                label: 'Gateway',
                options: [],
                resolvedBaseUrl: 'https://api.kilo.ai',
            })
        );

        const lifecycle = createLifecycle();
        const result = await lifecycle.setConnectionProfile(
            'profile_local_default',
            'kilo',
            {
                optionProfileId: 'gateway',
                organizationId: 'org-1',
            },
            { requestId: 'request-1' }
        );

        expect(result.isOk()).toBe(true);
        expect(setOrganizationMock).toHaveBeenCalledWith('profile_local_default', 'kilo', 'org-1');
        expect(invalidateProviderScopeMock).toHaveBeenCalledWith('profile_local_default', 'kilo');
        expect(syncCatalogMock).toHaveBeenCalledWith('profile_local_default', 'kilo', true, {
            requestId: 'request-1',
        });
        expect(repairDefaultModelIfMissingMock).toHaveBeenCalledWith('profile_local_default', 'kilo');
    });

    it('maps connection profile and sync failures without applying downstream fallout', async () => {
        getProviderDefinitionMock.mockReturnValueOnce({ supportsOrganizationScope: true });
        setConnectionProfileStateMock.mockResolvedValueOnce(errProviderService('invalid_payload', 'bad profile'));

        const lifecycle = createLifecycle();
        const profileFailure = await lifecycle.setConnectionProfile('profile_local_default', 'kilo', {
            optionProfileId: 'gateway',
        });

        expect(profileFailure.isErr()).toBe(true);
        expect(syncCatalogMock).not.toHaveBeenCalled();

        setConnectionProfileStateMock.mockResolvedValueOnce(
            okProviderService({
                providerId: 'kilo',
                optionProfileId: 'gateway',
                label: 'Gateway',
                options: [],
                resolvedBaseUrl: 'https://api.kilo.ai',
            })
        );
        syncCatalogMock.mockResolvedValueOnce(errProviderService('request_failed', 'sync failed'));

        const syncFailure = await lifecycle.setConnectionProfile('profile_local_default', 'kilo', {
            optionProfileId: 'gateway',
        });

        expect(syncFailure.isErr()).toBe(true);
        expect(repairDefaultModelIfMissingMock).not.toHaveBeenCalled();
    });
});

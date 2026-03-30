import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errAuthExecution, okAuthExecution } from '@/app/backend/providers/auth/errors';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import {
    createProviderCatalogInvalidationPolicy,
} from '@/app/backend/providers/service/providerCatalogInvalidationPolicy';
import { createProviderOrganizationMutationLifecycle } from '@/app/backend/providers/service/providerOrganizationMutationLifecycle';

const ensureNormalizedProviderProfileStateMock = vi.fn();
const setOrganizationMock = vi.fn();
const flushProviderScopeMock = vi.fn();
const invalidateProviderScopeMock = vi.fn();

describe('providerOrganizationMutationLifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ensureNormalizedProviderProfileStateMock.mockResolvedValue(undefined);
        setOrganizationMock.mockResolvedValue(
            okAuthExecution({
                profileId: 'profile_local_default',
                providerId: 'kilo',
                authState: {
                    profileId: 'profile_local_default',
                    providerId: 'kilo',
                    authMethod: 'api_key',
                    authState: 'authenticated',
                    organizationId: 'org-1',
                    updatedAt: '2026-03-30T00:00:00.000Z',
                },
            } as ProviderAccountContextResult)
        );
        flushProviderScopeMock.mockResolvedValue(undefined);
        invalidateProviderScopeMock.mockResolvedValue(undefined);
    });

    it('invalidates Kilo catalog state after a successful organization update', async () => {
        const lifecycle = createProviderOrganizationMutationLifecycle({
            ensureNormalizedProviderProfileState: ensureNormalizedProviderProfileStateMock,
            setOrganization: setOrganizationMock,
            catalogInvalidationPolicy: createProviderCatalogInvalidationPolicy(),
            catalogInvalidationActions: {
                flushProviderScope: flushProviderScopeMock,
                invalidateProviderScope: invalidateProviderScopeMock,
            },
        });

        const result = await lifecycle.setOrganization('profile_local_default', 'kilo', 'org-1');

        expect(result.isOk()).toBe(true);
        expect(invalidateProviderScopeMock).toHaveBeenCalledWith('profile_local_default', 'kilo');
    });

    it('does not invalidate when the organization update fails', async () => {
        setOrganizationMock.mockResolvedValueOnce(errAuthExecution('invalid_payload', 'bad org'));

        const lifecycle = createProviderOrganizationMutationLifecycle({
            ensureNormalizedProviderProfileState: ensureNormalizedProviderProfileStateMock,
            setOrganization: setOrganizationMock,
            catalogInvalidationPolicy: createProviderCatalogInvalidationPolicy(),
            catalogInvalidationActions: {
                flushProviderScope: flushProviderScopeMock,
                invalidateProviderScope: invalidateProviderScopeMock,
            },
        });

        const result = await lifecycle.setOrganization('profile_local_default', 'kilo', 'org-1');

        expect(result.isErr()).toBe(true);
        expect(flushProviderScopeMock).not.toHaveBeenCalled();
        expect(invalidateProviderScopeMock).not.toHaveBeenCalled();
    });
});

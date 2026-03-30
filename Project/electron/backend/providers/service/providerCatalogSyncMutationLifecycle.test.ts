import { beforeEach, describe, expect, it, vi } from 'vitest';

import { okProviderService } from '@/app/backend/providers/service/errors';
import { createProviderCatalogSyncMutationLifecycle } from '@/app/backend/providers/service/providerCatalogSyncMutationLifecycle';

const ensureNormalizedProviderProfileStateMock = vi.fn();
const syncCatalogMock = vi.fn();

describe('providerCatalogSyncMutationLifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ensureNormalizedProviderProfileStateMock.mockResolvedValue(undefined);
        syncCatalogMock.mockResolvedValue(
            okProviderService({
                ok: true,
                status: 'synced',
                providerId: 'openai',
                modelCount: 1,
            })
        );
    });

    it('normalizes the profile and delegates catalog sync unchanged', async () => {
        const lifecycle = createProviderCatalogSyncMutationLifecycle({
            ensureNormalizedProviderProfileState: ensureNormalizedProviderProfileStateMock,
            syncCatalog: syncCatalogMock,
        });

        const result = await lifecycle.syncCatalog('profile_local_default', 'openai', true, {
            requestId: 'request-1',
        });

        expect(ensureNormalizedProviderProfileStateMock).toHaveBeenCalledWith('profile_local_default');
        expect(syncCatalogMock).toHaveBeenCalledWith('profile_local_default', 'openai', true, {
            requestId: 'request-1',
        });
        expect(result.isOk()).toBe(true);
    });

    it('returns sync failures unchanged', async () => {
        syncCatalogMock.mockResolvedValueOnce(
            okProviderService({
                ok: false,
                status: 'error',
                providerId: 'openai',
                modelCount: 0,
                reason: 'failed',
            })
        );

        const lifecycle = createProviderCatalogSyncMutationLifecycle({
            ensureNormalizedProviderProfileState: ensureNormalizedProviderProfileStateMock,
            syncCatalog: syncCatalogMock,
        });

        const result = await lifecycle.syncCatalog('profile_local_default', 'openai');

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.status).toBe('error');
    });
});

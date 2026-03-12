import { describe, expect, it, vi } from 'vitest';

import { createProviderSettingsActions } from '@/web/components/settings/providerSettings/hooks/providerSettingsActions';

describe('provider settings actions', () => {
    it('omits pinnedProviderId when saving dynamic Kilo routing', async () => {
        const mutateAsync = vi.fn().mockResolvedValue(undefined);
        const actions = createProviderSettingsActions({
            profileId: 'profile_default',
            selectedProviderId: 'kilo',
            selectedModelId: 'kilo/auto',
            apiKeyInput: '',
            activeAuthFlow: undefined,
            kiloModelProviderIds: ['openai'],
            kiloRoutingDraft: {
                sort: 'price',
            },
            setSelectedProviderId: vi.fn(),
            setStatusMessage: vi.fn(),
            onPreviewProvider: vi.fn(),
            mutations: {
                setDefaultMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                syncCatalogMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setModelRoutingPreferenceMutation: { mutateAsync },
                setEndpointProfileMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setOrganizationMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setApiKeyMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                startAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                pollAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                cancelAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                openExternalUrlMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
            },
        });

        await actions.changeRoutingMode('dynamic');
        await actions.changeRoutingSort('latency');

        expect(mutateAsync).toHaveBeenNthCalledWith(1, {
            profileId: 'profile_default',
            providerId: 'kilo',
            modelId: 'kilo/auto',
            routingMode: 'dynamic',
            sort: 'price',
        });
        expect(mutateAsync).toHaveBeenNthCalledWith(2, {
            profileId: 'profile_default',
            providerId: 'kilo',
            modelId: 'kilo/auto',
            routingMode: 'dynamic',
            sort: 'latency',
        });
    });
});

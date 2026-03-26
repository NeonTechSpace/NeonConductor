import { describe, expect, it, vi } from 'vitest';

import { createProviderSettingsActions } from '@/web/components/settings/providerSettings/hooks/providerSettingsActions';

import { kiloFrontierModelId, kiloSmallModelId } from '@/shared/kiloModels';

describe('provider settings actions', () => {
    it('omits pinnedProviderId when saving dynamic Kilo routing', async () => {
        const mutateAsync = vi.fn().mockResolvedValue(undefined);
        const setDefaultMutateAsync = vi.fn().mockResolvedValue(undefined);
        const actions = createProviderSettingsActions({
            profileId: 'profile_default',
            selectedProviderId: 'kilo',
            selectedModelId: kiloFrontierModelId,
            currentOptionProfileId: 'gateway',
            activeAuthFlow: undefined,
            kiloModelProviderIds: ['openai'],
            kiloRoutingDraft: {
                sort: 'price',
            },
            setSelectedProviderId: vi.fn(),
            setStatusMessage: vi.fn(),
            onPreviewProvider: vi.fn(),
            mutations: {
                setDefaultMutation: { mutateAsync: setDefaultMutateAsync },
                syncCatalogMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setModelRoutingPreferenceMutation: { mutateAsync },
                setConnectionProfileMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setExecutionPreferenceMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
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
            modelId: kiloFrontierModelId,
            routingMode: 'dynamic',
            sort: 'price',
        });
        expect(mutateAsync).toHaveBeenNthCalledWith(2, {
            profileId: 'profile_default',
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
            routingMode: 'dynamic',
            sort: 'latency',
        });

        await actions.setDefaultModel(kiloSmallModelId);

        expect(setDefaultMutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
            modelId: kiloSmallModelId,
        });
    });

    it('persists custom base URL overrides through the connection profile mutation', async () => {
        const setConnectionProfileMutateAsync = vi.fn().mockResolvedValue(undefined);
        const actions = createProviderSettingsActions({
            profileId: 'profile_default',
            selectedProviderId: 'openai',
            selectedModelId: 'openai/gpt-5',
            currentOptionProfileId: 'default',
            activeAuthFlow: undefined,
            kiloModelProviderIds: [],
            kiloRoutingDraft: undefined,
            setSelectedProviderId: vi.fn(),
            setStatusMessage: vi.fn(),
            onPreviewProvider: vi.fn(),
            mutations: {
                setDefaultMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                syncCatalogMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setModelRoutingPreferenceMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setConnectionProfileMutation: { mutateAsync: setConnectionProfileMutateAsync },
                setExecutionPreferenceMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setOrganizationMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setApiKeyMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                startAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                pollAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                cancelAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                openExternalUrlMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
            },
        });

        await actions.saveBaseUrlOverride('https://custom-openai-gateway.example/v1');

        expect(setConnectionProfileMutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
            optionProfileId: 'default',
            baseUrlOverride: 'https://custom-openai-gateway.example/v1',
        });
    });

    it('persists OpenAI execution preference changes through the dedicated mutation', async () => {
        const setExecutionPreferenceMutateAsync = vi.fn().mockResolvedValue(undefined);
        const actions = createProviderSettingsActions({
            profileId: 'profile_default',
            selectedProviderId: 'openai',
            selectedModelId: 'openai/gpt-realtime',
            currentOptionProfileId: 'default',
            activeAuthFlow: undefined,
            kiloModelProviderIds: [],
            kiloRoutingDraft: undefined,
            setSelectedProviderId: vi.fn(),
            setStatusMessage: vi.fn(),
            onPreviewProvider: vi.fn(),
            mutations: {
                setDefaultMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                syncCatalogMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setModelRoutingPreferenceMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setConnectionProfileMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setExecutionPreferenceMutation: { mutateAsync: setExecutionPreferenceMutateAsync },
                setOrganizationMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                setApiKeyMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                startAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                pollAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                cancelAuthMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
                openExternalUrlMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
            },
        });

        await actions.changeExecutionPreference('realtime_websocket');

        expect(setExecutionPreferenceMutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
            mode: 'realtime_websocket',
        });
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getModelRoutingPreferenceMock,
    listModelProvidersMock,
    setModelRoutingPreferenceMock,
} = vi.hoisted(() => ({
    getModelRoutingPreferenceMock: vi.fn(),
    listModelProvidersMock: vi.fn(),
    setModelRoutingPreferenceMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/service/kiloRoutingPreferencePolicy', () => ({
    getKiloModelRoutingPreference: getModelRoutingPreferenceMock,
    setKiloModelRoutingPreference: setModelRoutingPreferenceMock,
}));

vi.mock('@/app/backend/providers/service/kiloProviderOptionsReadModel', () => ({
    listKiloProviderOptions: listModelProvidersMock,
}));

import {
    getModelRoutingPreference,
    listModelProviders,
    setModelRoutingPreference,
} from '@/app/backend/providers/service/kiloRoutingService';
import { okProviderService } from '@/app/backend/providers/service/errors';

describe('kiloRoutingService', () => {
    beforeEach(() => {
        getModelRoutingPreferenceMock.mockReset();
        listModelProvidersMock.mockReset();
        setModelRoutingPreferenceMock.mockReset();
    });

    it('re-exports the routing preference helpers without changing the result shape', async () => {
        getModelRoutingPreferenceMock.mockResolvedValue(
            okProviderService({
                profileId: 'profile_local_default',
                providerId: 'kilo',
                modelId: 'openai/gpt-5',
                routingMode: 'dynamic',
                sort: 'default',
            })
        );
        setModelRoutingPreferenceMock.mockResolvedValue(
            okProviderService({
                profileId: 'profile_local_default',
                providerId: 'kilo',
                modelId: 'openai/gpt-5',
                routingMode: 'pinned',
                pinnedProviderId: 'openai',
            })
        );
        listModelProvidersMock.mockResolvedValue(
            okProviderService([
                {
                    providerId: 'openai',
                    label: 'OpenAI',
                },
            ])
        );

        const readResult = await getModelRoutingPreference({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });
        const writeResult = await setModelRoutingPreference({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        });
        const listResult = await listModelProviders({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });

        expect(readResult.isOk()).toBe(true);
        expect(writeResult.isOk()).toBe(true);
        expect(listResult.isOk()).toBe(true);
        expect(getModelRoutingPreferenceMock).toHaveBeenCalled();
        expect(setModelRoutingPreferenceMock).toHaveBeenCalled();
        expect(listModelProvidersMock).toHaveBeenCalled();
    });
});

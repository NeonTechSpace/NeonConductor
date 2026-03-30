import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPreferenceMock, modelExistsMock, setPreferenceMock } = vi.hoisted(() => ({
    getPreferenceMock: vi.fn(),
    modelExistsMock: vi.fn(),
    setPreferenceMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    kiloRoutingPreferenceStore: {
        getPreference: getPreferenceMock,
        setPreference: setPreferenceMock,
    },
    providerStore: {
        modelExists: modelExistsMock,
    },
}));

import {
    getKiloModelRoutingPreference,
    setKiloModelRoutingPreference,
    validateKiloRoutingPreferenceInput,
} from '@/app/backend/providers/service/kiloRoutingPreferencePolicy';
import { okProviderService } from '@/app/backend/providers/service/errors';
import type { ProviderSetModelRoutingPreferenceInput } from '@/app/backend/runtime/contracts';

describe('kiloRoutingPreferencePolicy', () => {
    const inputBase: ProviderSetModelRoutingPreferenceInput = {
        profileId: 'profile_local_default',
        providerId: 'kilo',
        modelId: 'openai/gpt-5',
        routingMode: 'dynamic',
        sort: 'latency',
    };

    beforeEach(() => {
        getPreferenceMock.mockReset();
        modelExistsMock.mockReset();
        setPreferenceMock.mockReset();
        modelExistsMock.mockResolvedValue(true);
    });

    it('validates routing combinations with the existing fail-closed messages', () => {
        const missingSort = validateKiloRoutingPreferenceInput({
            profileId: inputBase.profileId,
            providerId: inputBase.providerId,
            modelId: inputBase.modelId,
            routingMode: 'dynamic',
        });
        expect(missingSort.isErr()).toBe(true);
        if (missingSort.isOk()) {
            throw new Error('Expected missing dynamic sort to fail closed.');
        }
        expect(missingSort.error.message).toContain('sort');

        const pinnedWithSort = validateKiloRoutingPreferenceInput({
            ...inputBase,
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
            sort: 'latency',
        });
        expect(pinnedWithSort.isErr()).toBe(true);
        if (pinnedWithSort.isOk()) {
            throw new Error('Expected pinned routing with sort to fail closed.');
        }
        expect(pinnedWithSort.error.message).toContain('not allowed');
    });

    it('returns the default dynamic preference when no saved preference exists', async () => {
        getPreferenceMock.mockResolvedValue(undefined);

        const result = await getKiloModelRoutingPreference({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value).toEqual({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
            routingMode: 'dynamic',
            sort: 'default',
        });
    });

    it('reads back and persists pinned preferences through the same contract shape', async () => {
        getPreferenceMock.mockResolvedValue({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        });
        setPreferenceMock.mockResolvedValue(
            okProviderService({
                profileId: inputBase.profileId,
                providerId: 'kilo',
                modelId: inputBase.modelId,
                routingMode: 'pinned',
                pinnedProviderId: 'openai',
            })
        );

        const readResult = await getKiloModelRoutingPreference({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
        });
        expect(readResult.isOk()).toBe(true);
        if (readResult.isErr()) {
            throw new Error(readResult.error.message);
        }
        expect(readResult.value).toEqual({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        });

        const writeResult = await setKiloModelRoutingPreference({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        });

        expect(writeResult.isOk()).toBe(true);
        if (writeResult.isErr()) {
            throw new Error(writeResult.error.message);
        }
        expect(writeResult.value).toEqual({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        });
        expect(setPreferenceMock).toHaveBeenCalledWith({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: inputBase.modelId,
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        });
    });

    it('fails closed when the selected kilo model does not exist', async () => {
        modelExistsMock.mockResolvedValue(false);

        const result = await getKiloModelRoutingPreference({
            profileId: inputBase.profileId,
            providerId: 'kilo',
            modelId: 'openai/does-not-exist',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing kilo model to fail closed.');
        }
        expect(result.error.code).toBe('provider_model_missing');
    });
});

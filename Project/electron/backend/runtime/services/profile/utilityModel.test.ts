import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errOp, okOp } from '@/app/backend/runtime/services/common/operationalError';

const {
    modelExistsMock,
    getStringOptionalMock,
    setStringMock,
    deleteSettingMock,
    ensureSupportedProviderMock,
    resolveRunAuthMock,
} = vi.hoisted(() => ({
    modelExistsMock: vi.fn(),
    getStringOptionalMock: vi.fn(),
    setStringMock: vi.fn(),
    deleteSettingMock: vi.fn(),
    ensureSupportedProviderMock: vi.fn(),
    resolveRunAuthMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    providerStore: {
        modelExists: modelExistsMock,
    },
    settingsStore: {
        getStringOptional: getStringOptionalMock,
        setString: setStringMock,
        delete: deleteSettingMock,
    },
}));

vi.mock('@/app/backend/providers/service/helpers', () => ({
    ensureSupportedProvider: ensureSupportedProviderMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/resolveRunAuth', () => ({
    resolveRunAuth: resolveRunAuthMock,
}));

import { utilityModelService } from '@/app/backend/runtime/services/profile/utilityModel';

describe('utilityModelService', () => {
    beforeEach(() => {
        modelExistsMock.mockReset();
        getStringOptionalMock.mockReset();
        setStringMock.mockReset();
        deleteSettingMock.mockReset();
        ensureSupportedProviderMock.mockReset();
        resolveRunAuthMock.mockReset();
    });

    it('rejects partial Utility AI selections', async () => {
        const result = await utilityModelService.setUtilityModelPreference({
            profileId: 'profile_test',
            providerId: 'openai',
        });

        expect(result.isErr()).toBe(true);
        expect(setStringMock).not.toHaveBeenCalled();
    });

    it('persists a validated Utility AI selection', async () => {
        ensureSupportedProviderMock.mockResolvedValue(okOp('openai'));
        modelExistsMock.mockResolvedValue(true);
        setStringMock.mockResolvedValue(undefined);

        const result = await utilityModelService.setUtilityModelPreference({
            profileId: 'profile_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5-mini',
        });

        expect(result.isOk()).toBe(true);
        expect(setStringMock).toHaveBeenNthCalledWith(1, 'profile_test', 'utility_provider_id', 'openai');
        expect(setStringMock).toHaveBeenNthCalledWith(
            2,
            'profile_test',
            'utility_model_id',
            'openai/gpt-5-mini'
        );
    });

    it('normalizes invalid persisted Utility AI state to null', async () => {
        getStringOptionalMock.mockResolvedValueOnce('openai').mockResolvedValueOnce('openai/gpt-5-mini');
        ensureSupportedProviderMock.mockResolvedValue(okOp('openai'));
        modelExistsMock.mockResolvedValue(false);

        const preference = await utilityModelService.getUtilityModelPreference('profile_test');

        expect(preference).toEqual({ selection: null });
    });

    it('uses the Utility AI target when the saved model is valid and authenticated', async () => {
        getStringOptionalMock.mockResolvedValueOnce('openai').mockResolvedValueOnce('openai/gpt-5-mini');
        ensureSupportedProviderMock.mockResolvedValue(okOp('openai'));
        modelExistsMock.mockResolvedValue(true);
        resolveRunAuthMock.mockResolvedValue(
            okOp({
                authMethod: 'api_key',
            })
        );

        const target = await utilityModelService.resolveUtilityModelTarget({
            profileId: 'profile_test',
            fallbackProviderId: 'zai',
            fallbackModelId: 'zai/glm-4.5-air',
        });

        expect(target).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5-mini',
            source: 'utility',
        });
    });

    it('falls back when the saved Utility AI model cannot authenticate', async () => {
        getStringOptionalMock.mockResolvedValueOnce('openai').mockResolvedValueOnce('openai/gpt-5-mini');
        ensureSupportedProviderMock.mockResolvedValue(okOp('openai'));
        modelExistsMock.mockResolvedValue(true);
        resolveRunAuthMock.mockResolvedValue(
            errOp('provider_auth_invalid_state', 'Authentication is required for the selected utility model.')
        );

        const target = await utilityModelService.resolveUtilityModelTarget({
            profileId: 'profile_test',
            fallbackProviderId: 'zai',
            fallbackModelId: 'zai/glm-4.5-air',
        });

        expect(target).toEqual({
            providerId: 'zai',
            modelId: 'zai/glm-4.5-air',
            source: 'fallback',
        });
    });
});

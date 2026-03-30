import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderDefaultModelRepairService } from '@/app/backend/providers/service/providerDefaultModelRepairService';

const getDefaultsMock = vi.fn();
const listModelsMock = vi.fn();
const setDefaultsMock = vi.fn();

describe('providerDefaultModelRepairService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultsMock.mockResolvedValue({ providerId: 'openai', modelId: 'openai/gpt-5' });
        listModelsMock.mockResolvedValue([{ id: 'openai/gpt-5' }]);
        setDefaultsMock.mockResolvedValue(undefined);
    });

    it('leaves defaults unchanged when the selected model still exists', async () => {
        const service = createProviderDefaultModelRepairService({
            getDefaults: getDefaultsMock,
            listModels: listModelsMock,
            setDefaults: setDefaultsMock,
        });

        await service.repairDefaultModelIfMissing('profile_local_default', 'openai');

        expect(setDefaultsMock).not.toHaveBeenCalled();
    });

    it('repairs the default model to the first available model when the selected provider default disappeared', async () => {
        getDefaultsMock.mockResolvedValueOnce({ providerId: 'openai', modelId: 'openai/old-model' });
        listModelsMock.mockResolvedValueOnce([{ id: 'openai/gpt-5' }, { id: 'openai/gpt-4.1' }]);

        const service = createProviderDefaultModelRepairService({
            getDefaults: getDefaultsMock,
            listModels: listModelsMock,
            setDefaults: setDefaultsMock,
        });

        await service.repairDefaultModelIfMissing('profile_local_default', 'openai');

        expect(setDefaultsMock).toHaveBeenCalledWith('profile_local_default', 'openai', 'openai/gpt-5');
    });

    it('does not repair defaults when the profile default points to a different provider', async () => {
        getDefaultsMock.mockResolvedValueOnce({ providerId: 'kilo', modelId: 'kilo/default' });

        const service = createProviderDefaultModelRepairService({
            getDefaults: getDefaultsMock,
            listModels: listModelsMock,
            setDefaults: setDefaultsMock,
        });

        await service.repairDefaultModelIfMissing('profile_local_default', 'openai');

        expect(setDefaultsMock).not.toHaveBeenCalled();
    });
});

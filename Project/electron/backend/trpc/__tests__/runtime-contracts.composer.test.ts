import { describe, expect, it } from 'vitest';

import { createCaller, registerRuntimeContractHooks } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: composer media settings', () => {
    it('seeds and updates app-level composer media settings', async () => {
        const caller = createCaller();

        const initialSettings = await caller.composer.getSettings();
        expect(initialSettings.settings.maxImageAttachmentsPerMessage).toBe(10);
        expect(initialSettings.settings.imageCompressionConcurrency).toBe(2);

        const updatedSettings = await caller.composer.setSettings({
            maxImageAttachmentsPerMessage: 12,
            imageCompressionConcurrency: 4,
        });
        expect(updatedSettings.settings.maxImageAttachmentsPerMessage).toBe(12);
        expect(updatedSettings.settings.imageCompressionConcurrency).toBe(4);

        const rereadSettings = await caller.composer.getSettings();
        expect(rereadSettings.settings.maxImageAttachmentsPerMessage).toBe(12);
        expect(rereadSettings.settings.imageCompressionConcurrency).toBe(4);
    });
});

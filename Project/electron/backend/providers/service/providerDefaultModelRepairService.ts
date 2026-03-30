import { providerStore } from '@/app/backend/persistence/stores';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export function createProviderDefaultModelRepairService(input = {
    getDefaults: providerStore.getDefaults.bind(providerStore),
    listModels: providerStore.listModels.bind(providerStore),
    setDefaults: providerStore.setDefaults.bind(providerStore),
}) {
    return {
        async repairDefaultModelIfMissing(profileId: string, providerId: RuntimeProviderId): Promise<void> {
            const [defaults, models] = await Promise.all([
                input.getDefaults(profileId),
                input.listModels(profileId, providerId),
            ]);

            if (defaults.providerId !== providerId || models.length === 0) {
                return;
            }

            const currentDefaultStillExists = models.some((model) => model.id === defaults.modelId);
            if (currentDefaultStillExists) {
                return;
            }

            const fallbackModel = models[0];
            if (!fallbackModel) {
                return;
            }

            await input.setDefaults(profileId, providerId, fallbackModel.id);
        },
    };
}

export const providerDefaultModelRepairService = createProviderDefaultModelRepairService();

export async function repairProviderDefaultModelAfterCatalogChange(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<void> {
    await providerDefaultModelRepairService.repairDefaultModelIfMissing(profileId, providerId);
}

import { getPersistence } from '@/app/backend/persistence/db';
import { settingsStore } from '@/app/backend/persistence/stores/profile/settingsStore';
import { providerCatalogStore } from '@/app/backend/persistence/stores/provider/providerCatalogStore';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';
import { providerIds } from '@/app/backend/runtime/contracts';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export class ProviderStore {
    async listProviders(): Promise<ProviderRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('providers')
            .select(['id', 'label', 'supports_byok'])
            .orderBy('label', 'asc')
            .execute();

        return rows.map((row) => ({
            id: parseEnumValue(row.id, 'providers.id', providerIds),
            label: row.label,
            supportsByok: row.supports_byok === 1,
        }));
    }

    async listModels(profileId: string, providerId: RuntimeProviderId): Promise<ProviderModelRecord[]> {
        return providerCatalogStore.listModels(profileId, providerId);
    }

    async listModelsByProfile(profileId: string): Promise<ProviderModelRecord[]> {
        return providerCatalogStore.listByProfile(profileId);
    }

    async getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
        const [providerId, modelId] = await Promise.all([
            settingsStore.getStringRequired(profileId, 'default_provider_id'),
            settingsStore.getStringRequired(profileId, 'default_model_id'),
        ]);

        return {
            providerId,
            modelId,
        };
    }

    async setDefaults(profileId: string, providerId: RuntimeProviderId, modelId: string): Promise<void> {
        await Promise.all([
            settingsStore.setString(profileId, 'default_provider_id', providerId),
            settingsStore.setString(profileId, 'default_model_id', modelId),
        ]);
    }

    async providerExists(providerId: RuntimeProviderId): Promise<boolean> {
        const { db } = getPersistence();
        const row = await db.selectFrom('providers').select('id').where('id', '=', providerId).executeTakeFirst();

        return Boolean(row);
    }

    async modelExists(profileId: string, providerId: RuntimeProviderId, modelId: string): Promise<boolean> {
        return providerCatalogStore.modelExists(profileId, providerId, modelId);
    }

    async getModel(profileId: string, providerId: RuntimeProviderId, modelId: string): Promise<ProviderModelRecord | null> {
        return providerCatalogStore.getModel(profileId, providerId, modelId);
    }

    async getModelCapabilities(profileId: string, providerId: RuntimeProviderId, modelId: string) {
        return providerCatalogStore.getModelCapabilities(profileId, providerId, modelId);
    }
}

export const providerStore = new ProviderStore();

import { getPersistence } from '@/app/backend/persistence/db';
import { settingsStore } from '@/app/backend/persistence/stores/settingsStore';
import type { ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';

const DEFAULT_PROVIDER_FALLBACK = 'kilo';
const DEFAULT_MODEL_FALLBACK = 'kilo/auto';

export class ProviderStore {
    async listProviders(): Promise<ProviderRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('providers')
            .select(['id', 'label', 'supports_byok'])
            .orderBy('label', 'asc')
            .execute();

        return rows.map((row) => ({
            id: row.id,
            label: row.label,
            supportsByok: row.supports_byok === 1,
        }));
    }

    async listModels(providerId?: string): Promise<ProviderModelRecord[]> {
        const { db } = getPersistence();

        let query = db.selectFrom('provider_models').select(['id', 'provider_id', 'label']).orderBy('label', 'asc');

        if (providerId) {
            query = query.where('provider_id', '=', providerId);
        }

        const rows = await query.execute();

        return rows.map((row) => ({
            id: row.id,
            providerId: row.provider_id,
            label: row.label,
        }));
    }

    async getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
        const [providerId, modelId] = await Promise.all([
            settingsStore.getString(profileId, 'default_provider_id', DEFAULT_PROVIDER_FALLBACK),
            settingsStore.getString(profileId, 'default_model_id', DEFAULT_MODEL_FALLBACK),
        ]);

        return {
            providerId,
            modelId,
        };
    }

    async setDefaults(profileId: string, providerId: string, modelId: string): Promise<void> {
        await Promise.all([
            settingsStore.setString(profileId, 'default_provider_id', providerId),
            settingsStore.setString(profileId, 'default_model_id', modelId),
        ]);
    }

    async providerExists(providerId: string): Promise<boolean> {
        const { db } = getPersistence();
        const row = await db.selectFrom('providers').select('id').where('id', '=', providerId).executeTakeFirst();

        return Boolean(row);
    }

    async modelExists(providerId: string, modelId: string): Promise<boolean> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('provider_models')
            .select('id')
            .where('provider_id', '=', providerId)
            .where('id', '=', modelId)
            .executeTakeFirst();

        return Boolean(row);
    }
}

export const providerStore = new ProviderStore();

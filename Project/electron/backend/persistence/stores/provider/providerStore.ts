import { getPersistence } from '@/app/backend/persistence/db';
import { settingsStore } from '@/app/backend/persistence/stores/profile/settingsStore';
import {
    providerCatalogStore,
    type InvalidProviderModelDiagnostic,
    type PersistedProviderModelReadState,
} from '@/app/backend/persistence/stores/provider/providerCatalogStore';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { isJsonRecord, isJsonString, isJsonUnknownArray } from '@/app/backend/persistence/stores/shared/utils';
import type { ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';
import {
    getProviderSpecialistDefaultKey,
    isSupportedProviderSpecialistDefaultTarget,
    type ProviderSpecialistDefaultModeKey,
    type ProviderSpecialistDefaultTopLevelTab,
    providerIds,
} from '@/app/backend/runtime/contracts';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/app/backend/runtime/contracts/types/provider';

import { canonicalizeProviderModelId } from '@/shared/kiloModels';

const SPECIALIST_DEFAULTS_KEY = 'specialist_defaults';

function isPersistedSpecialistDefaultRecord(value: unknown): value is ProviderSpecialistDefaultRecord {
    if (!isJsonRecord(value)) {
        return false;
    }

    if (
        !isJsonString(value.topLevelTab) ||
        !isJsonString(value.modeKey) ||
        !isJsonString(value.providerId) ||
        !isJsonString(value.modelId)
    ) {
        return false;
    }

    if (!providerIds.includes(value.providerId as RuntimeProviderId)) {
        return false;
    }

    const target = {
        topLevelTab: value.topLevelTab,
        modeKey: value.modeKey,
    };

    return isSupportedProviderSpecialistDefaultTarget(target);
}

function isPersistedSpecialistDefaultRecordArray(value: unknown): value is ProviderSpecialistDefaultRecord[] {
    return isJsonUnknownArray(value) && value.every(isPersistedSpecialistDefaultRecord);
}

function canonicalizeSpecialistDefaultRecord(value: ProviderSpecialistDefaultRecord): ProviderSpecialistDefaultRecord {
    return {
        ...value,
        modelId: canonicalizeProviderModelId(value.providerId, value.modelId),
    };
}

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

    async getSpecialistDefaults(profileId: string): Promise<ProviderSpecialistDefaultRecord[]> {
        const persisted =
            (await settingsStore.getJsonOptional(
                profileId,
                SPECIALIST_DEFAULTS_KEY,
                isPersistedSpecialistDefaultRecordArray
            )) ?? [];

        return persisted.map(canonicalizeSpecialistDefaultRecord);
    }

    async setSpecialistDefault(
        profileId: string,
        input: {
            topLevelTab: ProviderSpecialistDefaultTopLevelTab;
            modeKey: ProviderSpecialistDefaultModeKey;
            providerId: RuntimeProviderId;
            modelId: string;
        }
    ): Promise<ProviderSpecialistDefaultRecord[]> {
        const nextRecord = canonicalizeSpecialistDefaultRecord({
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            providerId: input.providerId,
            modelId: input.modelId,
        });
        const current = await this.getSpecialistDefaults(profileId);
        const nextRecords = [
            nextRecord,
            ...current.filter(
                (value) => getProviderSpecialistDefaultKey(value) !== getProviderSpecialistDefaultKey(nextRecord)
            ),
        ];
        await settingsStore.setJson(profileId, SPECIALIST_DEFAULTS_KEY, nextRecords);
        return nextRecords;
    }

    async providerExists(providerId: RuntimeProviderId): Promise<boolean> {
        const { db } = getPersistence();
        const row = await db.selectFrom('providers').select('id').where('id', '=', providerId).executeTakeFirst();

        return Boolean(row);
    }

    async modelExists(profileId: string, providerId: RuntimeProviderId, modelId: string): Promise<boolean> {
        return providerCatalogStore.modelExists(profileId, providerId, modelId);
    }

    async getModel(
        profileId: string,
        providerId: RuntimeProviderId,
        modelId: string
    ): Promise<ProviderModelRecord | null> {
        return providerCatalogStore.getModel(profileId, providerId, modelId);
    }

    async getModelReadState(
        profileId: string,
        providerId: RuntimeProviderId,
        modelId: string
    ): Promise<PersistedProviderModelReadState | null> {
        return providerCatalogStore.getModelReadState(profileId, providerId, modelId);
    }

    async listInvalidModelDiagnostics(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<InvalidProviderModelDiagnostic[]> {
        return providerCatalogStore.listInvalidModelDiagnostics(profileId, providerId);
    }

    async getModelCapabilities(profileId: string, providerId: RuntimeProviderId, modelId: string) {
        return providerCatalogStore.getModelCapabilities(profileId, providerId, modelId);
    }
}

export const providerStore = new ProviderStore();

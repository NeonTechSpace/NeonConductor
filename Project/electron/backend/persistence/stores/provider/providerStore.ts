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
    internalModelRoles,
    isSupportedProviderSpecialistDefaultTarget,
    isSupportedWorkflowRoutingTargetKey,
    workflowRoutingTargetKeys,
    type InternalModelRole,
    type ProviderSpecialistDefaultModeKey,
    type ProviderSpecialistDefaultTopLevelTab,
    type WorkflowRoutingPreferenceRecord,
    type WorkflowRoutingTargetKey,
    providerIds,
} from '@/app/backend/runtime/contracts';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import type {
    ProviderModelFavoriteRecord,
    ProviderSpecialistDefaultRecord,
} from '@/app/backend/runtime/contracts/types/provider';

import { canonicalizeProviderModelId } from '@/shared/kiloModels';

const SPECIALIST_DEFAULTS_KEY = 'specialist_defaults';
const WORKFLOW_ROUTING_PREFERENCES_KEY = 'workflow_routing_preferences';
const MODEL_ROLE_DEFAULTS_KEY = 'model_role_defaults';
const MODEL_PICKER_FAVORITES_KEY = 'model_picker_favorites';

const workflowRoutingTargetKeyOrder = new Map<WorkflowRoutingTargetKey, number>(
    workflowRoutingTargetKeys.map((targetKey, index) => [targetKey, index])
);

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

function isPersistedWorkflowRoutingPreferenceRecord(value: unknown): value is WorkflowRoutingPreferenceRecord {
    if (!isJsonRecord(value)) {
        return false;
    }

    if (!isJsonString(value.targetKey) || !isJsonString(value.providerId) || !isJsonString(value.modelId)) {
        return false;
    }

    if (!providerIds.includes(value.providerId as RuntimeProviderId)) {
        return false;
    }

    return isSupportedWorkflowRoutingTargetKey(value.targetKey);
}

function isPersistedWorkflowRoutingPreferenceRecordArray(
    value: unknown
): value is WorkflowRoutingPreferenceRecord[] {
    return isJsonUnknownArray(value) && value.every(isPersistedWorkflowRoutingPreferenceRecord);
}

function canonicalizeWorkflowRoutingPreferenceRecord(
    value: WorkflowRoutingPreferenceRecord
): WorkflowRoutingPreferenceRecord {
    return {
        ...value,
        modelId: canonicalizeProviderModelId(value.providerId, value.modelId),
    };
}

function compareWorkflowRoutingPreferenceRecords(
    left: WorkflowRoutingPreferenceRecord,
    right: WorkflowRoutingPreferenceRecord
): number {
    return (
        (workflowRoutingTargetKeyOrder.get(left.targetKey) ?? Number.POSITIVE_INFINITY) -
        (workflowRoutingTargetKeyOrder.get(right.targetKey) ?? Number.POSITIVE_INFINITY)
    );
}

function canonicalizeWorkflowRoutingPreferenceRecords(
    values: WorkflowRoutingPreferenceRecord[]
): WorkflowRoutingPreferenceRecord[] {
    return values
        .map(canonicalizeWorkflowRoutingPreferenceRecord)
        .toSorted(compareWorkflowRoutingPreferenceRecords)
        .filter((value, index, records) => records.findIndex((candidate) => candidate.targetKey === value.targetKey) === index);
}

interface PersistedModelRoleDefaultRecord {
    role: InternalModelRole;
    providerId: RuntimeProviderId;
    modelId: string;
}

function isPersistedModelRoleDefaultRecord(value: unknown): value is PersistedModelRoleDefaultRecord {
    if (!isJsonRecord(value)) {
        return false;
    }
    if (!isJsonString(value.role) || !isJsonString(value.providerId) || !isJsonString(value.modelId)) {
        return false;
    }
    return internalModelRoles.includes(value.role as InternalModelRole) && providerIds.includes(value.providerId as RuntimeProviderId);
}

function isPersistedModelRoleDefaultRecordArray(value: unknown): value is PersistedModelRoleDefaultRecord[] {
    return isJsonUnknownArray(value) && value.every(isPersistedModelRoleDefaultRecord);
}

function canonicalizeModelRoleDefaultRecord(value: PersistedModelRoleDefaultRecord): PersistedModelRoleDefaultRecord {
    return {
        ...value,
        modelId: canonicalizeProviderModelId(value.providerId, value.modelId),
    };
}

function isPersistedModelFavoriteRecord(value: unknown): value is ProviderModelFavoriteRecord {
    if (!isJsonRecord(value)) {
        return false;
    }
    if (!isJsonString(value.providerId) || !isJsonString(value.modelId)) {
        return false;
    }
    return providerIds.includes(value.providerId as RuntimeProviderId);
}

function isPersistedModelFavoriteRecordArray(value: unknown): value is ProviderModelFavoriteRecord[] {
    return isJsonUnknownArray(value) && value.every(isPersistedModelFavoriteRecord);
}

function canonicalizeModelFavoriteRecord(value: ProviderModelFavoriteRecord): ProviderModelFavoriteRecord {
    return {
        providerId: value.providerId,
        modelId: canonicalizeProviderModelId(value.providerId, value.modelId),
    };
}

function compareModelFavoriteRecords(
    left: ProviderModelFavoriteRecord,
    right: ProviderModelFavoriteRecord
): number {
    const providerComparison = left.providerId.localeCompare(right.providerId);
    if (providerComparison !== 0) {
        return providerComparison;
    }
    return left.modelId.localeCompare(right.modelId);
}

function canonicalizeModelFavoriteRecords(values: ProviderModelFavoriteRecord[]): ProviderModelFavoriteRecord[] {
    return values
        .map(canonicalizeModelFavoriteRecord)
        .toSorted(compareModelFavoriteRecords)
        .filter(
            (value, index, records) =>
                records.findIndex(
                    (candidate) => candidate.providerId === value.providerId && candidate.modelId === value.modelId
                ) === index
        );
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

    async getWorkflowRoutingPreferences(profileId: string): Promise<WorkflowRoutingPreferenceRecord[]> {
        const persisted =
            (await settingsStore.getJsonOptional(
                profileId,
                WORKFLOW_ROUTING_PREFERENCES_KEY,
                isPersistedWorkflowRoutingPreferenceRecordArray
            )) ?? [];

        return canonicalizeWorkflowRoutingPreferenceRecords(persisted);
    }

    async getModelRoleDefaults(profileId: string): Promise<PersistedModelRoleDefaultRecord[]> {
        const persisted =
            (await settingsStore.getJsonOptional(
                profileId,
                MODEL_ROLE_DEFAULTS_KEY,
                isPersistedModelRoleDefaultRecordArray
            )) ?? [];

        return persisted.map(canonicalizeModelRoleDefaultRecord);
    }

    async getModelFavorites(profileId: string): Promise<ProviderModelFavoriteRecord[]> {
        const persisted =
            (await settingsStore.getJsonOptional(
                profileId,
                MODEL_PICKER_FAVORITES_KEY,
                isPersistedModelFavoriteRecordArray
            )) ?? [];

        return canonicalizeModelFavoriteRecords(persisted);
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

    async setWorkflowRoutingPreference(
        profileId: string,
        input: WorkflowRoutingPreferenceRecord
    ): Promise<WorkflowRoutingPreferenceRecord[]> {
        const nextRecord = canonicalizeWorkflowRoutingPreferenceRecord(input);
        const current = await this.getWorkflowRoutingPreferences(profileId);
        const nextRecords = canonicalizeWorkflowRoutingPreferenceRecords([
            nextRecord,
            ...current.filter((value) => value.targetKey !== nextRecord.targetKey),
        ]);
        await settingsStore.setJson(profileId, WORKFLOW_ROUTING_PREFERENCES_KEY, nextRecords);
        return nextRecords;
    }

    async setModelRoleDefault(
        profileId: string,
        input: PersistedModelRoleDefaultRecord
    ): Promise<PersistedModelRoleDefaultRecord[]> {
        const nextRecord = canonicalizeModelRoleDefaultRecord(input);
        const current = await this.getModelRoleDefaults(profileId);
        const nextRecords = [nextRecord, ...current.filter((value) => value.role !== nextRecord.role)].sort((left, right) =>
            left.role.localeCompare(right.role)
        );
        await settingsStore.setJson(profileId, MODEL_ROLE_DEFAULTS_KEY, nextRecords);
        return nextRecords;
    }

    async clearModelRoleDefault(profileId: string, role: InternalModelRole): Promise<PersistedModelRoleDefaultRecord[]> {
        const current = await this.getModelRoleDefaults(profileId);
        const nextRecords = current.filter((value) => value.role !== role);
        await settingsStore.setJson(profileId, MODEL_ROLE_DEFAULTS_KEY, nextRecords);
        return nextRecords;
    }

    async clearWorkflowRoutingPreference(
        profileId: string,
        targetKey: WorkflowRoutingTargetKey
    ): Promise<WorkflowRoutingPreferenceRecord[]> {
        const current = await this.getWorkflowRoutingPreferences(profileId);
        const nextRecords = canonicalizeWorkflowRoutingPreferenceRecords(
            current.filter((value) => value.targetKey !== targetKey)
        );
        await settingsStore.setJson(profileId, WORKFLOW_ROUTING_PREFERENCES_KEY, nextRecords);
        return nextRecords;
    }

    async setModelFavorite(
        profileId: string,
        input: ProviderModelFavoriteRecord & { favorite: boolean }
    ): Promise<ProviderModelFavoriteRecord[]> {
        const nextRecord = canonicalizeModelFavoriteRecord(input);
        const current = await this.getModelFavorites(profileId);
        const withoutTarget = current.filter(
            (value) => value.providerId !== nextRecord.providerId || value.modelId !== nextRecord.modelId
        );
        const nextRecords = input.favorite
            ? canonicalizeModelFavoriteRecords([nextRecord, ...withoutTarget])
            : canonicalizeModelFavoriteRecords(withoutTarget);
        await settingsStore.setJson(profileId, MODEL_PICKER_FAVORITES_KEY, nextRecords);
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

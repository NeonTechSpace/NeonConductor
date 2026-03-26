import { randomUUID } from 'node:crypto';

import type { ProfileStoreDb } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/types';
import { isJsonString, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';

import { canonicalizeProviderModelId, kiloFrontierModelId } from '@/shared/kiloModels';

const FALLBACK_DEFAULT_PROVIDER_ID = 'kilo';
const FALLBACK_DEFAULT_MODEL_ID = kiloFrontierModelId;

async function resolveDefaultProviderAndModel(
    tx: ProfileStoreDb,
    templateProfileId: string
): Promise<{ providerId: string; modelId: string }> {
    const rows = await tx
        .selectFrom('settings')
        .select(['key', 'value_json'])
        .where('profile_id', '=', templateProfileId)
        .where('key', 'in', ['default_provider_id', 'default_model_id'])
        .execute();

    const valueByKey = new Map(rows.map((row) => [row.key, row.value_json]));

    const providerRaw = valueByKey.get('default_provider_id');
    const modelRaw = valueByKey.get('default_model_id');

    const providerId =
        typeof providerRaw === 'string'
            ? parseJsonValue(providerRaw, FALLBACK_DEFAULT_PROVIDER_ID, isJsonString)
            : FALLBACK_DEFAULT_PROVIDER_ID;
    const modelId =
        typeof modelRaw === 'string'
            ? parseJsonValue(modelRaw, FALLBACK_DEFAULT_MODEL_ID, isJsonString)
            : FALLBACK_DEFAULT_MODEL_ID;

    return {
        providerId:
            typeof providerId === 'string' && providerId.trim().length > 0 ? providerId : FALLBACK_DEFAULT_PROVIDER_ID,
        modelId:
            typeof modelId === 'string' && modelId.trim().length > 0
                ? canonicalizeProviderModelId(
                      typeof providerId === 'string' && providerId.trim().length > 0
                          ? providerId
                          : FALLBACK_DEFAULT_PROVIDER_ID,
                      modelId
                  )
                : FALLBACK_DEFAULT_MODEL_ID,
    };
}

async function copyDefaultSettings(
    tx: ProfileStoreDb,
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const defaults = await resolveDefaultProviderAndModel(tx, sourceProfileId);
    await tx
        .insertInto('settings')
        .values([
            {
                id: `setting_${randomUUID()}`,
                profile_id: targetProfileId,
                key: 'default_provider_id',
                value_json: JSON.stringify(defaults.providerId),
                updated_at: timestamp,
            },
            {
                id: `setting_${randomUUID()}`,
                profile_id: targetProfileId,
                key: 'default_model_id',
                value_json: JSON.stringify(defaults.modelId),
                updated_at: timestamp,
            },
        ])
        .execute();
}

async function copyAllSettings(
    tx: ProfileStoreDb,
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const rows = await tx
        .selectFrom('settings')
        .select(['key', 'value_json'])
        .where('profile_id', '=', sourceProfileId)
        .execute();

    if (rows.length === 0) {
        await copyDefaultSettings(tx, sourceProfileId, targetProfileId, timestamp);
        return;
    }

    await tx
        .insertInto('settings')
        .values(
            rows.map((row) => ({
                id: `setting_${randomUUID()}`,
                profile_id: targetProfileId,
                key: row.key,
                value_json: row.value_json,
                updated_at: timestamp,
            }))
        )
        .execute();
}

export async function copyProfileSettings(input: {
    tx: ProfileStoreDb;
    sourceProfileId: string;
    targetProfileId: string;
    timestamp: string;
    copyAllSettings: boolean;
}): Promise<void> {
    if (input.copyAllSettings) {
        await copyAllSettings(input.tx, input.sourceProfileId, input.targetProfileId, input.timestamp);
        return;
    }

    await copyDefaultSettings(input.tx, input.sourceProfileId, input.targetProfileId, input.timestamp);
}

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ModelLimitOverrideRecord } from '@/app/backend/persistence/types';
import { providerIds } from '@/app/backend/runtime/contracts';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

function mapModelLimitOverride(row: {
    provider_id: string;
    model_id: string;
    context_length: number | null;
    max_output_tokens: number | null;
    reason: string;
    updated_at: string;
}): ModelLimitOverrideRecord {
    return {
        providerId: parseEnumValue(row.provider_id, 'model_limit_overrides.provider_id', providerIds),
        modelId: row.model_id,
        ...(row.context_length !== null ? { contextLength: row.context_length } : {}),
        ...(row.max_output_tokens !== null ? { maxOutputTokens: row.max_output_tokens } : {}),
        reason: row.reason,
        updatedAt: row.updated_at,
    };
}

export class ModelLimitOverrideStore {
    async get(providerId: RuntimeProviderId, modelId: string): Promise<ModelLimitOverrideRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('model_limit_overrides')
            .select(['provider_id', 'model_id', 'context_length', 'max_output_tokens', 'reason', 'updated_at'])
            .where('provider_id', '=', providerId)
            .where('model_id', '=', modelId)
            .executeTakeFirst();

        return row ? mapModelLimitOverride(row) : null;
    }

    async upsert(input: {
        providerId: RuntimeProviderId;
        modelId: string;
        contextLength?: number;
        maxOutputTokens?: number;
        reason: string;
    }): Promise<ModelLimitOverrideRecord> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        await db
            .insertInto('model_limit_overrides')
            .values({
                provider_id: input.providerId,
                model_id: input.modelId,
                context_length: input.contextLength ?? null,
                max_output_tokens: input.maxOutputTokens ?? null,
                reason: input.reason,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.columns(['provider_id', 'model_id']).doUpdateSet({
                    context_length: input.contextLength ?? null,
                    max_output_tokens: input.maxOutputTokens ?? null,
                    reason: input.reason,
                    updated_at: updatedAt,
                })
            )
            .execute();

        return {
            providerId: input.providerId,
            modelId: input.modelId,
            ...(input.contextLength !== undefined ? { contextLength: input.contextLength } : {}),
            ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
            reason: input.reason,
            updatedAt,
        };
    }

    async delete(providerId: RuntimeProviderId, modelId: string): Promise<void> {
        const { db } = getPersistence();
        await db
            .deleteFrom('model_limit_overrides')
            .where('provider_id', '=', providerId)
            .where('model_id', '=', modelId)
            .execute();
    }

    async deleteAll(): Promise<number> {
        const { db } = getPersistence();
        const rows = await db.deleteFrom('model_limit_overrides').returning('model_id').execute();
        return rows.length;
    }
}

export const modelLimitOverrideStore = new ModelLimitOverrideStore();

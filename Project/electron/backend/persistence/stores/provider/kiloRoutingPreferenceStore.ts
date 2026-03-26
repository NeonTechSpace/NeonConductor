import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { KiloModelRoutingPreferenceRecord } from '@/app/backend/persistence/types';
import { kiloDynamicSorts, kiloRoutingModes } from '@/app/backend/runtime/contracts';
import type { KiloModelRoutingPreference } from '@/app/backend/runtime/contracts';
import { DataCorruptionError, InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

interface KiloRoutingPreferenceRow {
    profile_id: string;
    provider_id: string;
    model_id: string;
    routing_mode: string;
    sort: string | null;
    pinned_provider_id: string | null;
    updated_at: string;
}

function mapKiloRoutingPreference(row: KiloRoutingPreferenceRow): KiloModelRoutingPreferenceRecord {
    if (row.provider_id !== 'kilo') {
        throw new DataCorruptionError(`Invalid provider_id in kilo routing preference row: "${row.provider_id}".`);
    }

    const routingMode = parseEnumValue(
        row.routing_mode,
        'kilo_model_routing_preferences.routing_mode',
        kiloRoutingModes
    );

    if (routingMode === 'dynamic') {
        if (!row.sort) {
            throw new DataCorruptionError(
                'Invalid kilo routing preference row: "sort" is required when routing_mode is "dynamic".'
            );
        }
        if (row.pinned_provider_id) {
            throw new DataCorruptionError(
                'Invalid kilo routing preference row: "pinned_provider_id" is not allowed when routing_mode is "dynamic".'
            );
        }

        return {
            profileId: row.profile_id,
            providerId: 'kilo',
            modelId: row.model_id,
            routingMode,
            sort: parseEnumValue(row.sort, 'kilo_model_routing_preferences.sort', kiloDynamicSorts),
            updatedAt: row.updated_at,
        };
    }

    if (!row.pinned_provider_id) {
        throw new DataCorruptionError(
            'Invalid kilo routing preference row: "pinned_provider_id" is required when routing_mode is "pinned".'
        );
    }
    if (row.sort) {
        throw new DataCorruptionError(
            'Invalid kilo routing preference row: "sort" is not allowed when routing_mode is "pinned".'
        );
    }

    return {
        profileId: row.profile_id,
        providerId: 'kilo',
        modelId: row.model_id,
        routingMode,
        pinnedProviderId: row.pinned_provider_id,
        updatedAt: row.updated_at,
    };
}

function toRowValues(input: KiloModelRoutingPreference): OperationalResult<{
    routing_mode: 'dynamic' | 'pinned';
    sort: 'default' | 'price' | 'throughput' | 'latency' | null;
    pinned_provider_id: string | null;
}> {
    if (input.routingMode === 'dynamic') {
        if (!input.sort) {
            return errOp(
                'invalid_payload',
                'Invalid routing preference: "sort" is required when routingMode is "dynamic".'
            );
        }
        if (input.pinnedProviderId !== undefined) {
            return errOp(
                'invalid_payload',
                'Invalid routing preference: "pinnedProviderId" is not allowed when routingMode is "dynamic".'
            );
        }

        return okOp({
            routing_mode: 'dynamic' as const,
            sort: input.sort,
            pinned_provider_id: null,
        });
    }

    if (!input.pinnedProviderId) {
        return errOp(
            'invalid_payload',
            'Invalid routing preference: "pinnedProviderId" is required when routingMode is "pinned".'
        );
    }
    if (input.sort !== undefined) {
        return errOp(
            'invalid_payload',
            'Invalid routing preference: "sort" is not allowed when routingMode is "pinned".'
        );
    }

    return okOp({
        routing_mode: 'pinned' as const,
        sort: null,
        pinned_provider_id: input.pinnedProviderId,
    });
}

export class KiloRoutingPreferenceStore {
    async getPreference(profileId: string, modelId: string): Promise<KiloModelRoutingPreferenceRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('kilo_model_routing_preferences')
            .select([
                'profile_id',
                'provider_id',
                'model_id',
                'routing_mode',
                'sort',
                'pinned_provider_id',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', 'kilo')
            .where('model_id', '=', modelId)
            .executeTakeFirst();

        return row ? mapKiloRoutingPreference(row) : null;
    }

    async setPreference(
        input: KiloModelRoutingPreference
    ): Promise<OperationalResult<KiloModelRoutingPreferenceRecord>> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        const valuesResult = toRowValues(input);
        if (valuesResult.isErr()) {
            return errOp(valuesResult.error.code, valuesResult.error.message);
        }
        const values = valuesResult.value;
        await db
            .insertInto('kilo_model_routing_preferences')
            .values({
                profile_id: input.profileId,
                provider_id: 'kilo',
                model_id: input.modelId,
                routing_mode: values.routing_mode,
                sort: values.sort,
                pinned_provider_id: values.pinned_provider_id,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'provider_id', 'model_id']).doUpdateSet({
                    routing_mode: values.routing_mode,
                    sort: values.sort,
                    pinned_provider_id: values.pinned_provider_id,
                    updated_at: updatedAt,
                })
            )
            .execute();

        const row = await this.getPreference(input.profileId, input.modelId);
        if (!row) {
            throw new InvariantError('Failed to read persisted kilo routing preference after upsert.');
        }
        return okOp(row);
    }

    async listPreferencesByProfile(profileId: string): Promise<KiloModelRoutingPreferenceRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('kilo_model_routing_preferences')
            .select([
                'profile_id',
                'provider_id',
                'model_id',
                'routing_mode',
                'sort',
                'pinned_provider_id',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', 'kilo')
            .orderBy('model_id', 'asc')
            .execute();

        return rows.map((row) => mapKiloRoutingPreference(row));
    }
}

export const kiloRoutingPreferenceStore = new KiloRoutingPreferenceStore();

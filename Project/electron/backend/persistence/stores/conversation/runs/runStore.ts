import { getPersistence } from '@/app/backend/persistence/db';
import { mapRunRecord } from '@/app/backend/persistence/stores/conversation/runs/runStoreMapper';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { RunRecord } from '@/app/backend/persistence/types';
import type {
    ProviderAuthMethod,
    RunStatus,
    RuntimeProviderId,
    RuntimeRunOptions,
} from '@/app/backend/runtime/contracts';
import type { ProviderRuntimeTransportFamily } from '@/app/backend/providers/types';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

export interface CreateRunInput {
    profileId: string;
    sessionId: string;
    prompt: string;
    providerId: RuntimeProviderId;
    modelId: string;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: RuntimeRunOptions;
    cache: {
        applied: boolean;
        key?: string;
        reason?: string;
    };
    transport: {
        selected?: ProviderRuntimeTransportFamily;
        degradedReason?: string;
    };
}

export interface FinalizeRunInput {
    status: Extract<RunStatus, 'completed' | 'aborted' | 'error'>;
    errorCode?: string;
    errorMessage?: string;
}

export interface UpdateRunRuntimeMetadataInput {
    cacheApplied?: boolean;
    cacheSkipReason?: string;
    transportSelected?: ProviderRuntimeTransportFamily;
    transportDegradedReason?: string;
}

export class RunStore {
    async create(input: CreateRunInput): Promise<RunRecord> {
        const { db } = getPersistence();
        const runId = createEntityId('run');
        const now = nowIso();

        await db
            .insertInto('runs')
            .values({
                id: runId,
                session_id: input.sessionId,
                profile_id: input.profileId,
                prompt: input.prompt,
                status: 'running',
                provider_id: input.providerId,
                model_id: input.modelId,
                auth_method: input.authMethod,
                reasoning_effort: input.runtimeOptions.reasoning.effort,
                reasoning_summary: input.runtimeOptions.reasoning.summary,
                reasoning_include_encrypted: input.runtimeOptions.reasoning.includeEncrypted ? 1 : 0,
                cache_strategy: input.runtimeOptions.cache.strategy,
                cache_key: input.cache.key ?? null,
                cache_applied: input.cache.applied ? 1 : 0,
                cache_skip_reason: input.cache.reason ?? null,
                transport_requested_family: input.runtimeOptions.transport.family,
                transport_selected: input.transport.selected ?? null,
                transport_degraded_reason: input.transport.degradedReason ?? null,
                started_at: now,
                completed_at: null,
                aborted_at: null,
                error_code: null,
                error_message: null,
                created_at: now,
                updated_at: now,
            })
            .execute();

        const row = await db.selectFrom('runs').selectAll().where('id', '=', runId).executeTakeFirstOrThrow();
        return mapRunRecord(row);
    }

    async getById(runId: string): Promise<RunRecord | null> {
        const { db } = getPersistence();
        const row = await db.selectFrom('runs').selectAll().where('id', '=', runId).executeTakeFirst();
        return row ? mapRunRecord(row) : null;
    }

    async listBySession(profileId: string, sessionId: string): Promise<RunRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('runs')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapRunRecord);
    }

    async listByProfile(profileId: string): Promise<RunRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('runs')
            .selectAll()
            .where('profile_id', '=', profileId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapRunRecord);
    }

    async updateRuntimeMetadata(runId: string, input: UpdateRunRuntimeMetadataInput): Promise<RunRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();

        const values: {
            updated_at: string;
            cache_applied?: 0 | 1;
            cache_skip_reason?: string | null;
            transport_selected?: ProviderRuntimeTransportFamily | null;
            transport_degraded_reason?: string | null;
        } = {
            updated_at: now,
        };

        if (input.cacheApplied !== undefined) {
            values.cache_applied = input.cacheApplied ? 1 : 0;
        }
        if (input.cacheSkipReason !== undefined) {
            values.cache_skip_reason = input.cacheSkipReason;
        }
        if (input.transportSelected !== undefined) {
            values.transport_selected = input.transportSelected;
        }
        if (input.transportDegradedReason !== undefined) {
            values.transport_degraded_reason = input.transportDegradedReason;
        }

        const row = await db.updateTable('runs').set(values).where('id', '=', runId).returningAll().executeTakeFirst();
        return row ? mapRunRecord(row) : null;
    }

    async finalize(runId: string, input: FinalizeRunInput): Promise<RunRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();

        const row = await db
            .updateTable('runs')
            .set({
                status: input.status,
                updated_at: now,
                completed_at: input.status === 'completed' ? now : null,
                aborted_at: input.status === 'aborted' ? now : null,
                error_code: input.errorCode ?? null,
                error_message: input.errorMessage ?? null,
            })
            .where('id', '=', runId)
            .returningAll()
            .executeTakeFirst();

        return row ? mapRunRecord(row) : null;
    }

    async deleteById(runId: string): Promise<boolean> {
        const { db } = getPersistence();
        const row = await db.deleteFrom('runs').where('id', '=', runId).returning('id').executeTakeFirst();
        return Boolean(row);
    }
}

export const runStore = new RunStore();


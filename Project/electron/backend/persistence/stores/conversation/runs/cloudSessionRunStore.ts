import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { EntityId } from '@/app/backend/runtime/contracts';

const cloudSessionRunStates = ['preparing', 'streaming', 'completed', 'failed', 'aborted'] as const;
export type CloudSessionRunState = (typeof cloudSessionRunStates)[number];

export interface CloudSessionRunRecord {
    runId: EntityId<'run'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    cloudSessionId: EntityId<'csess'>;
    remoteSessionId: string;
    remoteScopeKey: string;
    remoteRunId?: string;
    remoteTicketId?: string;
    harnessState: CloudSessionRunState;
    errorCode?: string;
    errorMessage?: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

interface CloudSessionRunRow {
    run_id: string;
    profile_id: string;
    session_id: string;
    cloud_session_id: string;
    remote_session_id: string;
    remote_scope_key: string;
    remote_run_id: string | null;
    remote_ticket_id: string | null;
    harness_state: string;
    error_code: string | null;
    error_message: string | null;
    metadata_json: string;
    created_at: string;
    updated_at: string;
}

function mapCloudSessionRun(row: CloudSessionRunRow): CloudSessionRunRecord {
    return {
        runId: parseEntityId(row.run_id, 'cloud_session_run_records.run_id', 'run'),
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'cloud_session_run_records.session_id', 'sess'),
        cloudSessionId: parseEntityId(row.cloud_session_id, 'cloud_session_run_records.cloud_session_id', 'csess'),
        remoteSessionId: row.remote_session_id,
        remoteScopeKey: row.remote_scope_key,
        ...(row.remote_run_id ? { remoteRunId: row.remote_run_id } : {}),
        ...(row.remote_ticket_id ? { remoteTicketId: row.remote_ticket_id } : {}),
        harnessState: parseEnumValue(
            row.harness_state,
            'cloud_session_run_records.harness_state',
            cloudSessionRunStates
        ),
        ...(row.error_code ? { errorCode: row.error_code } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        metadata: parseJsonRecord(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class CloudSessionRunStore {
    async create(input: {
        runId: EntityId<'run'>;
        profileId: string;
        sessionId: EntityId<'sess'>;
        cloudSessionId: EntityId<'csess'>;
        remoteSessionId: string;
        remoteScopeKey: string;
        remoteRunId?: string;
        remoteTicketId?: string;
        harnessState: CloudSessionRunState;
        metadata?: Record<string, unknown>;
    }): Promise<CloudSessionRunRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        await db
            .insertInto('cloud_session_run_records')
            .values({
                run_id: input.runId,
                profile_id: input.profileId,
                session_id: input.sessionId,
                cloud_session_id: input.cloudSessionId,
                remote_session_id: input.remoteSessionId,
                remote_scope_key: input.remoteScopeKey,
                remote_run_id: input.remoteRunId ?? null,
                remote_ticket_id: input.remoteTicketId ?? null,
                harness_state: input.harnessState,
                error_code: null,
                error_message: null,
                metadata_json: JSON.stringify(input.metadata ?? {}),
                created_at: now,
                updated_at: now,
            })
            .execute();

        const row = await db
            .selectFrom('cloud_session_run_records')
            .selectAll()
            .where('run_id', '=', input.runId)
            .executeTakeFirstOrThrow();
        return mapCloudSessionRun(row);
    }

    async updateState(input: {
        runId: EntityId<'run'>;
        harnessState: CloudSessionRunState;
        remoteRunId?: string;
        remoteTicketId?: string;
        errorCode?: string | null;
        errorMessage?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<CloudSessionRunRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .updateTable('cloud_session_run_records')
            .set({
                harness_state: input.harnessState,
                ...(input.remoteRunId !== undefined ? { remote_run_id: input.remoteRunId } : {}),
                ...(input.remoteTicketId !== undefined ? { remote_ticket_id: input.remoteTicketId } : {}),
                ...(input.errorCode !== undefined ? { error_code: input.errorCode } : {}),
                ...(input.errorMessage !== undefined ? { error_message: input.errorMessage } : {}),
                ...(input.metadata !== undefined ? { metadata_json: JSON.stringify(input.metadata) } : {}),
                updated_at: nowIso(),
            })
            .where('run_id', '=', input.runId)
            .returningAll()
            .executeTakeFirst();
        return row ? mapCloudSessionRun(row) : null;
    }

    async getByRunId(runId: EntityId<'run'>): Promise<CloudSessionRunRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('cloud_session_run_records')
            .selectAll()
            .where('run_id', '=', runId)
            .executeTakeFirst();
        return row ? mapCloudSessionRun(row) : null;
    }
}

export const cloudSessionRunStore = new CloudSessionRunStore();

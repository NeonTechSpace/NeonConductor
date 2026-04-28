import { getPersistence } from '@/app/backend/persistence/db';
import type { CloudSessionRecordsTable, DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { CloudSessionSummaryRecord } from '@/app/backend/persistence/types';
import {
    cloudSessionAuthorityStates,
    cloudSessionRecordKinds,
    cloudSessionSyncStates,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

import type { Insertable, Selectable, Transaction } from 'kysely';

type CloudSessionRow = Selectable<CloudSessionRecordsTable>;
type CloudSessionInsert = Insertable<CloudSessionRecordsTable>;

interface CloudSessionUpsertInput {
    profileId: string;
    remoteSessionId: string;
    remoteScopeKey?: string;
    accountId?: string;
    organizationId?: string;
    title?: string;
    remoteCreatedAt?: string;
    remoteUpdatedAt?: string;
    metadata?: Record<string, unknown>;
}

interface CloudSessionBindingInput extends CloudSessionUpsertInput {
    localSessionId: NonNullable<CloudSessionSummaryRecord['localSessionId']>;
}

interface CloudSessionSyncResultInput {
    profileId: string;
    id: CloudSessionSummaryRecord['id'];
    syncState: CloudSessionSummaryRecord['syncState'];
    lastSyncedAt?: string;
    lastSyncErrorCode?: string;
    lastSyncErrorMessage?: string;
}

function resolveRemoteScopeKey(input: { remoteScopeKey?: string; organizationId?: string; accountId?: string }): string {
    return input.remoteScopeKey ?? input.organizationId ?? input.accountId ?? 'kilo:default';
}

function mapCloudSession(row: CloudSessionRow): CloudSessionSummaryRecord {
    return {
        id: parseEntityId(row.id, 'cloud_session_records.id', 'csess'),
        profileId: row.profile_id,
        providerId: 'kilo',
        recordKind: parseEnumValue(row.record_kind, 'cloud_session_records.record_kind', cloudSessionRecordKinds),
        authorityState: parseEnumValue(
            row.authority_state,
            'cloud_session_records.authority_state',
            cloudSessionAuthorityStates
        ),
        syncState: parseEnumValue(row.sync_state, 'cloud_session_records.sync_state', cloudSessionSyncStates),
        remoteSessionId: row.remote_session_id,
        remoteScopeKey: row.remote_scope_key,
        ...(row.local_session_id
            ? { localSessionId: parseEntityId(row.local_session_id, 'cloud_session_records.local_session_id', 'sess') }
            : {}),
        ...(row.account_id ? { accountId: row.account_id } : {}),
        ...(row.organization_id ? { organizationId: row.organization_id } : {}),
        ...(row.title ? { title: row.title } : {}),
        ...(row.remote_created_at ? { remoteCreatedAt: row.remote_created_at } : {}),
        ...(row.remote_updated_at ? { remoteUpdatedAt: row.remote_updated_at } : {}),
        ...(row.last_synced_at ? { lastSyncedAt: row.last_synced_at } : {}),
        ...(row.last_sync_error_code ? { lastSyncErrorCode: row.last_sync_error_code } : {}),
        ...(row.last_sync_error_message ? { lastSyncErrorMessage: row.last_sync_error_message } : {}),
        metadata: parseJsonRecord(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function buildRemoteSnapshotValues(input: CloudSessionUpsertInput, timestamp: string): CloudSessionInsert {
    return {
        id: createEntityId('csess'),
        profile_id: input.profileId,
        provider_id: 'kilo',
        record_kind: 'remote_snapshot',
        authority_state: 'remote_only',
        sync_state: 'synced',
        remote_session_id: input.remoteSessionId,
        remote_scope_key: resolveRemoteScopeKey(input),
        local_session_id: null,
        account_id: input.accountId ?? null,
        organization_id: input.organizationId ?? null,
        title: input.title ?? null,
        remote_created_at: input.remoteCreatedAt ?? null,
        remote_updated_at: input.remoteUpdatedAt ?? null,
        last_synced_at: timestamp,
        last_sync_error_code: null,
        last_sync_error_message: null,
        metadata_json: JSON.stringify(input.metadata ?? {}),
        created_at: timestamp,
        updated_at: timestamp,
    };
}

export class CloudSessionStore {
    private async getById(profileId: string, id: CloudSessionSummaryRecord['id']): Promise<CloudSessionSummaryRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('cloud_session_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', id)
            .executeTakeFirst();

        return row ? mapCloudSession(row) : null;
    }

    async upsertRemoteSnapshot(input: CloudSessionUpsertInput): Promise<CloudSessionSummaryRecord> {
        const { db } = getPersistence();
        const timestamp = nowIso();
        const values = buildRemoteSnapshotValues(input, timestamp);
        await db
            .insertInto('cloud_session_records')
            .values(values)
            .onConflict((oc) =>
                oc.columns(['profile_id', 'provider_id', 'remote_scope_key', 'remote_session_id']).doUpdateSet({
                    record_kind: 'remote_snapshot',
                    authority_state: 'remote_only',
                    sync_state: 'synced',
                    account_id: values.account_id,
                    organization_id: values.organization_id,
                    title: values.title,
                    remote_created_at: values.remote_created_at,
                    remote_updated_at: values.remote_updated_at,
                    last_synced_at: timestamp,
                    last_sync_error_code: null,
                    last_sync_error_message: null,
                    metadata_json: values.metadata_json,
                    updated_at: timestamp,
                })
            )
            .execute();

        const row = await db
            .selectFrom('cloud_session_records')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('provider_id', '=', 'kilo')
            .where('remote_scope_key', '=', values.remote_scope_key)
            .where('remote_session_id', '=', input.remoteSessionId)
            .executeTakeFirst();

        if (!row) {
            throw new InvariantError('Failed to read cloud session remote snapshot after upsert.');
        }
        return mapCloudSession(row);
    }

    async createLocalBinding(
        transaction: Transaction<DatabaseSchema>,
        input: CloudSessionBindingInput
    ): Promise<OperationalResult<CloudSessionSummaryRecord>> {
        const timestamp = nowIso();
        const session = await transaction
            .selectFrom('sessions')
            .select(['id', 'kind'])
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.localSessionId)
            .executeTakeFirst();
        if (!session) {
            return errOp('not_found', 'Cloud session binding target session was not found.');
        }
        if (session.kind !== 'cloud') {
            return errOp('invalid_payload', 'Cloud session bindings require a cloud session.');
        }

        const values: CloudSessionInsert = {
            ...buildRemoteSnapshotValues(input, timestamp),
            record_kind: 'local_binding',
            authority_state: 'mirrored',
            local_session_id: input.localSessionId,
        };
        await transaction
            .insertInto('cloud_session_records')
            .values(values)
            .onConflict((oc) =>
                oc.columns(['profile_id', 'provider_id', 'remote_scope_key', 'remote_session_id']).doUpdateSet({
                    record_kind: 'local_binding',
                    authority_state: 'mirrored',
                    sync_state: 'synced',
                    local_session_id: values.local_session_id,
                    account_id: values.account_id,
                    organization_id: values.organization_id,
                    title: values.title,
                    remote_created_at: values.remote_created_at,
                    remote_updated_at: values.remote_updated_at,
                    last_synced_at: timestamp,
                    last_sync_error_code: null,
                    last_sync_error_message: null,
                    metadata_json: values.metadata_json,
                    updated_at: timestamp,
                })
            )
            .execute();

        const row = await transaction
            .selectFrom('cloud_session_records')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('local_session_id', '=', input.localSessionId)
            .executeTakeFirst();
        if (!row) {
            throw new InvariantError('Failed to read cloud session local binding after upsert.');
        }

        return okOp(mapCloudSession(row));
    }

    async getBySessionId(profileId: string, sessionId: CloudSessionSummaryRecord['localSessionId']): Promise<CloudSessionSummaryRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('cloud_session_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('local_session_id', '=', sessionId ?? '')
            .executeTakeFirst();
        return row ? mapCloudSession(row) : null;
    }

    async listBySessionIds(
        profileId: string,
        sessionIds: Array<NonNullable<CloudSessionSummaryRecord['localSessionId']>>
    ): Promise<CloudSessionSummaryRecord[]> {
        if (sessionIds.length === 0) {
            return [];
        }
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('cloud_session_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('local_session_id', 'in', sessionIds)
            .execute();
        return rows.map(mapCloudSession);
    }

    async listByProfile(profileId: string): Promise<CloudSessionSummaryRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('cloud_session_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .orderBy('updated_at', 'desc')
            .execute();
        return rows.map(mapCloudSession);
    }

    async markSyncResult(input: CloudSessionSyncResultInput): Promise<OperationalResult<CloudSessionSummaryRecord>> {
        if (input.syncState === 'failed' && !input.lastSyncErrorMessage) {
            return errOp('invalid_payload', 'Failed cloud session sync state requires an error message.');
        }

        const { db } = getPersistence();
        await db
            .updateTable('cloud_session_records')
            .set({
                sync_state: input.syncState,
                last_synced_at: input.lastSyncedAt ?? (input.syncState === 'synced' ? nowIso() : null),
                last_sync_error_code: input.lastSyncErrorCode ?? null,
                last_sync_error_message: input.lastSyncErrorMessage ?? null,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.id)
            .executeTakeFirst();

        const updated = await this.getById(input.profileId, input.id);
        return updated ? okOp(updated) : errOp('not_found', 'Cloud session record was not found.');
    }
}

export const cloudSessionStore = new CloudSessionStore();

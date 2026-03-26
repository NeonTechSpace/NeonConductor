import { createHash } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { checkpointSnapshotStore } from '@/app/backend/persistence/stores/runtime/checkpointSnapshotStore';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { CheckpointChangesetRecord, CheckpointRecord } from '@/app/backend/persistence/types';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

function mapCheckpointChangesetRecord(row: {
    id: string;
    profile_id: string;
    checkpoint_id: string;
    source_changeset_id: string | null;
    session_id: string;
    thread_id: string;
    run_id: string | null;
    execution_target_key: string;
    execution_target_kind: string;
    execution_target_label: string;
    created_by_kind: string;
    changeset_kind: string;
    summary: string;
    change_count: number;
    created_at: string;
    updated_at: string;
}): Omit<CheckpointChangesetRecord, 'entries'> {
    return {
        id: parseEntityId(row.id, 'checkpoint_changesets.id', 'chg'),
        profileId: row.profile_id,
        checkpointId: parseEntityId(row.checkpoint_id, 'checkpoint_changesets.checkpoint_id', 'ckpt'),
        ...(row.source_changeset_id
            ? {
                  sourceChangesetId: parseEntityId(
                      row.source_changeset_id,
                      'checkpoint_changesets.source_changeset_id',
                      'chg'
                  ),
              }
            : {}),
        sessionId: parseEntityId(row.session_id, 'checkpoint_changesets.session_id', 'sess'),
        threadId: parseEntityId(row.thread_id, 'checkpoint_changesets.thread_id', 'thr'),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'checkpoint_changesets.run_id', 'run') } : {}),
        executionTargetKey: row.execution_target_key,
        executionTargetKind: row.execution_target_kind === 'sandbox' ? 'sandbox' : 'workspace',
        executionTargetLabel: row.execution_target_label,
        createdByKind: row.created_by_kind === 'user' ? 'user' : 'system',
        changesetKind: row.changeset_kind === 'revert' ? 'revert' : 'run_capture',
        summary: row.summary,
        changeCount: row.change_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const CHANGESET_COLUMNS = [
    'id',
    'profile_id',
    'checkpoint_id',
    'source_changeset_id',
    'session_id',
    'thread_id',
    'run_id',
    'execution_target_key',
    'execution_target_kind',
    'execution_target_label',
    'created_by_kind',
    'changeset_kind',
    'summary',
    'change_count',
    'created_at',
    'updated_at',
] as const;

interface ReplaceCheckpointChangesetInput {
    profileId: string;
    checkpointId: CheckpointRecord['id'];
    sourceChangesetId?: CheckpointChangesetRecord['id'];
    sessionId: CheckpointRecord['sessionId'];
    threadId: CheckpointRecord['threadId'];
    runId?: CheckpointRecord['runId'];
    executionTargetKey: string;
    executionTargetKind: CheckpointRecord['executionTargetKind'];
    executionTargetLabel: string;
    createdByKind: CheckpointChangesetRecord['createdByKind'];
    changesetKind: CheckpointChangesetRecord['changesetKind'];
    summary: string;
    entries: CheckpointChangesetRecord['entries'];
}

export class CheckpointChangesetStore {
    async replaceForCheckpoint(input: ReplaceCheckpointChangesetInput): Promise<CheckpointChangesetRecord> {
        const { db } = getPersistence();
        const createdAt = nowIso();
        const normalizedEntries = input.entries.map((entry) => ({
            relativePath: entry.relativePath,
            changeKind: entry.changeKind,
            beforeBytes: entry.beforeBytes,
            beforeByteSize: entry.beforeBytes?.byteLength ?? null,
            beforeBlobSha256: entry.beforeBytes ? createHash('sha256').update(entry.beforeBytes).digest('hex') : null,
            afterBytes: entry.afterBytes,
            afterByteSize: entry.afterBytes?.byteLength ?? null,
            afterBlobSha256: entry.afterBytes ? createHash('sha256').update(entry.afterBytes).digest('hex') : null,
        }));

        return db.transaction().execute(async (transaction) => {
            const existing = await transaction
                .selectFrom('checkpoint_changesets')
                .select('id')
                .where('profile_id', '=', input.profileId)
                .where('checkpoint_id', '=', input.checkpointId)
                .executeTakeFirst();

            const changesetId = existing?.id
                ? parseEntityId(existing.id, 'checkpoint_changesets.id', 'chg')
                : createEntityId('chg');

            if (existing) {
                await transaction
                    .deleteFrom('checkpoint_changeset_entries')
                    .where('changeset_id', '=', changesetId)
                    .execute();

                await transaction
                    .updateTable('checkpoint_changesets')
                    .set({
                        source_changeset_id: input.sourceChangesetId ?? null,
                        session_id: input.sessionId,
                        thread_id: input.threadId,
                        run_id: input.runId ?? null,
                        execution_target_key: input.executionTargetKey,
                        execution_target_kind: input.executionTargetKind,
                        execution_target_label: input.executionTargetLabel,
                        created_by_kind: input.createdByKind,
                        changeset_kind: input.changesetKind,
                        summary: input.summary,
                        change_count: normalizedEntries.length,
                        updated_at: createdAt,
                    })
                    .where('id', '=', changesetId)
                    .execute();
            } else {
                await transaction
                    .insertInto('checkpoint_changesets')
                    .values({
                        id: changesetId,
                        profile_id: input.profileId,
                        checkpoint_id: input.checkpointId,
                        source_changeset_id: input.sourceChangesetId ?? null,
                        session_id: input.sessionId,
                        thread_id: input.threadId,
                        run_id: input.runId ?? null,
                        execution_target_key: input.executionTargetKey,
                        execution_target_kind: input.executionTargetKind,
                        execution_target_label: input.executionTargetLabel,
                        created_by_kind: input.createdByKind,
                        changeset_kind: input.changesetKind,
                        summary: input.summary,
                        change_count: normalizedEntries.length,
                        created_at: createdAt,
                        updated_at: createdAt,
                    })
                    .execute();
            }

            for (const entry of normalizedEntries) {
                if (entry.beforeBytes && entry.beforeBlobSha256) {
                    await transaction
                        .insertInto('checkpoint_snapshot_blobs')
                        .values({
                            sha256: entry.beforeBlobSha256,
                            byte_size: entry.beforeByteSize ?? 0,
                            storage_state: 'inline',
                            bytes_blob: Buffer.from(entry.beforeBytes),
                            created_at: createdAt,
                            updated_at: createdAt,
                        })
                        .onConflict((oc) => oc.column('sha256').doNothing())
                        .execute();
                }

                if (entry.afterBytes && entry.afterBlobSha256) {
                    await transaction
                        .insertInto('checkpoint_snapshot_blobs')
                        .values({
                            sha256: entry.afterBlobSha256,
                            byte_size: entry.afterByteSize ?? 0,
                            storage_state: 'inline',
                            bytes_blob: Buffer.from(entry.afterBytes),
                            created_at: createdAt,
                            updated_at: createdAt,
                        })
                        .onConflict((oc) => oc.column('sha256').doNothing())
                        .execute();
                }
            }

            if (normalizedEntries.length > 0) {
                await transaction
                    .insertInto('checkpoint_changeset_entries')
                    .values(
                        normalizedEntries.map((entry) => ({
                            changeset_id: changesetId,
                            relative_path: entry.relativePath,
                            change_kind: entry.changeKind,
                            before_blob_sha256: entry.beforeBlobSha256,
                            before_byte_size: entry.beforeByteSize,
                            after_blob_sha256: entry.afterBlobSha256,
                            after_byte_size: entry.afterByteSize,
                            created_at: createdAt,
                        }))
                    )
                    .execute();
            }

            const record = await this.getByIdInternal({
                transaction,
                profileId: input.profileId,
                changesetId,
            });
            if (!record) {
                throw new Error('Checkpoint changeset persisted successfully but could not be reloaded.');
            }

            return record;
        });
    }

    async getByCheckpointId(
        profileId: string,
        checkpointId: CheckpointRecord['id']
    ): Promise<CheckpointChangesetRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('checkpoint_changesets')
            .select(CHANGESET_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('checkpoint_id', '=', checkpointId)
            .executeTakeFirst();

        if (!row) {
            return null;
        }

        return this.getById(profileId, parseEntityId(row.id, 'checkpoint_changesets.id', 'chg'));
    }

    async getById(
        profileId: string,
        changesetId: CheckpointChangesetRecord['id']
    ): Promise<CheckpointChangesetRecord | null> {
        const { db } = getPersistence();
        return this.getByIdInternal({
            transaction: db,
            profileId,
            changesetId,
        });
    }

    async listChangeCountsByCheckpointIds(
        profileId: string,
        checkpointIds: CheckpointRecord['id'][]
    ): Promise<Map<CheckpointRecord['id'], number>> {
        if (checkpointIds.length === 0) {
            return new Map();
        }

        const { db } = getPersistence();
        const rows = await db
            .selectFrom('checkpoint_changesets')
            .select(['checkpoint_id', 'change_count'])
            .where('profile_id', '=', profileId)
            .where('checkpoint_id', 'in', checkpointIds)
            .execute();

        return new Map(
            rows.map((row) => [
                parseEntityId(row.checkpoint_id, 'checkpoint_changesets.checkpoint_id', 'ckpt'),
                row.change_count,
            ])
        );
    }

    private async getByIdInternal(input: {
        transaction: ReturnType<typeof getPersistence>['db'];
        profileId: string;
        changesetId: CheckpointChangesetRecord['id'];
    }): Promise<CheckpointChangesetRecord | null> {
        const row = await input.transaction
            .selectFrom('checkpoint_changesets')
            .select(CHANGESET_COLUMNS)
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.changesetId)
            .executeTakeFirst();

        if (!row) {
            return null;
        }

        const entryRows = await input.transaction
            .selectFrom('checkpoint_changeset_entries')
            .select([
                'checkpoint_changeset_entries.changeset_id as changeset_id',
                'checkpoint_changeset_entries.relative_path as relative_path',
                'checkpoint_changeset_entries.change_kind as change_kind',
                'checkpoint_changeset_entries.before_blob_sha256 as before_blob_sha256',
                'checkpoint_changeset_entries.before_byte_size as before_byte_size',
                'checkpoint_changeset_entries.after_blob_sha256 as after_blob_sha256',
                'checkpoint_changeset_entries.after_byte_size as after_byte_size',
            ])
            .where('checkpoint_changeset_entries.changeset_id', '=', input.changesetId)
            .orderBy('checkpoint_changeset_entries.relative_path', 'asc')
            .execute();
        const blobBytesBySha = checkpointSnapshotStore.loadBlobBytesBySha(
            entryRows
                .flatMap((entryRow) => [entryRow.before_blob_sha256, entryRow.after_blob_sha256])
                .filter(Boolean) as string[]
        );

        return {
            ...mapCheckpointChangesetRecord(row),
            entries: entryRows.map((entryRow) => {
                const beforeBytes = entryRow.before_blob_sha256
                    ? blobBytesBySha.get(entryRow.before_blob_sha256)
                    : undefined;
                const afterBytes = entryRow.after_blob_sha256
                    ? blobBytesBySha.get(entryRow.after_blob_sha256)
                    : undefined;

                return {
                    changesetId: parseEntityId(
                        entryRow.changeset_id,
                        'checkpoint_changeset_entries.changeset_id',
                        'chg'
                    ),
                    relativePath: entryRow.relative_path,
                    changeKind:
                        entryRow.change_kind === 'added'
                            ? 'added'
                            : entryRow.change_kind === 'deleted'
                              ? 'deleted'
                              : 'modified',
                    ...(entryRow.before_blob_sha256 ? { beforeBlobSha256: entryRow.before_blob_sha256 } : {}),
                    ...(entryRow.before_byte_size !== null ? { beforeByteSize: entryRow.before_byte_size } : {}),
                    ...(beforeBytes ? { beforeBytes } : {}),
                    ...(entryRow.after_blob_sha256 ? { afterBlobSha256: entryRow.after_blob_sha256 } : {}),
                    ...(entryRow.after_byte_size !== null ? { afterByteSize: entryRow.after_byte_size } : {}),
                    ...(afterBytes ? { afterBytes } : {}),
                };
            }),
        };
    }
}

export const checkpointChangesetStore = new CheckpointChangesetStore();

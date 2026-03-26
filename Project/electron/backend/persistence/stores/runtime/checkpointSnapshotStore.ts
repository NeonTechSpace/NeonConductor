import { createHash, randomUUID } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from 'node:zlib';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { CheckpointCompactionRunRecord, CheckpointStorageSummary } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

export interface CheckpointSnapshotEntryRecord {
    checkpointId: EntityId<'ckpt'>;
    relativePath: string;
    blobSha256: string;
    byteSize: number;
    bytes: Uint8Array;
}

interface ReferencedInlineBlobCandidate {
    sha256: string;
    byteSize: number;
    bytes: Uint8Array;
    createdAt: string;
}

type CompactionTriggerKind = 'automatic' | 'manual';

function hashBytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function bufferFromBytes(bytes: Uint8Array): Buffer {
    return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

function mapCompactionRun(row: {
    id: string;
    profile_id: string;
    trigger_kind: string;
    status: string;
    message: string | null;
    blob_count_before: number;
    blob_count_after: number;
    bytes_before: number;
    bytes_after: number;
    blobs_compacted: number;
    database_reclaimed: number;
    started_at: string;
    completed_at: string;
}): CheckpointCompactionRunRecord {
    return {
        id: row.id as EntityId<'cpr'>,
        profileId: row.profile_id,
        triggerKind: row.trigger_kind === 'manual' ? 'manual' : 'automatic',
        status: row.status === 'failed' ? 'failed' : row.status === 'noop' ? 'noop' : 'success',
        ...(row.message ? { message: row.message } : {}),
        blobCountBefore: row.blob_count_before,
        blobCountAfter: row.blob_count_after,
        bytesBefore: row.bytes_before,
        bytesAfter: row.bytes_after,
        blobsCompacted: row.blobs_compacted,
        databaseReclaimed: row.database_reclaimed === 1,
        startedAt: row.started_at,
        completedAt: row.completed_at,
    };
}

export class CheckpointSnapshotStore {
    async replaceSnapshot(input: {
        checkpointId: EntityId<'ckpt'>;
        files: Array<{ relativePath: string; bytes: Uint8Array }>;
    }): Promise<void> {
        const { db } = getPersistence();
        const createdAt = nowIso();
        const normalizedFiles = input.files.map((file) => ({
            relativePath: file.relativePath,
            bytes: file.bytes,
            byteSize: file.bytes.byteLength,
            blobSha256: createHash('sha256').update(file.bytes).digest('hex'),
        }));

        await db.transaction().execute(async (transaction) => {
            await transaction
                .deleteFrom('checkpoint_snapshot_entries')
                .where('checkpoint_id', '=', input.checkpointId)
                .execute();

            for (const file of normalizedFiles) {
                await transaction
                    .insertInto('checkpoint_snapshot_blobs')
                    .values({
                        sha256: file.blobSha256,
                        byte_size: file.byteSize,
                        storage_state: 'inline',
                        bytes_blob: Buffer.from(file.bytes),
                        created_at: createdAt,
                        updated_at: createdAt,
                    })
                    .onConflict((oc) =>
                        oc.column('sha256').doUpdateSet({
                            byte_size: file.byteSize,
                            storage_state: 'inline',
                            bytes_blob: Buffer.from(file.bytes),
                            updated_at: createdAt,
                        })
                    )
                    .execute();
            }

            if (normalizedFiles.length === 0) {
                return;
            }

            await transaction
                .insertInto('checkpoint_snapshot_entries')
                .values(
                    normalizedFiles.map((file) => ({
                        checkpoint_id: input.checkpointId,
                        relative_path: file.relativePath,
                        blob_sha256: file.blobSha256,
                        byte_size: file.byteSize,
                        created_at: createdAt,
                    }))
                )
                .execute();
        });
    }

    async listSnapshotEntries(checkpointId: EntityId<'ckpt'>): Promise<CheckpointSnapshotEntryRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('checkpoint_snapshot_entries')
            .select([
                'checkpoint_snapshot_entries.checkpoint_id as checkpoint_id',
                'checkpoint_snapshot_entries.relative_path as relative_path',
                'checkpoint_snapshot_entries.blob_sha256 as blob_sha256',
                'checkpoint_snapshot_entries.byte_size as byte_size',
            ])
            .where('checkpoint_snapshot_entries.checkpoint_id', '=', checkpointId)
            .orderBy('checkpoint_snapshot_entries.relative_path', 'asc')
            .execute();

        const blobBytesBySha = this.loadBlobBytesBySha(rows.map((row) => row.blob_sha256));

        return rows.map((row) => ({
            checkpointId: row.checkpoint_id as EntityId<'ckpt'>,
            relativePath: row.relative_path,
            blobSha256: row.blob_sha256,
            byteSize: row.byte_size,
            bytes: blobBytesBySha.get(row.blob_sha256) ?? new Uint8Array(),
        }));
    }

    pruneUnreferencedBlobs(): number {
        const { sqlite } = getPersistence();
        const result = sqlite
            .prepare(
                `
                    DELETE FROM checkpoint_snapshot_blobs
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM checkpoint_snapshot_entries
                        WHERE checkpoint_snapshot_entries.blob_sha256 = checkpoint_snapshot_blobs.sha256
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM checkpoint_changeset_entries
                        WHERE checkpoint_changeset_entries.before_blob_sha256 = checkpoint_snapshot_blobs.sha256
                           OR checkpoint_changeset_entries.after_blob_sha256 = checkpoint_snapshot_blobs.sha256
                    )
                `
            )
            .run();

        sqlite
            .prepare(
                `
                    DELETE FROM checkpoint_blob_packs
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM checkpoint_blob_pack_members
                        WHERE checkpoint_blob_pack_members.pack_id = checkpoint_blob_packs.id
                    )
                `
            )
            .run();

        return Number(result.changes);
    }

    loadBlobBytesBySha(blobSha256s: string[]): Map<string, Uint8Array> {
        if (blobSha256s.length === 0) {
            return new Map();
        }

        const uniqueSha256s = [...new Set(blobSha256s)];
        const { sqlite } = getPersistence();
        const placeholders = uniqueSha256s.map(() => '?').join(', ');
        const blobRows = sqlite
            .prepare(
                `
                    SELECT
                        sha256,
                        storage_state,
                        bytes_blob
                    FROM checkpoint_snapshot_blobs
                    WHERE sha256 IN (${placeholders})
                `
            )
            .all(...uniqueSha256s) as Array<{
            sha256: string;
            storage_state: 'inline' | 'packed';
            bytes_blob: Uint8Array | null;
        }>;

        const packMemberRows = sqlite
            .prepare(
                `
                    SELECT
                        blob_sha256,
                        pack_id,
                        byte_offset,
                        compressed_byte_size
                    FROM checkpoint_blob_pack_members
                    WHERE blob_sha256 IN (${placeholders})
                `
            )
            .all(...uniqueSha256s) as Array<{
            blob_sha256: string;
            pack_id: string;
            byte_offset: number;
            compressed_byte_size: number;
        }>;
        const packIds = [...new Set(packMemberRows.map((row) => row.pack_id))];
        const packBytesById = new Map<string, Uint8Array>();

        if (packIds.length > 0) {
            const packPlaceholders = packIds.map(() => '?').join(', ');
            const packRows = sqlite
                .prepare(
                    `
                        SELECT
                            id,
                            pack_bytes_blob
                        FROM checkpoint_blob_packs
                        WHERE id IN (${packPlaceholders})
                    `
                )
                .all(...packIds) as Array<{
                id: string;
                pack_bytes_blob: Uint8Array;
            }>;
            for (const packRow of packRows) {
                packBytesById.set(packRow.id, packRow.pack_bytes_blob);
            }
        }

        const packMemberBySha = new Map(packMemberRows.map((row) => [row.blob_sha256, row]));
        const blobBytesBySha = new Map<string, Uint8Array>();

        for (const blobRow of blobRows) {
            if (blobRow.storage_state === 'inline') {
                if (!blobRow.bytes_blob) {
                    throw new Error(`Inline checkpoint blob ${blobRow.sha256} is missing bytes.`);
                }
                blobBytesBySha.set(blobRow.sha256, blobRow.bytes_blob);
                continue;
            }

            const packMember = packMemberBySha.get(blobRow.sha256);
            if (!packMember) {
                throw new Error(`Packed checkpoint blob ${blobRow.sha256} is missing its pack-member row.`);
            }
            const packBytes = packBytesById.get(packMember.pack_id);
            if (!packBytes) {
                throw new Error(`Packed checkpoint blob ${blobRow.sha256} is missing its pack payload.`);
            }
            const compressedBytes = bufferFromBytes(packBytes).subarray(
                packMember.byte_offset,
                packMember.byte_offset + packMember.compressed_byte_size
            );
            blobBytesBySha.set(blobRow.sha256, brotliDecompressSync(compressedBytes));
        }

        return blobBytesBySha;
    }

    getStorageSummary(profileId: string): CheckpointStorageSummary {
        const { sqlite } = getPersistence();
        const statsRow = sqlite
            .prepare(
                `
                    WITH referenced_blobs AS (
                        SELECT DISTINCT checkpoint_snapshot_entries.blob_sha256 AS blob_sha256
                        FROM checkpoint_snapshot_entries
                        INNER JOIN checkpoints ON checkpoints.id = checkpoint_snapshot_entries.checkpoint_id
                        WHERE checkpoints.profile_id = ?
                        UNION
                        SELECT DISTINCT checkpoint_changeset_entries.before_blob_sha256 AS blob_sha256
                        FROM checkpoint_changeset_entries
                        INNER JOIN checkpoint_changesets ON checkpoint_changesets.id = checkpoint_changeset_entries.changeset_id
                        WHERE checkpoint_changesets.profile_id = ?
                          AND checkpoint_changeset_entries.before_blob_sha256 IS NOT NULL
                        UNION
                        SELECT DISTINCT checkpoint_changeset_entries.after_blob_sha256 AS blob_sha256
                        FROM checkpoint_changeset_entries
                        INNER JOIN checkpoint_changesets ON checkpoint_changesets.id = checkpoint_changeset_entries.changeset_id
                        WHERE checkpoint_changesets.profile_id = ?
                          AND checkpoint_changeset_entries.after_blob_sha256 IS NOT NULL
                    )
                    SELECT
                        COUNT(*) AS total_blob_count,
                        COALESCE(SUM(CASE WHEN checkpoint_snapshot_blobs.storage_state = 'inline' THEN checkpoint_snapshot_blobs.byte_size ELSE 0 END), 0) AS loose_byte_size,
                        COALESCE(SUM(CASE WHEN checkpoint_snapshot_blobs.storage_state = 'packed' THEN checkpoint_blob_pack_members.compressed_byte_size ELSE 0 END), 0) AS packed_byte_size,
                        COALESCE(SUM(CASE WHEN checkpoint_snapshot_blobs.storage_state = 'inline' THEN 1 ELSE 0 END), 0) AS loose_blob_count,
                        COALESCE(SUM(CASE WHEN checkpoint_snapshot_blobs.storage_state = 'packed' THEN 1 ELSE 0 END), 0) AS packed_blob_count
                    FROM referenced_blobs
                    INNER JOIN checkpoint_snapshot_blobs ON checkpoint_snapshot_blobs.sha256 = referenced_blobs.blob_sha256
                    LEFT JOIN checkpoint_blob_pack_members ON checkpoint_blob_pack_members.blob_sha256 = checkpoint_snapshot_blobs.sha256
                `
            )
            .get(profileId, profileId, profileId) as
            | {
                  total_blob_count: number;
                  loose_byte_size: number;
                  packed_byte_size: number;
                  loose_blob_count: number;
                  packed_blob_count: number;
              }
            | undefined;
        const lastRunRow = sqlite
            .prepare(
                `
                    SELECT
                        id,
                        profile_id,
                        trigger_kind,
                        status,
                        message,
                        blob_count_before,
                        blob_count_after,
                        bytes_before,
                        bytes_after,
                        blobs_compacted,
                        database_reclaimed,
                        started_at,
                        completed_at
                    FROM checkpoint_compaction_runs
                    WHERE profile_id = ?
                    ORDER BY completed_at DESC
                    LIMIT 1
                `
            )
            .get(profileId) as
            | {
                  id: string;
                  profile_id: string;
                  trigger_kind: string;
                  status: string;
                  message: string | null;
                  blob_count_before: number;
                  blob_count_after: number;
                  bytes_before: number;
                  bytes_after: number;
                  blobs_compacted: number;
                  database_reclaimed: number;
                  started_at: string;
                  completed_at: string;
              }
            | undefined;

        const looseReferencedByteSize = statsRow?.loose_byte_size ?? 0;
        const packedReferencedByteSize = statsRow?.packed_byte_size ?? 0;
        const totalReferencedBlobCount = statsRow?.total_blob_count ?? 0;

        return {
            profileId,
            looseReferencedBlobCount: statsRow?.loose_blob_count ?? 0,
            looseReferencedByteSize,
            packedReferencedBlobCount: statsRow?.packed_blob_count ?? 0,
            packedReferencedByteSize,
            totalReferencedBlobCount,
            totalReferencedByteSize: looseReferencedByteSize + packedReferencedByteSize,
            ...(lastRunRow ? { lastCompactionRun: mapCompactionRun(lastRunRow) } : {}),
        };
    }

    listCompactionCandidates(input: {
        profileId: string;
        includeAllAges: boolean;
        maxOriginalByteSize?: number;
        cutoffCreatedAt?: string;
    }): ReferencedInlineBlobCandidate[] {
        const { sqlite } = getPersistence();
        const blobRows = sqlite
            .prepare(
                `
                    WITH referenced_blobs AS (
                        SELECT DISTINCT checkpoint_snapshot_entries.blob_sha256 AS blob_sha256
                        FROM checkpoint_snapshot_entries
                        INNER JOIN checkpoints ON checkpoints.id = checkpoint_snapshot_entries.checkpoint_id
                        WHERE checkpoints.profile_id = ?
                        UNION
                        SELECT DISTINCT checkpoint_changeset_entries.before_blob_sha256 AS blob_sha256
                        FROM checkpoint_changeset_entries
                        INNER JOIN checkpoint_changesets ON checkpoint_changesets.id = checkpoint_changeset_entries.changeset_id
                        WHERE checkpoint_changesets.profile_id = ?
                          AND checkpoint_changeset_entries.before_blob_sha256 IS NOT NULL
                        UNION
                        SELECT DISTINCT checkpoint_changeset_entries.after_blob_sha256 AS blob_sha256
                        FROM checkpoint_changeset_entries
                        INNER JOIN checkpoint_changesets ON checkpoint_changesets.id = checkpoint_changeset_entries.changeset_id
                        WHERE checkpoint_changesets.profile_id = ?
                          AND checkpoint_changeset_entries.after_blob_sha256 IS NOT NULL
                    )
                    SELECT
                        checkpoint_snapshot_blobs.sha256,
                        checkpoint_snapshot_blobs.byte_size,
                        checkpoint_snapshot_blobs.bytes_blob,
                        checkpoint_snapshot_blobs.created_at
                    FROM referenced_blobs
                    INNER JOIN checkpoint_snapshot_blobs ON checkpoint_snapshot_blobs.sha256 = referenced_blobs.blob_sha256
                    WHERE checkpoint_snapshot_blobs.storage_state = 'inline'
                    ORDER BY checkpoint_snapshot_blobs.created_at ASC, checkpoint_snapshot_blobs.sha256 ASC
                `
            )
            .all(input.profileId, input.profileId, input.profileId) as Array<{
            sha256: string;
            byte_size: number;
            bytes_blob: Uint8Array | null;
            created_at: string;
        }>;

        const filteredRows = blobRows.filter(
            (row) => input.includeAllAges || !input.cutoffCreatedAt || row.created_at <= input.cutoffCreatedAt
        );
        const candidates: ReferencedInlineBlobCandidate[] = [];
        let originalByteSizeTotal = 0;

        for (const row of filteredRows) {
            if (!row.bytes_blob) {
                continue;
            }
            if (
                input.maxOriginalByteSize !== undefined &&
                candidates.length > 0 &&
                originalByteSizeTotal + row.byte_size > input.maxOriginalByteSize
            ) {
                break;
            }

            candidates.push({
                sha256: row.sha256,
                byteSize: row.byte_size,
                bytes: row.bytes_blob,
                createdAt: row.created_at,
            });
            originalByteSizeTotal += row.byte_size;
        }

        return candidates;
    }

    async packReferencedBlobs(input: {
        profileId: string;
        triggerKind: CompactionTriggerKind;
        blobs: ReferencedInlineBlobCandidate[];
    }): Promise<{ blobsCompacted: number; bytesBefore: number; bytesAfter: number }> {
        if (input.blobs.length === 0) {
            return {
                blobsCompacted: 0,
                bytesBefore: 0,
                bytesAfter: 0,
            };
        }

        const createdAt = nowIso();
        const packId = `pack_${randomUUID()}`;
        const compressedMembers = input.blobs.map((blob) => {
            const compressedBytes = brotliCompressSync(bufferFromBytes(blob.bytes), {
                params: {
                    [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
                },
            });
            const verifiedBytes = brotliDecompressSync(compressedBytes);
            if (hashBytes(verifiedBytes) !== blob.sha256) {
                throw new Error(`Checkpoint blob ${blob.sha256} failed compaction verification.`);
            }

            return {
                sha256: blob.sha256,
                originalByteSize: blob.byteSize,
                compressedBytes,
            };
        });
        let byteOffset = 0;
        const packBytesChunks: Buffer[] = [];
        const members = compressedMembers.map((member) => {
            const currentOffset = byteOffset;
            byteOffset += member.compressedBytes.byteLength;
            packBytesChunks.push(member.compressedBytes);
            return {
                blobSha256: member.sha256,
                byteOffset: currentOffset,
                compressedByteSize: member.compressedBytes.byteLength,
                originalByteSize: member.originalByteSize,
            };
        });
        const packBytes = Buffer.concat(packBytesChunks);
        const { db } = getPersistence();

        await db.transaction().execute(async (transaction) => {
            await transaction
                .insertInto('checkpoint_blob_packs')
                .values({
                    id: packId,
                    profile_id: input.profileId,
                    trigger_kind: input.triggerKind,
                    compression_kind: 'brotli',
                    blob_count: members.length,
                    original_byte_size: input.blobs.reduce((total, blob) => total + blob.byteSize, 0),
                    packed_byte_size: packBytes.byteLength,
                    pack_bytes_blob: packBytes,
                    created_at: createdAt,
                })
                .execute();

            await transaction
                .insertInto('checkpoint_blob_pack_members')
                .values(
                    members.map((member) => ({
                        blob_sha256: member.blobSha256,
                        pack_id: packId,
                        byte_offset: member.byteOffset,
                        compressed_byte_size: member.compressedByteSize,
                        original_byte_size: member.originalByteSize,
                        compression_kind: 'brotli',
                        created_at: createdAt,
                    }))
                )
                .execute();

            await transaction
                .updateTable('checkpoint_snapshot_blobs')
                .set({
                    storage_state: 'packed',
                    bytes_blob: null,
                    updated_at: createdAt,
                })
                .where(
                    'sha256',
                    'in',
                    input.blobs.map((blob) => blob.sha256)
                )
                .execute();
        });

        return {
            blobsCompacted: input.blobs.length,
            bytesBefore: input.blobs.reduce((total, blob) => total + blob.byteSize, 0),
            bytesAfter: packBytes.byteLength,
        };
    }

    async recordCompactionRun(input: {
        profileId: string;
        triggerKind: CompactionTriggerKind;
        status: 'success' | 'failed' | 'noop';
        message?: string;
        blobCountBefore: number;
        blobCountAfter: number;
        bytesBefore: number;
        bytesAfter: number;
        blobsCompacted: number;
        databaseReclaimed: boolean;
        startedAt: string;
        completedAt: string;
    }): Promise<CheckpointCompactionRunRecord> {
        const { db } = getPersistence();
        const inserted = await db
            .insertInto('checkpoint_compaction_runs')
            .values({
                id: createEntityId('cpr'),
                profile_id: input.profileId,
                trigger_kind: input.triggerKind,
                status: input.status,
                message: input.message ?? null,
                blob_count_before: input.blobCountBefore,
                blob_count_after: input.blobCountAfter,
                bytes_before: input.bytesBefore,
                bytes_after: input.bytesAfter,
                blobs_compacted: input.blobsCompacted,
                database_reclaimed: input.databaseReclaimed ? 1 : 0,
                started_at: input.startedAt,
                completed_at: input.completedAt,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return mapCompactionRun(inserted);
    }
}

export const checkpointSnapshotStore = new CheckpointSnapshotStore();

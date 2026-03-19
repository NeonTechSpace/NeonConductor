import { createHash } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { EntityId } from '@/app/backend/runtime/contracts';

export interface CheckpointSnapshotEntryRecord {
    checkpointId: EntityId<'ckpt'>;
    relativePath: string;
    blobSha256: string;
    byteSize: number;
    bytes: Uint8Array;
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
                        bytes_blob: Buffer.from(file.bytes),
                        created_at: createdAt,
                    })
                    .onConflict((oc) => oc.column('sha256').doNothing())
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
            .innerJoin(
                'checkpoint_snapshot_blobs',
                'checkpoint_snapshot_blobs.sha256',
                'checkpoint_snapshot_entries.blob_sha256'
            )
            .select([
                'checkpoint_snapshot_entries.checkpoint_id as checkpoint_id',
                'checkpoint_snapshot_entries.relative_path as relative_path',
                'checkpoint_snapshot_entries.blob_sha256 as blob_sha256',
                'checkpoint_snapshot_entries.byte_size as byte_size',
                'checkpoint_snapshot_blobs.bytes_blob as bytes_blob',
            ])
            .where('checkpoint_snapshot_entries.checkpoint_id', '=', checkpointId)
            .orderBy('checkpoint_snapshot_entries.relative_path', 'asc')
            .execute();

        return rows.map((row) => ({
            checkpointId: row.checkpoint_id as EntityId<'ckpt'>,
            relativePath: row.relative_path,
            blobSha256: row.blob_sha256,
            byteSize: row.byte_size,
            bytes: row.bytes_blob,
        }));
    }

    async pruneUnreferencedBlobs(): Promise<number> {
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

        return Number(result.changes);
    }
}

export const checkpointSnapshotStore = new CheckpointSnapshotStore();

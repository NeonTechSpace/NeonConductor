import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, getPersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { checkpointChangesetStore, checkpointSnapshotStore, checkpointStore } from '@/app/backend/persistence/stores';
import { compactCheckpointStorage } from '@/app/backend/runtime/services/checkpoint/compaction';
import { createCaller, requireEntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

const profileId = getDefaultProfileId();

function buildFileBytes(index: number, byteSize: number): Uint8Array {
    return Buffer.alloc(byteSize, index % 251);
}

async function createCheckpointFixture(input: { fileCount: number; byteSize: number; includeChangeset?: boolean }) {
    const caller = createCaller();
    const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-compaction-'));
    const threadResult = await caller.conversation.createThread({
        profileId,
        topLevelTab: 'agent',
        scope: 'workspace',
        workspacePath,
        title: 'Compaction Test Thread',
    });
    const threadId = requireEntityId(threadResult.thread.id, 'thr', 'Expected compaction test thread id.');
    const sessionResult = await caller.session.create({
        profileId,
        threadId,
        kind: 'local',
    });
    if (!sessionResult.created) {
        throw new Error(`Expected test session creation success, received "${sessionResult.reason}".`);
    }

    const checkpoint = await checkpointStore.create({
        profileId,
        sessionId: sessionResult.session.id,
        threadId,
        workspaceFingerprint: 'ws_compaction_test',
        executionTargetKey: 'workspace:c:/repo',
        executionTargetKind: 'workspace',
        executionTargetLabel: 'Workspace Root',
        createdByKind: 'system',
        checkpointKind: 'auto',
        snapshotFileCount: input.fileCount,
        topLevelTab: 'agent',
        modeKey: 'code',
        summary: 'Compaction test checkpoint',
    });
    const files = Array.from({ length: input.fileCount }, (_, index) => ({
        relativePath: `file-${String(index)}.txt`,
        bytes: buildFileBytes(index, input.byteSize),
    }));

    await checkpointSnapshotStore.replaceSnapshot({
        checkpointId: checkpoint.id,
        files,
    });

    if (input.includeChangeset) {
        await checkpointChangesetStore.replaceForCheckpoint({
            profileId,
            checkpointId: checkpoint.id,
            sessionId: sessionResult.session.id,
            threadId,
            executionTargetKey: checkpoint.executionTargetKey,
            executionTargetKind: checkpoint.executionTargetKind,
            executionTargetLabel: checkpoint.executionTargetLabel,
            createdByKind: 'system',
            changesetKind: 'run_capture',
            summary: 'Changed one file',
            entries: [
                {
                    relativePath: files[0]?.relativePath ?? 'file-0.txt',
                    changeKind: 'modified',
                    beforeBytes: files[0]?.bytes ?? new Uint8Array(),
                    afterBytes: Buffer.from('after state\n'),
                },
            ],
        });
    }

    return {
        checkpoint,
        files,
    };
}

function ageAllCheckpointBlobs(hours: number): void {
    const agedAt = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { sqlite } = getPersistence();
    sqlite
        .prepare(
            `
                UPDATE checkpoint_snapshot_blobs
                SET created_at = ?, updated_at = ?
            `
        )
        .run(agedAt, agedAt);
}

describe('checkpoint compaction service', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('skips automatic compaction below threshold', async () => {
        await createCheckpointFixture({
            fileCount: 1,
            byteSize: 512,
        });

        const result = await compactCheckpointStorage({
            profileId,
            triggerKind: 'automatic',
            force: false,
        });

        expect(result.run.status).toBe('noop');
        expect(result.storage.looseReferencedBlobCount).toBe(1);
        expect(result.storage.packedReferencedBlobCount).toBe(0);
    });

    it('keeps automatic compaction behind the cold-blob gate and lets manual compaction bypass it', async () => {
        await createCheckpointFixture({
            fileCount: 250,
            byteSize: 256,
        });

        const automaticResult = await compactCheckpointStorage({
            profileId,
            triggerKind: 'automatic',
            force: false,
        });
        expect(automaticResult.run.status).toBe('noop');
        expect(automaticResult.run.message).toContain('no cold loose blobs were eligible');
        expect(automaticResult.storage.looseReferencedBlobCount).toBe(250);
        expect(automaticResult.storage.packedReferencedBlobCount).toBe(0);

        const manualResult = await compactCheckpointStorage({
            profileId,
            triggerKind: 'manual',
            force: true,
        });
        expect(manualResult.run.status).toBe('success');
        expect(manualResult.run.blobsCompacted).toBe(250);
        expect(manualResult.storage.looseReferencedBlobCount).toBe(0);
        expect(manualResult.storage.packedReferencedBlobCount).toBe(250);
    });

    it('caps each automatic run to 32 MiB of original loose blob payloads', async () => {
        await createCheckpointFixture({
            fileCount: 65,
            byteSize: 1024 * 1024,
        });
        ageAllCheckpointBlobs(2);

        const result = await compactCheckpointStorage({
            profileId,
            triggerKind: 'automatic',
            force: false,
        });

        expect(result.run.status).toBe('success');
        expect(result.run.bytesBefore).toBe(32 * 1024 * 1024);
        expect(result.run.blobsCompacted).toBe(32);
        expect(result.storage.packedReferencedBlobCount).toBe(32);
        expect(result.storage.looseReferencedBlobCount).toBe(33);
    }, 30_000);

    it('keeps packed blobs readable for snapshot restore and changeset revert paths and ignores unreferenced blobs', async () => {
        const { checkpoint, files } = await createCheckpointFixture({
            fileCount: 250,
            byteSize: 512,
            includeChangeset: true,
        });
        const orphanBytes = Buffer.from('orphan blob\n');
        const orphanSha = createHash('sha256').update(orphanBytes).digest('hex');
        const { sqlite } = getPersistence();
        const createdAt = new Date().toISOString();

        sqlite
            .prepare(
                `
                    INSERT INTO checkpoint_snapshot_blobs
                        (sha256, byte_size, storage_state, bytes_blob, created_at, updated_at)
                    VALUES (?, ?, 'inline', ?, ?, ?)
                `
            )
            .run(orphanSha, orphanBytes.byteLength, orphanBytes, createdAt, createdAt);

        const result = await compactCheckpointStorage({
            profileId,
            triggerKind: 'manual',
            force: true,
        });

        expect(result.run.status).toBe('success');

        const snapshotEntries = await checkpointSnapshotStore.listSnapshotEntries(checkpoint.id);
        expect(snapshotEntries).toHaveLength(250);
        expect(
            Buffer.from(snapshotEntries[0]?.bytes ?? new Uint8Array()).equals(Buffer.from(files[0]?.bytes ?? []))
        ).toBe(true);

        const changeset = await checkpointChangesetStore.getByCheckpointId(profileId, checkpoint.id);
        expect(changeset).not.toBeNull();
        expect(
            Buffer.from(changeset?.entries[0]?.beforeBytes ?? new Uint8Array()).equals(
                Buffer.from(files[0]?.bytes ?? [])
            )
        ).toBe(true);
        expect(Buffer.from(changeset?.entries[0]?.afterBytes ?? new Uint8Array()).toString('utf8')).toBe(
            'after state\n'
        );

        const orphanRow = sqlite
            .prepare(
                `
                    SELECT storage_state, bytes_blob
                    FROM checkpoint_snapshot_blobs
                    WHERE sha256 = ?
                `
            )
            .get(orphanSha) as { storage_state: 'inline' | 'packed'; bytes_blob: Uint8Array | null } | undefined;

        expect(orphanRow?.storage_state).toBe('inline');
        expect(orphanRow?.bytes_blob).not.toBeNull();
    });
});

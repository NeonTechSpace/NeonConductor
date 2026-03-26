import { getPersistence } from '@/app/backend/persistence/db';
import { checkpointSnapshotStore } from '@/app/backend/persistence/stores';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { CheckpointCompactionRunRecord, CheckpointStorageSummary } from '@/app/backend/persistence/types';

const AUTO_COMPACTION_MIN_BYTE_SIZE = 64 * 1024 * 1024;
const AUTO_COMPACTION_MIN_BLOB_COUNT = 250;
const AUTO_COMPACTION_MAX_BYTE_SIZE = 32 * 1024 * 1024;
const AUTO_COMPACTION_MIN_AGE_MS = 60 * 60 * 1000;

type CompactionTriggerKind = 'automatic' | 'manual';

export interface CheckpointCompactionResult {
    run: CheckpointCompactionRunRecord;
    storage: CheckpointStorageSummary;
}

export async function getCheckpointStorageSummary(profileId: string): Promise<CheckpointStorageSummary> {
    return Promise.resolve(checkpointSnapshotStore.getStorageSummary(profileId));
}

function subtractMs(isoTimestamp: string, ms: number): string {
    return new Date(Date.parse(isoTimestamp) - ms).toISOString();
}

function reclaimDatabaseSpace(): Promise<boolean> {
    const { sqlite } = getPersistence();
    sqlite.exec('VACUUM');
    return Promise.resolve(true);
}

export async function compactCheckpointStorage(input: {
    profileId: string;
    triggerKind: CompactionTriggerKind;
    force: boolean;
}): Promise<CheckpointCompactionResult> {
    const startedAt = nowIso();
    const beforeStorage = checkpointSnapshotStore.getStorageSummary(input.profileId);
    const isAutomaticThresholdMet =
        beforeStorage.looseReferencedByteSize >= AUTO_COMPACTION_MIN_BYTE_SIZE ||
        beforeStorage.looseReferencedBlobCount >= AUTO_COMPACTION_MIN_BLOB_COUNT;

    if (!input.force && !isAutomaticThresholdMet) {
        const completedAt = nowIso();
        return {
            run: await checkpointSnapshotStore.recordCompactionRun({
                profileId: input.profileId,
                triggerKind: input.triggerKind,
                status: 'noop',
                message: 'Automatic compaction skipped because loose storage is below threshold.',
                blobCountBefore: beforeStorage.totalReferencedBlobCount,
                blobCountAfter: beforeStorage.totalReferencedBlobCount,
                bytesBefore: beforeStorage.totalReferencedByteSize,
                bytesAfter: beforeStorage.totalReferencedByteSize,
                blobsCompacted: 0,
                databaseReclaimed: false,
                startedAt,
                completedAt,
            }),
            storage: checkpointSnapshotStore.getStorageSummary(input.profileId),
        };
    }

    const candidates = checkpointSnapshotStore.listCompactionCandidates({
        profileId: input.profileId,
        includeAllAges: input.force,
        ...(input.force ? {} : { cutoffCreatedAt: subtractMs(startedAt, AUTO_COMPACTION_MIN_AGE_MS) }),
        ...(input.force ? {} : { maxOriginalByteSize: AUTO_COMPACTION_MAX_BYTE_SIZE }),
    });
    if (candidates.length === 0) {
        const completedAt = nowIso();
        return {
            run: await checkpointSnapshotStore.recordCompactionRun({
                profileId: input.profileId,
                triggerKind: input.triggerKind,
                status: 'noop',
                message: input.force
                    ? 'No referenced loose blobs were available to compact.'
                    : 'Automatic compaction skipped because no cold loose blobs were eligible.',
                blobCountBefore: beforeStorage.totalReferencedBlobCount,
                blobCountAfter: beforeStorage.totalReferencedBlobCount,
                bytesBefore: beforeStorage.totalReferencedByteSize,
                bytesAfter: beforeStorage.totalReferencedByteSize,
                blobsCompacted: 0,
                databaseReclaimed: false,
                startedAt,
                completedAt,
            }),
            storage: checkpointSnapshotStore.getStorageSummary(input.profileId),
        };
    }

    try {
        const packed = await checkpointSnapshotStore.packReferencedBlobs({
            profileId: input.profileId,
            triggerKind: input.triggerKind,
            blobs: candidates,
        });
        const databaseReclaimed = input.force ? await reclaimDatabaseSpace() : false;
        const completedAt = nowIso();
        return {
            run: await checkpointSnapshotStore.recordCompactionRun({
                profileId: input.profileId,
                triggerKind: input.triggerKind,
                status: 'success',
                message: `Compacted ${String(packed.blobsCompacted)} checkpoint blobs into packed storage.`,
                blobCountBefore: beforeStorage.totalReferencedBlobCount,
                blobCountAfter: beforeStorage.totalReferencedBlobCount,
                bytesBefore: packed.bytesBefore,
                bytesAfter: packed.bytesAfter,
                blobsCompacted: packed.blobsCompacted,
                databaseReclaimed,
                startedAt,
                completedAt,
            }),
            storage: checkpointSnapshotStore.getStorageSummary(input.profileId),
        };
    } catch (error) {
        const completedAt = nowIso();
        const message = error instanceof Error ? error.message : 'Checkpoint compaction failed.';
        return {
            run: await checkpointSnapshotStore.recordCompactionRun({
                profileId: input.profileId,
                triggerKind: input.triggerKind,
                status: 'failed',
                message,
                blobCountBefore: beforeStorage.totalReferencedBlobCount,
                blobCountAfter: beforeStorage.totalReferencedBlobCount,
                bytesBefore: beforeStorage.totalReferencedByteSize,
                bytesAfter: beforeStorage.totalReferencedByteSize,
                blobsCompacted: 0,
                databaseReclaimed: false,
                startedAt,
                completedAt,
            }),
            storage: checkpointSnapshotStore.getStorageSummary(input.profileId),
        };
    }
}

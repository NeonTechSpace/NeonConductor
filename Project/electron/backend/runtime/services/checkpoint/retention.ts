import type { CheckpointRecord } from '@/app/backend/persistence/types';
import type { CheckpointCleanupCandidate, CheckpointCleanupPreview, CheckpointRetentionDisposition } from '@/app/backend/runtime/contracts';

export const CHECKPOINT_RETENTION_POLICY = {
    protectedRecentPerSession: 20,
    protectedRecentPerExecutionTarget: 5,
} as const;

function compareCreatedAtDescending(left: CheckpointRecord, right: CheckpointRecord): number {
    return right.createdAt.localeCompare(left.createdAt);
}

function collectProtectedIds(
    checkpoints: CheckpointRecord[],
    groupKey: (checkpoint: CheckpointRecord) => string,
    limit: number
): Set<CheckpointRecord['id']> {
    const protectedIds = new Set<CheckpointRecord['id']>();
    const groupedCheckpoints = new Map<string, CheckpointRecord[]>();

    for (const checkpoint of checkpoints) {
        if (checkpoint.checkpointKind === 'named') {
            continue;
        }

        const key = groupKey(checkpoint);
        const existingCheckpoints = groupedCheckpoints.get(key) ?? [];
        existingCheckpoints.push(checkpoint);
        groupedCheckpoints.set(key, existingCheckpoints);
    }

    for (const grouped of groupedCheckpoints.values()) {
        grouped.sort(compareCreatedAtDescending);
        for (const checkpoint of grouped.slice(0, limit)) {
            protectedIds.add(checkpoint.id);
        }
    }

    return protectedIds;
}

export function classifyCheckpointRetention(input: {
    sessionCheckpoints: CheckpointRecord[];
    profileCheckpoints: CheckpointRecord[];
}): Map<CheckpointRecord['id'], CheckpointRetentionDisposition> {
    const protectedBySessionIds = collectProtectedIds(
        input.profileCheckpoints,
        (checkpoint) => checkpoint.sessionId,
        CHECKPOINT_RETENTION_POLICY.protectedRecentPerSession
    );
    const protectedByExecutionTargetIds = collectProtectedIds(
        input.profileCheckpoints,
        (checkpoint) => checkpoint.executionTargetKey,
        CHECKPOINT_RETENTION_POLICY.protectedRecentPerExecutionTarget
    );
    const retentionDispositions = new Map<CheckpointRecord['id'], CheckpointRetentionDisposition>();

    for (const checkpoint of input.sessionCheckpoints) {
        if (checkpoint.checkpointKind === 'named') {
            retentionDispositions.set(checkpoint.id, 'milestone');
            continue;
        }

        if (protectedBySessionIds.has(checkpoint.id) || protectedByExecutionTargetIds.has(checkpoint.id)) {
            retentionDispositions.set(checkpoint.id, 'protected_recent');
            continue;
        }

        retentionDispositions.set(checkpoint.id, 'eligible_for_cleanup');
    }

    return retentionDispositions;
}

export function applyRetentionDispositions(
    checkpoints: CheckpointRecord[],
    retentionDispositions: Map<CheckpointRecord['id'], CheckpointRetentionDisposition>
): CheckpointRecord[] {
    return checkpoints.map((checkpoint) => {
        const retentionDisposition = retentionDispositions.get(checkpoint.id);
        return retentionDisposition ? { ...checkpoint, retentionDisposition } : checkpoint;
    });
}

export function buildCleanupPreview(input: {
    sessionId: CheckpointRecord['sessionId'];
    checkpoints: CheckpointRecord[];
    retentionDispositions: Map<CheckpointRecord['id'], CheckpointRetentionDisposition>;
    changesetCounts: Map<CheckpointRecord['id'], number>;
}): CheckpointCleanupPreview {
    let milestoneCount = 0;
    let protectedRecentCount = 0;
    const candidates: CheckpointCleanupCandidate[] = [];

    for (const checkpoint of input.checkpoints) {
        const retentionDisposition = input.retentionDispositions.get(checkpoint.id);
        if (retentionDisposition === 'milestone') {
            milestoneCount += 1;
            continue;
        }

        if (retentionDisposition === 'protected_recent') {
            protectedRecentCount += 1;
            continue;
        }

        candidates.push({
            checkpointId: checkpoint.id,
            checkpointKind: checkpoint.checkpointKind,
            ...(checkpoint.milestoneTitle ? { milestoneTitle: checkpoint.milestoneTitle } : {}),
            summary: checkpoint.summary,
            snapshotFileCount: checkpoint.snapshotFileCount,
            changesetChangeCount: input.changesetCounts.get(checkpoint.id) ?? 0,
            createdAt: checkpoint.createdAt,
        });
    }

    return {
        sessionId: input.sessionId,
        retentionPolicy: {
            protectedRecentPerSession: CHECKPOINT_RETENTION_POLICY.protectedRecentPerSession,
            protectedRecentPerExecutionTarget: CHECKPOINT_RETENTION_POLICY.protectedRecentPerExecutionTarget,
        },
        milestoneCount,
        protectedRecentCount,
        eligibleCount: candidates.length,
        candidates,
    };
}

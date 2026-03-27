import type { CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';

import type { CheckpointRollbackPreview, CheckpointStorageSummary } from '@/shared/contracts';

export function resolveSelectedDiffPath(input: {
    selectedDiff: DiffRecord | undefined;
    preferredPath: string | undefined;
}): string | undefined {
    if (input.selectedDiff?.artifact.kind !== 'git') {
        return undefined;
    }

    if (input.preferredPath && input.selectedDiff.artifact.files.some((file) => file.path === input.preferredPath)) {
        return input.preferredPath;
    }

    return input.selectedDiff.artifact.files[0]?.path;
}

export function buildRollbackWarningLines(
    preview: CheckpointRollbackPreview | undefined
): { tone: 'isolated' | 'warning'; lines: string[] } | null {
    if (!preview) {
        return null;
    }

    const lines: string[] = [];
    if (preview.isSharedTarget) {
        lines.push('This target is shared. Rolling back here will also affect other chats on the same resolved path.');
    } else {
        lines.push('This checkpoint targets an isolated execution path.');
    }

    if (preview.hasLaterForeignChanges) {
        lines.push('Later checkpoints from other chats exist on this same target. This rollback is high risk.');
    }

    if (preview.hasChangeset && preview.canRevertSafely && preview.recommendedAction === 'revert_changeset') {
        lines.push('Safer action available: revert only this run changeset instead of restoring the whole target.');
    }

    if (preview.hasChangeset && !preview.canRevertSafely) {
        if (preview.revertBlockedReason === 'changeset_empty') {
            lines.push('This checkpoint recorded no file changes, so there is nothing to revert.');
        } else if (preview.revertBlockedReason === 'target_drifted') {
            lines.push(
                'The live files have drifted since this checkpoint. Revert changeset is blocked to avoid partial undo.'
            );
        } else if (preview.revertBlockedReason === 'workspace_unresolved') {
            lines.push('The current execution target could not be resolved, so revert changeset is unavailable.');
        } else {
            lines.push('Revert changeset is unavailable because the recorded state could not be validated safely.');
        }
    }

    if (preview.affectedSessions.length > 0) {
        lines.push(`Affected chats: ${preview.affectedSessions.map((session) => session.threadTitle).join(', ')}`);
    }

    return {
        tone: preview.isSharedTarget || preview.hasLaterForeignChanges ? 'warning' : 'isolated',
        lines,
    };
}

export function filterVisibleCheckpoints(checkpoints: CheckpointRecord[], milestonesOnly: boolean): CheckpointRecord[] {
    if (!milestonesOnly) {
        return checkpoints;
    }

    return checkpoints.filter((checkpoint) => checkpoint.checkpointKind === 'named');
}

export function describeRetentionDisposition(
    retentionDisposition: CheckpointRecord['retentionDisposition']
): string | null {
    if (retentionDisposition === 'milestone') {
        return 'Milestone';
    }

    if (retentionDisposition === 'protected_recent') {
        return 'Protected recent';
    }

    if (retentionDisposition === 'eligible_for_cleanup') {
        return 'Cleanup eligible';
    }

    return null;
}

export function formatCheckpointByteSize(byteSize: number): string {
    if (byteSize < 1024) {
        return `${String(byteSize)} B`;
    }

    if (byteSize < 1024 * 1024) {
        return `${(byteSize / 1024).toFixed(1)} KiB`;
    }

    return `${(byteSize / (1024 * 1024)).toFixed(1)} MiB`;
}

export function describeCompactionRun(run: CheckpointStorageSummary['lastCompactionRun']): string {
    if (!run) {
        return 'No compaction run has been recorded yet.';
    }

    const summary =
        run.status === 'failed'
            ? `Last ${run.triggerKind} compaction failed`
            : run.status === 'noop'
              ? `Last ${run.triggerKind} compaction made no changes`
              : `Last ${run.triggerKind} compaction packed ${String(run.blobsCompacted)} blobs`;

    return run.message ? `${summary}. ${run.message}` : summary;
}

export function describeRollbackFeedback(input: { rolledBack: boolean; message?: string }): string {
    if (!input.rolledBack) {
        return input.message ?? 'Rollback could not be completed.';
    }

    return 'Checkpoint rollback completed.';
}

export function describeRevertChangesetFeedback(input: { reverted: boolean; message?: string }): string {
    if (!input.reverted) {
        return input.message ?? 'Changeset revert could not be completed.';
    }

    return 'Changeset revert completed.';
}

export function describeMilestoneSaveFeedback(input: { created: boolean }): string {
    return input.created ? 'Milestone saved.' : 'Milestone could not be saved.';
}

export function describeMilestonePromoteFeedback(input: { promoted: boolean }): string {
    return input.promoted ? 'Checkpoint promoted to milestone.' : 'Checkpoint could not be promoted to a milestone.';
}

export function describeMilestoneRenameFeedback(input: { renamed: boolean }): string {
    return input.renamed ? 'Milestone renamed.' : 'Milestone could not be renamed.';
}

export function describeMilestoneDeleteFeedback(input: { deleted: boolean }): string {
    return input.deleted ? 'Milestone deleted.' : 'Milestone could not be deleted.';
}

export function describeCleanupFeedback(input: {
    cleanedUp: boolean;
    message?: string;
    deletedCount?: number;
    prunedBlobCount?: number;
}): string {
    if (!input.cleanedUp) {
        return input.message ?? 'Cleanup requires explicit confirmation.';
    }

    return `Cleanup removed ${String(input.deletedCount ?? 0)} checkpoints and pruned ${String(input.prunedBlobCount ?? 0)} snapshot blobs.`;
}

export function describeCompactionFeedback(input: {
    compacted: boolean;
    message?: string;
    run?: {
        status: 'success' | 'failed' | 'noop';
        message?: string;
    };
}): string {
    if (!input.compacted) {
        return input.message ?? 'Compaction requires explicit confirmation.';
    }

    if (input.run?.status === 'failed') {
        return input.run.message ?? 'Checkpoint compaction failed.';
    }

    if (input.run?.status === 'noop') {
        return input.run.message ?? 'No checkpoint blobs were eligible for compaction.';
    }

    return input.run?.message ?? 'Checkpoint storage compaction completed.';
}

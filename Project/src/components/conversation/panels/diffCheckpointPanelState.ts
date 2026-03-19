import type { CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';
import type { CheckpointRollbackPreview } from '@/app/backend/runtime/contracts';

export function resolveSelectedDiffPath(input: {
    selectedDiff: DiffRecord | undefined;
    preferredPath: string | undefined;
}): string | undefined {
    if (input.selectedDiff?.artifact.kind !== 'git') {
        return undefined;
    }

    if (
        input.preferredPath &&
        input.selectedDiff.artifact.files.some((file) => file.path === input.preferredPath)
    ) {
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
            lines.push('The live files have drifted since this checkpoint. Revert changeset is blocked to avoid partial undo.');
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

export function filterVisibleCheckpoints(
    checkpoints: CheckpointRecord[],
    milestonesOnly: boolean
): CheckpointRecord[] {
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

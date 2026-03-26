import {
    checkpointChangesetStore,
    checkpointSnapshotStore,
    checkpointStore,
    runStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import type { CheckpointChangesetRecord, CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';
import type {
    CheckpointCleanupApplyInput,
    CheckpointCleanupApplyResult,
    CheckpointCleanupPreview,
    CheckpointCleanupPreviewInput,
    CheckpointCreateInput,
    CheckpointDeleteMilestoneInput,
    CheckpointForceCompactInput,
    CheckpointForceCompactResult,
    CheckpointListResult,
    CheckpointPromoteMilestoneInput,
    CheckpointRevertChangesetInput,
    CheckpointRevertChangesetResult,
    CheckpointRenameMilestoneInput,
    CheckpointRollbackInput,
    CheckpointRollbackPreview,
    CheckpointRollbackPreviewInput,
    CheckpointRollbackResult,
    ResolvedWorkspaceContext,
} from '@/app/backend/runtime/contracts';
import { isEntityId } from '@/app/backend/runtime/contracts';
import {
    buildSnapshotIndexFromCapture,
    buildSnapshotIndexFromEntries,
    deriveChangesetFromSnapshots,
    evaluateRevertApplicability,
} from '@/app/backend/runtime/services/checkpoint/changeset';
import {
    compactCheckpointStorage,
    getCheckpointStorageSummary,
} from '@/app/backend/runtime/services/checkpoint/compaction';
import { resolveCheckpointExecutionTarget } from '@/app/backend/runtime/services/checkpoint/executionTarget';
import {
    buildCheckpointListResult,
    buildRollbackPreview,
    captureRunChangeset,
    captureRunDiffArtifact,
    checkpointSummary,
    createNativeCheckpointForResolvedTarget,
    isMutatingCheckpointMode,
    loadRetentionState,
    mapCompactionRunSummary,
    mapRestoreFailureReason,
    mapRevertFailureReason,
    mapChangesetRecord,
    revertSafetyCheckpointSummary,
    rollbackSafetyCheckpointSummary,
} from '@/app/backend/runtime/services/checkpoint/internals';
import {
    captureExecutionTargetSnapshot,
    restoreExecutionTargetSnapshot,
} from '@/app/backend/runtime/services/checkpoint/nativeSnapshot';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

type CheckpointCreateResult = {
    created: boolean;
    reason?: 'not_found' | 'unsupported_run';
    diff?: DiffRecord;
    checkpoint?: CheckpointRecord;
};
type CheckpointSummary = NonNullable<CheckpointRollbackResult['checkpoint']>;

export async function ensureCheckpointForRun(input: {
    profileId: string;
    runId: NonNullable<CheckpointRecord['runId']>;
    sessionId: CheckpointRecord['sessionId'];
    threadId: CheckpointRecord['threadId'];
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    workspaceContext: ResolvedWorkspaceContext;
}): Promise<OperationalResult<CheckpointRecord | null>> {
    if (!isMutatingCheckpointMode(input.topLevelTab, input.modeKey)) {
        return okOp(null);
    }

    if (!resolveCheckpointExecutionTarget(input.workspaceContext)) {
        return errOp(
            'checkpoint_execution_target_unresolved',
            'Mutating run checkpoint capture requires a resolved execution target.'
        );
    }

    return createNativeCheckpointForResolvedTarget({
        profileId: input.profileId,
        sessionId: input.sessionId,
        threadId: input.threadId,
        runId: input.runId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        workspaceContext: input.workspaceContext,
        createdByKind: 'system',
        checkpointKind: 'auto',
    });
}

export async function listCheckpoints(input: {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
}): Promise<CheckpointListResult> {
    return buildCheckpointListResult(input);
}

export async function createCheckpoint(input: CheckpointCreateInput): Promise<CheckpointCreateResult> {
    const run = await runStore.getById(input.runId);
    if (!run || run.profileId !== input.profileId) {
        return {
            created: false,
            reason: 'not_found',
        };
    }

    const sessionThread = await threadStore.getBySessionId(input.profileId, run.sessionId);
    if (!sessionThread) {
        return {
            created: false,
            reason: 'not_found',
        };
    }

    const modeKey =
        sessionThread.thread.topLevelTab === 'agent'
            ? 'code'
            : sessionThread.thread.topLevelTab === 'orchestrator'
              ? 'orchestrate'
              : '';
    if (!modeKey || !isMutatingCheckpointMode(sessionThread.thread.topLevelTab, modeKey)) {
        return {
            created: false,
            reason: 'unsupported_run',
        };
    }

    const existingCheckpoint = await checkpointStore.getByRunId(input.profileId, run.id);
    if (existingCheckpoint) {
        const workspaceContext = await workspaceContextService.resolveForSession({
            profileId: input.profileId,
            sessionId: run.sessionId,
            allowLazySandboxCreation: false,
        });
        const checkpoint =
            existingCheckpoint.checkpointKind === 'named'
                ? await checkpointStore.renameMilestone({
                      profileId: input.profileId,
                      checkpointId: existingCheckpoint.id,
                      milestoneTitle: input.milestoneTitle,
                  })
                : await checkpointStore.updateMilestone({
                      profileId: input.profileId,
                      checkpointId: existingCheckpoint.id,
                      milestoneTitle: input.milestoneTitle,
                  });
        const diffResult = await captureRunDiffArtifact({
            profileId: input.profileId,
            sessionId: run.sessionId,
            runId: run.id,
            topLevelTab: sessionThread.thread.topLevelTab,
            modeKey,
            workspaceContext: workspaceContext ?? { kind: 'detached' },
        });

        return {
            created: Boolean(checkpoint),
            ...(diffResult?.diff ? { diff: diffResult.diff } : {}),
            checkpoint: checkpoint ?? diffResult?.checkpoint ?? existingCheckpoint,
        };
    }

    const workspaceContext = await workspaceContextService.resolveForSession({
        profileId: input.profileId,
        sessionId: run.sessionId,
        allowLazySandboxCreation: false,
    });
    if (!workspaceContext || !resolveCheckpointExecutionTarget(workspaceContext)) {
        return {
            created: false,
            reason: 'unsupported_run',
        };
    }
    if (!isEntityId(sessionThread.thread.id, 'thr')) {
        return {
            created: false,
            reason: 'not_found',
        };
    }

    const checkpointResult = await createNativeCheckpointForResolvedTarget({
        profileId: input.profileId,
        sessionId: run.sessionId,
        threadId: sessionThread.thread.id,
        runId: run.id,
        topLevelTab: sessionThread.thread.topLevelTab,
        modeKey,
        workspaceContext,
        createdByKind: 'user',
        checkpointKind: 'named',
        milestoneTitle: input.milestoneTitle,
        summary: input.milestoneTitle,
    });
    if (checkpointResult.isErr()) {
        return {
            created: false,
        };
    }
    const checkpoint = checkpointResult.value;

    const diffResult = await captureRunDiffArtifact({
        profileId: input.profileId,
        sessionId: run.sessionId,
        runId: run.id,
        topLevelTab: sessionThread.thread.topLevelTab,
        modeKey,
        workspaceContext,
    });

    return {
        created: true,
        ...(diffResult?.diff ? { diff: diffResult.diff } : {}),
        checkpoint: diffResult?.checkpoint ?? checkpoint,
    };
}

export async function promoteCheckpointToMilestone(input: CheckpointPromoteMilestoneInput): Promise<{
    promoted: boolean;
    reason?: 'not_found';
    checkpoint?: CheckpointRecord;
}> {
    const checkpoint = await checkpointStore.updateMilestone(input);
    if (!checkpoint) {
        return {
            promoted: false,
            reason: 'not_found',
        };
    }

    return {
        promoted: true,
        checkpoint,
    };
}

export async function renameCheckpointMilestone(input: CheckpointRenameMilestoneInput): Promise<{
    renamed: boolean;
    reason?: 'not_found';
    checkpoint?: CheckpointRecord;
}> {
    const checkpoint = await checkpointStore.renameMilestone(input);
    if (!checkpoint) {
        return {
            renamed: false,
            reason: 'not_found',
        };
    }

    return {
        renamed: true,
        checkpoint,
    };
}

export async function deleteCheckpointMilestone(input: CheckpointDeleteMilestoneInput): Promise<{
    deleted: boolean;
    reason?: 'confirmation_required' | 'not_found' | 'not_milestone';
    prunedBlobCount?: number;
    checkpoint?: CheckpointSummary;
}> {
    const checkpoint = await checkpointStore.getById(input.profileId, input.checkpointId);
    if (!checkpoint) {
        return {
            deleted: false,
            reason: 'not_found',
        };
    }

    if (checkpoint.checkpointKind !== 'named') {
        return {
            deleted: false,
            reason: 'not_milestone',
        };
    }

    if (!input.confirm) {
        return {
            deleted: false,
            reason: 'confirmation_required',
        };
    }

    const deleted = await checkpointStore.deleteById(input.profileId, input.checkpointId);
    const prunedBlobCount = deleted ? checkpointSnapshotStore.pruneUnreferencedBlobs() : 0;

    return {
        deleted,
        ...(deleted ? { checkpoint: checkpointSummary(checkpoint) } : {}),
        ...(deleted ? { prunedBlobCount } : {}),
    };
}

export async function previewCheckpointCleanup(
    input: CheckpointCleanupPreviewInput
): Promise<CheckpointCleanupPreview> {
    const retentionState = await loadRetentionState(input);
    return retentionState.preview;
}

export async function applyCheckpointCleanup(
    input: CheckpointCleanupApplyInput
): Promise<CheckpointCleanupApplyResult> {
    const retentionState = await loadRetentionState(input);
    if (!input.confirm) {
        return {
            cleanedUp: false,
            reason: 'confirmation_required',
            message: 'Checkpoint cleanup requires explicit confirmation.',
            preview: retentionState.preview,
        };
    }

    const deletedCheckpointIds = await checkpointStore.deleteByIds(
        input.profileId,
        retentionState.preview.candidates.map((candidate) => candidate.checkpointId)
    );
    const prunedBlobCount = checkpointSnapshotStore.pruneUnreferencedBlobs();
    await compactCheckpointStorage({
        profileId: input.profileId,
        triggerKind: 'automatic',
        force: false,
    });

    return {
        cleanedUp: true,
        preview: retentionState.preview,
        deletedCheckpointIds,
        deletedCount: deletedCheckpointIds.length,
        prunedBlobCount,
    };
}

export async function forceCompactCheckpointStorage(
    input: CheckpointForceCompactInput
): Promise<CheckpointForceCompactResult> {
    if (!input.confirm) {
        const storage = await getCheckpointStorageSummary(input.profileId);
        return {
            compacted: false,
            reason: 'confirmation_required',
            message: 'Checkpoint compaction requires explicit confirmation.',
            storage: {
                looseReferencedBlobCount: storage.looseReferencedBlobCount,
                looseReferencedByteSize: storage.looseReferencedByteSize,
                packedReferencedBlobCount: storage.packedReferencedBlobCount,
                packedReferencedByteSize: storage.packedReferencedByteSize,
                totalReferencedBlobCount: storage.totalReferencedBlobCount,
                totalReferencedByteSize: storage.totalReferencedByteSize,
                ...(storage.lastCompactionRun
                    ? { lastCompactionRun: mapCompactionRunSummary(storage.lastCompactionRun) }
                    : {}),
            },
        };
    }

    const result = await compactCheckpointStorage({
        profileId: input.profileId,
        triggerKind: 'manual',
        force: true,
    });

    return {
        compacted: result.run.status !== 'failed',
        ...(result.run.message ? { message: result.run.message } : {}),
        run: mapCompactionRunSummary(result.run),
        storage: {
            looseReferencedBlobCount: result.storage.looseReferencedBlobCount,
            looseReferencedByteSize: result.storage.looseReferencedByteSize,
            packedReferencedBlobCount: result.storage.packedReferencedBlobCount,
            packedReferencedByteSize: result.storage.packedReferencedByteSize,
            totalReferencedBlobCount: result.storage.totalReferencedBlobCount,
            totalReferencedByteSize: result.storage.totalReferencedByteSize,
            ...(result.storage.lastCompactionRun
                ? { lastCompactionRun: mapCompactionRunSummary(result.storage.lastCompactionRun) }
                : {}),
        },
    };
}

export async function captureCheckpointDiffForRun(input: {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
    runId: NonNullable<CheckpointRecord['runId']>;
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    workspaceContext: ResolvedWorkspaceContext;
}): Promise<{
    diff?: DiffRecord;
    checkpoint?: CheckpointRecord;
    changeset?: CheckpointChangesetRecord;
} | null> {
    if (!isMutatingCheckpointMode(input.topLevelTab, input.modeKey)) {
        return null;
    }

    const [diffResult, changeset] = await Promise.all([
        captureRunDiffArtifact(input),
        captureRunChangeset({
            profileId: input.profileId,
            runId: input.runId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            workspaceContext: input.workspaceContext,
        }),
    ]);

    if (!diffResult && !changeset) {
        return null;
    }

    return {
        ...(diffResult?.diff ? { diff: diffResult.diff } : {}),
        ...(diffResult?.checkpoint ? { checkpoint: diffResult.checkpoint } : {}),
        ...(changeset ? { changeset } : {}),
    };
}

export async function getRollbackPreview(
    input: CheckpointRollbackPreviewInput
): Promise<{ found: false } | { found: true; preview: CheckpointRollbackPreview }> {
    const checkpoint = await checkpointStore.getById(input.profileId, input.checkpointId);
    if (!checkpoint) {
        return {
            found: false,
        };
    }

    return {
        found: true,
        preview: await buildRollbackPreview({
            profileId: input.profileId,
            checkpoint,
        }),
    };
}

export async function rollbackCheckpoint(input: CheckpointRollbackInput): Promise<CheckpointRollbackResult> {
    const checkpoint = await checkpointStore.getById(input.profileId, input.checkpointId);
    if (!checkpoint) {
        return {
            rolledBack: false,
            reason: 'not_found',
        };
    }

    const preview = await buildRollbackPreview({
        profileId: input.profileId,
        checkpoint,
    });
    if (!input.confirm) {
        return {
            rolledBack: false,
            reason: 'confirmation_required',
            message: 'Checkpoint rollback requires explicit confirmation.',
            preview,
        };
    }

    const workspaceContext = await workspaceContextService.resolveExplicit({
        profileId: input.profileId,
        workspaceFingerprint: checkpoint.workspaceFingerprint,
        ...(checkpoint.sandboxId ? { sandboxId: checkpoint.sandboxId } : {}),
    });
    const executionTarget = resolveCheckpointExecutionTarget(workspaceContext);
    if (!executionTarget || executionTarget.executionTargetKey !== checkpoint.executionTargetKey) {
        return {
            rolledBack: false,
            reason: 'workspace_unresolved',
            message: 'Workspace root could not be resolved for this checkpoint.',
            preview,
        };
    }

    const safetyCheckpointResult = await createNativeCheckpointForResolvedTarget({
        profileId: input.profileId,
        sessionId: checkpoint.sessionId,
        threadId: checkpoint.threadId,
        topLevelTab: checkpoint.topLevelTab,
        modeKey: checkpoint.modeKey,
        workspaceContext,
        createdByKind: 'system',
        checkpointKind: 'safety',
        summary: `Safety checkpoint before restoring ${checkpoint.id}`,
    });
    if (safetyCheckpointResult.isErr()) {
        return {
            rolledBack: false,
            reason:
                safetyCheckpointResult.error.code === 'checkpoint_execution_target_unresolved'
                    ? 'workspace_unresolved'
                    : 'snapshot_invalid',
            message: safetyCheckpointResult.error.message,
            preview,
        };
    }
    const safetyCheckpoint = safetyCheckpointResult.value;

    const snapshotEntries = await checkpointSnapshotStore.listSnapshotEntries(checkpoint.id);
    if (snapshotEntries.length === 0 && checkpoint.snapshotFileCount > 0) {
        return {
            rolledBack: false,
            reason: 'snapshot_invalid',
            message: 'Checkpoint snapshot data is missing.',
            preview,
            safetyCheckpoint: rollbackSafetyCheckpointSummary(safetyCheckpoint),
        };
    }

    const restoreResult = await restoreExecutionTargetSnapshot({
        workspaceRootPath: executionTarget.absolutePath,
        files: snapshotEntries.map((entry) => ({
            relativePath: entry.relativePath,
            bytes: entry.bytes,
        })),
    });
    if (restoreResult.isErr()) {
        return {
            rolledBack: false,
            reason: mapRestoreFailureReason(restoreResult.error.reason),
            message: restoreResult.error.detail,
            preview,
            safetyCheckpoint: rollbackSafetyCheckpointSummary(safetyCheckpoint),
        };
    }

    return {
        rolledBack: true,
        checkpoint: checkpointSummary(checkpoint),
        preview,
        safetyCheckpoint: rollbackSafetyCheckpointSummary(safetyCheckpoint),
    };
}

export async function revertCheckpointChangeset(
    input: CheckpointRevertChangesetInput
): Promise<CheckpointRevertChangesetResult> {
    const checkpoint = await checkpointStore.getById(input.profileId, input.checkpointId);
    if (!checkpoint) {
        return {
            reverted: false,
            reason: 'not_found',
        };
    }

    const preview = await buildRollbackPreview({
        profileId: input.profileId,
        checkpoint,
    });
    if (!input.confirm) {
        return {
            reverted: false,
            reason: 'confirmation_required',
            message: 'Changeset revert requires explicit confirmation.',
            preview,
        };
    }

    if (!preview.changeset) {
        return {
            reverted: false,
            reason: 'changeset_missing',
            message: 'This checkpoint does not have a revertable changeset yet.',
            preview,
        };
    }

    if (!preview.canRevertSafely || preview.revertBlockedReason) {
        return {
            reverted: false,
            reason: mapRevertFailureReason(preview.revertBlockedReason ?? 'target_drifted'),
            message:
                preview.revertBlockedReason === 'changeset_empty'
                    ? 'This checkpoint has no file changes to revert.'
                    : 'Changeset revert is not safe on the current filesystem state.',
            preview,
            changeset: preview.changeset,
        };
    }

    const workspaceContext = await workspaceContextService.resolveExplicit({
        profileId: input.profileId,
        workspaceFingerprint: checkpoint.workspaceFingerprint,
        ...(checkpoint.sandboxId ? { sandboxId: checkpoint.sandboxId } : {}),
    });
    const executionTarget = resolveCheckpointExecutionTarget(workspaceContext);
    if (!executionTarget || executionTarget.executionTargetKey !== checkpoint.executionTargetKey) {
        return {
            reverted: false,
            reason: 'workspace_unresolved',
            message: 'Workspace root could not be resolved for this changeset.',
            preview,
            changeset: preview.changeset,
        };
    }

    const safetyCheckpointResult = await createNativeCheckpointForResolvedTarget({
        profileId: input.profileId,
        sessionId: checkpoint.sessionId,
        threadId: checkpoint.threadId,
        topLevelTab: checkpoint.topLevelTab,
        modeKey: checkpoint.modeKey,
        workspaceContext,
        createdByKind: 'system',
        checkpointKind: 'safety',
        summary: `Safety checkpoint before reverting changes from ${checkpoint.id}`,
    });
    if (safetyCheckpointResult.isErr()) {
        return {
            reverted: false,
            reason:
                safetyCheckpointResult.error.code === 'checkpoint_execution_target_unresolved'
                    ? 'workspace_unresolved'
                    : 'snapshot_invalid',
            message: safetyCheckpointResult.error.message,
            preview,
            changeset: preview.changeset,
        };
    }
    const safetyCheckpoint = safetyCheckpointResult.value;

    const changesetRecord = await checkpointChangesetStore.getByCheckpointId(input.profileId, checkpoint.id);
    if (!changesetRecord) {
        return {
            reverted: false,
            reason: 'changeset_missing',
            message: 'This checkpoint does not have a revertable changeset yet.',
            preview,
            changeset: preview.changeset,
            safetyCheckpoint: revertSafetyCheckpointSummary(safetyCheckpoint),
        };
    }

    const currentSnapshotResult = await captureExecutionTargetSnapshot({
        workspaceRootPath: executionTarget.absolutePath,
    });
    if (currentSnapshotResult.isErr()) {
        return {
            reverted: false,
            reason: 'snapshot_invalid',
            message: currentSnapshotResult.error.detail,
            preview,
            changeset: mapChangesetRecord(changesetRecord),
            safetyCheckpoint: revertSafetyCheckpointSummary(safetyCheckpoint),
        };
    }

    const applicability = evaluateRevertApplicability(
        changesetRecord,
        buildSnapshotIndexFromCapture(currentSnapshotResult.value.files)
    );
    if (!applicability.canRevertSafely || !applicability.restoredFiles) {
        return {
            reverted: false,
            reason: mapRevertFailureReason(applicability.reason ?? 'target_drifted'),
            message: 'Changeset revert is not safe on the current filesystem state.',
            preview,
            changeset: mapChangesetRecord(changesetRecord),
            safetyCheckpoint: revertSafetyCheckpointSummary(safetyCheckpoint),
        };
    }

    const restoreResult = await restoreExecutionTargetSnapshot({
        workspaceRootPath: executionTarget.absolutePath,
        files: applicability.restoredFiles,
    });
    if (restoreResult.isErr()) {
        return {
            reverted: false,
            reason: 'revert_failed',
            message: restoreResult.error.detail,
            preview,
            changeset: mapChangesetRecord(changesetRecord),
            safetyCheckpoint: revertSafetyCheckpointSummary(safetyCheckpoint),
        };
    }

    const safetySnapshotEntries = await checkpointSnapshotStore.listSnapshotEntries(safetyCheckpoint.id);
    const revertChangeset = await checkpointChangesetStore.replaceForCheckpoint({
        profileId: input.profileId,
        checkpointId: safetyCheckpoint.id,
        sourceChangesetId: changesetRecord.id,
        sessionId: safetyCheckpoint.sessionId,
        threadId: safetyCheckpoint.threadId,
        executionTargetKey: safetyCheckpoint.executionTargetKey,
        executionTargetKind: safetyCheckpoint.executionTargetKind,
        executionTargetLabel: safetyCheckpoint.executionTargetLabel,
        createdByKind: 'system',
        changesetKind: 'revert',
        summary: `Reverted ${changesetRecord.summary.toLowerCase()}`,
        entries: deriveChangesetFromSnapshots({
            beforeFiles: buildSnapshotIndexFromEntries(safetySnapshotEntries),
            afterFiles: buildSnapshotIndexFromCapture(applicability.restoredFiles),
        }).entries,
    });

    return {
        reverted: true,
        checkpoint: checkpointSummary(checkpoint),
        preview,
        changeset: mapChangesetRecord(changesetRecord),
        safetyCheckpoint: revertSafetyCheckpointSummary(safetyCheckpoint),
        revertChangeset: mapChangesetRecord(revertChangeset),
    };
}

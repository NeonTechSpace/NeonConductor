import {
    checkpointChangesetStore,
    checkpointSnapshotStore,
    checkpointStore,
    diffStore,
} from '@/app/backend/persistence/stores';
import type {
    CheckpointChangesetRecord,
    CheckpointRecord,
    DiffArtifact,
    DiffRecord,
} from '@/app/backend/persistence/types';
import type {
    ChangesetRecord,
    CheckpointCleanupPreview,
    CheckpointCompactionRunSummary,
    CheckpointListResult,
    CheckpointRevertChangesetResult,
    CheckpointRollbackPreview,
    CheckpointRollbackResult,
    ResolvedWorkspaceContext,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
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
import {
    listAffectedSessionsForExecutionTarget,
    resolveCheckpointExecutionTarget,
} from '@/app/backend/runtime/services/checkpoint/executionTarget';
import { captureGitWorkspaceArtifact } from '@/app/backend/runtime/services/checkpoint/gitWorkspace';
import { captureExecutionTargetSnapshot } from '@/app/backend/runtime/services/checkpoint/nativeSnapshot';
import {
    applyRetentionDispositions,
    buildCleanupPreview,
    classifyCheckpointRetention,
} from '@/app/backend/runtime/services/checkpoint/retention';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

type CheckpointSummary = NonNullable<CheckpointRollbackResult['checkpoint']>;
type SafetyCheckpointSummary = NonNullable<CheckpointRollbackResult['safetyCheckpoint']>;
type RevertSafetyCheckpointSummary = NonNullable<CheckpointRevertChangesetResult['safetyCheckpoint']>;

export function mapCompactionRunSummary(
    run: import('@/app/backend/persistence/types').CheckpointCompactionRunRecord
): CheckpointCompactionRunSummary {
    return {
        id: run.id,
        triggerKind: run.triggerKind,
        status: run.status,
        ...(run.message ? { message: run.message } : {}),
        blobCountBefore: run.blobCountBefore,
        blobCountAfter: run.blobCountAfter,
        bytesBefore: run.bytesBefore,
        bytesAfter: run.bytesAfter,
        blobsCompacted: run.blobsCompacted,
        databaseReclaimed: run.databaseReclaimed,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
    };
}

export async function buildCheckpointListResult(input: {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
}): Promise<CheckpointListResult> {
    const retentionState = await loadRetentionState(input);
    const storage = await getCheckpointStorageSummary(input.profileId);

    return {
        checkpoints: retentionState.decoratedCheckpoints,
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

export function isMutatingCheckpointMode(topLevelTab: TopLevelTab, modeKey: string): boolean {
    return (topLevelTab === 'agent' && modeKey === 'code') || topLevelTab === 'orchestrator';
}

function summarizeDiff(diff: DiffRecord): string {
    if (diff.artifact.kind === 'unsupported') {
        return 'Diff capture unavailable';
    }

    if (diff.artifact.fileCount === 0) {
        return 'No file changes';
    }

    return `${String(diff.artifact.fileCount)} changed ${diff.artifact.fileCount === 1 ? 'file' : 'files'}`;
}

function unsupportedArtifact(input: {
    workspaceRootPath: string;
    workspaceLabel: string;
    reason: Extract<DiffArtifact, { kind: 'unsupported' }>['reason'];
    detail: string;
}): Extract<DiffArtifact, { kind: 'unsupported' }> {
    return {
        kind: 'unsupported',
        workspaceRootPath: input.workspaceRootPath,
        workspaceLabel: input.workspaceLabel,
        reason: input.reason,
        detail: input.detail,
    };
}

function summarizeCheckpoint(input: {
    checkpointKind: CheckpointRecord['checkpointKind'];
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    executionTargetLabel: string;
    runId?: CheckpointRecord['runId'];
}): string {
    if (input.checkpointKind === 'safety') {
        return `Safety checkpoint for ${input.executionTargetLabel}`;
    }

    if (input.checkpointKind === 'named') {
        return input.runId
            ? `Manual checkpoint before ${input.topLevelTab}.${input.modeKey} run ${input.runId}`
            : `Manual checkpoint for ${input.executionTargetLabel}`;
    }

    return input.runId
        ? `Before ${input.topLevelTab}.${input.modeKey} run ${input.runId}`
        : `Automatic checkpoint for ${input.executionTargetLabel}`;
}

export function mapChangesetRecord(record: CheckpointChangesetRecord): ChangesetRecord {
    return {
        id: record.id,
        checkpointId: record.checkpointId,
        ...(record.sourceChangesetId ? { sourceChangesetId: record.sourceChangesetId } : {}),
        sessionId: record.sessionId,
        threadId: record.threadId,
        ...(record.runId ? { runId: record.runId } : {}),
        executionTargetKey: record.executionTargetKey,
        executionTargetKind: record.executionTargetKind,
        executionTargetLabel: record.executionTargetLabel,
        changesetKind: record.changesetKind,
        changeCount: record.changeCount,
        summary: record.summary,
    };
}

export async function createNativeCheckpointForResolvedTarget(input: {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
    threadId: CheckpointRecord['threadId'];
    runId?: CheckpointRecord['runId'];
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    workspaceContext: ResolvedWorkspaceContext;
    createdByKind: CheckpointRecord['createdByKind'];
    checkpointKind: CheckpointRecord['checkpointKind'];
    milestoneTitle?: string;
    summary?: string;
}): Promise<OperationalResult<CheckpointRecord>> {
    if (input.runId) {
        const existing = await checkpointStore.getByRunId(input.profileId, input.runId);
        if (existing) {
            return okOp(existing);
        }
    }

    const executionTarget = resolveCheckpointExecutionTarget(input.workspaceContext);
    if (!executionTarget) {
        return errOp(
            'checkpoint_execution_target_unresolved',
            'Workspace execution target could not be resolved for checkpoint capture.'
        );
    }

    const snapshotResult = await captureExecutionTargetSnapshot({
        workspaceRootPath: executionTarget.absolutePath,
    });
    if (snapshotResult.isErr()) {
        return errOp('checkpoint_snapshot_capture_failed', snapshotResult.error.detail);
    }

    const checkpoint = await checkpointStore.create({
        profileId: input.profileId,
        sessionId: input.sessionId,
        threadId: input.threadId,
        ...(input.runId ? { runId: input.runId } : {}),
        workspaceFingerprint: executionTarget.workspaceFingerprint,
        ...(executionTarget.sandboxId ? { sandboxId: executionTarget.sandboxId } : {}),
        executionTargetKey: executionTarget.executionTargetKey,
        executionTargetKind: executionTarget.executionTargetKind,
        executionTargetLabel: executionTarget.executionTargetLabel,
        createdByKind: input.createdByKind,
        checkpointKind: input.checkpointKind,
        ...(input.milestoneTitle ? { milestoneTitle: input.milestoneTitle } : {}),
        snapshotFileCount: snapshotResult.value.fileCount,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        summary:
            input.summary ??
            summarizeCheckpoint({
                checkpointKind: input.checkpointKind,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                executionTargetLabel: executionTarget.executionTargetLabel,
                ...(input.runId ? { runId: input.runId } : {}),
            }),
    });

    try {
        await checkpointSnapshotStore.replaceSnapshot({
            checkpointId: checkpoint.id,
            files: snapshotResult.value.files,
        });
        await compactCheckpointStorage({
            profileId: input.profileId,
            triggerKind: 'automatic',
            force: false,
        });
        return okOp(checkpoint);
    } catch (error) {
        await checkpointStore.deleteById(input.profileId, checkpoint.id);
        return errOp(
            'checkpoint_snapshot_capture_failed',
            error instanceof Error ? error.message : 'Checkpoint snapshot capture could not be finalized.'
        );
    }
}

export async function loadRetentionState(input: {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
}): Promise<{
    sessionCheckpoints: CheckpointRecord[];
    decoratedCheckpoints: CheckpointRecord[];
    preview: CheckpointCleanupPreview;
}> {
    const [sessionCheckpoints, profileCheckpoints] = await Promise.all([
        checkpointStore.listBySession(input.profileId, input.sessionId),
        checkpointStore.listByProfile(input.profileId),
    ]);
    const retentionDispositions = classifyCheckpointRetention({
        sessionCheckpoints,
        profileCheckpoints,
    });
    const decoratedCheckpoints = applyRetentionDispositions(sessionCheckpoints, retentionDispositions);
    const changesetCounts = await checkpointChangesetStore.listChangeCountsByCheckpointIds(
        input.profileId,
        sessionCheckpoints.map((checkpoint) => checkpoint.id)
    );

    return {
        sessionCheckpoints,
        decoratedCheckpoints,
        preview: buildCleanupPreview({
            sessionId: input.sessionId,
            checkpoints: sessionCheckpoints,
            retentionDispositions,
            changesetCounts,
        }),
    };
}

export async function captureRunDiffArtifact(input: {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
    runId: NonNullable<CheckpointRecord['runId']>;
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    workspaceContext: ResolvedWorkspaceContext;
}): Promise<{ diff: DiffRecord; checkpoint?: CheckpointRecord } | null> {
    if (!isMutatingCheckpointMode(input.topLevelTab, input.modeKey)) {
        return null;
    }

    const existingDiffs = await diffStore.listByRun(input.profileId, input.runId);
    const existingCheckpoint = await checkpointStore.getByRunId(input.profileId, input.runId);
    const firstDiff = existingDiffs[0];
    if (firstDiff) {
        return {
            diff: firstDiff,
            ...(existingCheckpoint ? { checkpoint: existingCheckpoint } : {}),
        };
    }

    const artifact =
        input.workspaceContext.kind === 'workspace' || input.workspaceContext.kind === 'sandbox'
            ? await captureGitWorkspaceArtifact({
                  workspaceRootPath: input.workspaceContext.absolutePath,
                  workspaceLabel: input.workspaceContext.label,
              })
            : unsupportedArtifact({
                  workspaceRootPath: 'Unresolved workspace root',
                  workspaceLabel: 'Detached workspace',
                  reason: 'workspace_unresolved',
                  detail: 'Workspace root could not be resolved for this run.',
              });

    const diff = await diffStore.create({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        summary:
            artifact.kind === 'git'
                ? artifact.fileCount === 0
                    ? 'No file changes'
                    : `${String(artifact.fileCount)} changed ${artifact.fileCount === 1 ? 'file' : 'files'}`
                : 'Diff capture unavailable',
        artifact,
    });

    if (!existingCheckpoint) {
        return {
            diff,
        };
    }

    const updatedCheckpoint = await checkpointStore.attachDiff({
        profileId: input.profileId,
        checkpointId: existingCheckpoint.id,
        diffId: diff.id,
        summary: existingCheckpoint.checkpointKind === 'named' ? existingCheckpoint.summary : summarizeDiff(diff),
    });

    return {
        diff,
        ...(updatedCheckpoint ? { checkpoint: updatedCheckpoint } : { checkpoint: existingCheckpoint }),
    };
}

export async function captureRunChangeset(input: {
    profileId: string;
    runId: NonNullable<CheckpointRecord['runId']>;
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    workspaceContext: ResolvedWorkspaceContext;
}): Promise<CheckpointChangesetRecord | null> {
    if (!isMutatingCheckpointMode(input.topLevelTab, input.modeKey)) {
        return null;
    }

    const checkpoint = await checkpointStore.getByRunId(input.profileId, input.runId);
    if (!checkpoint) {
        return null;
    }

    const executionTarget = resolveCheckpointExecutionTarget(input.workspaceContext);
    if (!executionTarget || executionTarget.executionTargetKey !== checkpoint.executionTargetKey) {
        return null;
    }

    const snapshotEntries = await checkpointSnapshotStore.listSnapshotEntries(checkpoint.id);
    if (snapshotEntries.length === 0 && checkpoint.snapshotFileCount > 0) {
        return null;
    }

    const currentSnapshotResult = await captureExecutionTargetSnapshot({
        workspaceRootPath: executionTarget.absolutePath,
    });
    if (currentSnapshotResult.isErr()) {
        return null;
    }

    const derivedChangeset = deriveChangesetFromSnapshots({
        beforeFiles: buildSnapshotIndexFromEntries(snapshotEntries),
        afterFiles: buildSnapshotIndexFromCapture(currentSnapshotResult.value.files),
    });

    const changeset = await checkpointChangesetStore.replaceForCheckpoint({
        profileId: input.profileId,
        checkpointId: checkpoint.id,
        sessionId: checkpoint.sessionId,
        threadId: checkpoint.threadId,
        ...(checkpoint.runId ? { runId: checkpoint.runId } : {}),
        executionTargetKey: checkpoint.executionTargetKey,
        executionTargetKind: checkpoint.executionTargetKind,
        executionTargetLabel: checkpoint.executionTargetLabel,
        createdByKind: 'system',
        changesetKind: 'run_capture',
        summary: derivedChangeset.summary,
        entries: derivedChangeset.entries,
    });
    await compactCheckpointStorage({
        profileId: input.profileId,
        triggerKind: 'automatic',
        force: false,
    });

    return changeset;
}

async function assessRevertAction(input: { profileId: string; checkpoint: CheckpointRecord }): Promise<{
    changeset: CheckpointChangesetRecord | null;
    canRevertSafely: boolean;
    revertBlockedReason?: CheckpointRollbackPreview['revertBlockedReason'];
}> {
    const changeset = await checkpointChangesetStore.getByCheckpointId(input.profileId, input.checkpoint.id);
    if (!changeset) {
        return {
            changeset: null,
            canRevertSafely: false,
            revertBlockedReason: 'changeset_missing',
        };
    }

    const workspaceContext = await workspaceContextService.resolveExplicit({
        profileId: input.profileId,
        workspaceFingerprint: input.checkpoint.workspaceFingerprint,
        ...(input.checkpoint.sandboxId ? { sandboxId: input.checkpoint.sandboxId } : {}),
    });
    const executionTarget = resolveCheckpointExecutionTarget(workspaceContext);
    if (!executionTarget || executionTarget.executionTargetKey !== input.checkpoint.executionTargetKey) {
        return {
            changeset,
            canRevertSafely: false,
            revertBlockedReason: 'workspace_unresolved',
        };
    }

    const currentSnapshotResult = await captureExecutionTargetSnapshot({
        workspaceRootPath: executionTarget.absolutePath,
    });
    if (currentSnapshotResult.isErr()) {
        return {
            changeset,
            canRevertSafely: false,
            revertBlockedReason: 'snapshot_invalid',
        };
    }

    const applicability = evaluateRevertApplicability(
        changeset,
        buildSnapshotIndexFromCapture(currentSnapshotResult.value.files)
    );
    return {
        changeset,
        canRevertSafely: applicability.canRevertSafely,
        ...(applicability.reason ? { revertBlockedReason: applicability.reason } : {}),
    };
}

export async function buildRollbackPreview(input: {
    profileId: string;
    checkpoint: CheckpointRecord;
}): Promise<CheckpointRollbackPreview> {
    const [affectedSessions, targetCheckpoints, revertAssessment] = await Promise.all([
        listAffectedSessionsForExecutionTarget({
            profileId: input.profileId,
            executionTargetKey: input.checkpoint.executionTargetKey,
        }),
        checkpointStore.listByExecutionTargetKey(input.profileId, input.checkpoint.executionTargetKey),
        assessRevertAction({
            profileId: input.profileId,
            checkpoint: input.checkpoint,
        }),
    ]);

    const isSharedTarget = affectedSessions.some((session) => session.sessionId !== input.checkpoint.sessionId);
    const hasLaterForeignChanges = targetCheckpoints.some(
        (candidate) =>
            candidate.id !== input.checkpoint.id &&
            candidate.sessionId !== input.checkpoint.sessionId &&
            candidate.createdAt > input.checkpoint.createdAt
    );
    const highRisk = isSharedTarget || hasLaterForeignChanges;
    const recommendedAction =
        highRisk && revertAssessment.changeset && revertAssessment.canRevertSafely
            ? 'revert_changeset'
            : 'restore_checkpoint';

    return {
        checkpointId: input.checkpoint.id,
        executionTargetKey: input.checkpoint.executionTargetKey,
        executionTargetKind: input.checkpoint.executionTargetKind,
        executionTargetLabel: input.checkpoint.executionTargetLabel,
        isSharedTarget,
        hasLaterForeignChanges,
        isHighRisk: highRisk,
        affectedSessions,
        hasChangeset: Boolean(revertAssessment.changeset),
        ...(revertAssessment.changeset ? { changeset: mapChangesetRecord(revertAssessment.changeset) } : {}),
        recommendedAction,
        canRevertSafely: revertAssessment.canRevertSafely,
        ...(revertAssessment.revertBlockedReason ? { revertBlockedReason: revertAssessment.revertBlockedReason } : {}),
    };
}

export function checkpointSummary(record: CheckpointRecord): CheckpointSummary {
    return {
        id: record.id,
        sessionId: record.sessionId,
        threadId: record.threadId,
        ...(record.runId ? { runId: record.runId } : {}),
        topLevelTab: record.topLevelTab,
        modeKey: record.modeKey,
    };
}

export function rollbackSafetyCheckpointSummary(record: CheckpointRecord): SafetyCheckpointSummary {
    return checkpointSummary(record);
}

export function revertSafetyCheckpointSummary(record: CheckpointRecord): RevertSafetyCheckpointSummary {
    return checkpointSummary(record);
}

export function mapRestoreFailureReason(
    reason: 'snapshot_invalid' | 'restore_failed'
): Extract<CheckpointRollbackResult['reason'], 'snapshot_invalid' | 'restore_failed'> {
    return reason;
}

export function mapRevertFailureReason(
    reason: CheckpointRollbackPreview['revertBlockedReason']
): Extract<
    CheckpointRevertChangesetResult['reason'],
    'changeset_missing' | 'changeset_empty' | 'workspace_unresolved' | 'snapshot_invalid' | 'target_drifted'
> {
    if (
        reason === 'changeset_missing' ||
        reason === 'changeset_empty' ||
        reason === 'workspace_unresolved' ||
        reason === 'snapshot_invalid'
    ) {
        return reason;
    }

    return 'target_drifted';
}

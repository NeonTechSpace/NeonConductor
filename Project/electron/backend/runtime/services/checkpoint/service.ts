import {
    checkpointChangesetStore,
    checkpointSnapshotStore,
    checkpointStore,
    diffStore,
    runStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import type {
    CheckpointChangesetRecord,
    CheckpointRecord,
    DiffArtifact,
    DiffRecord,
} from '@/app/backend/persistence/types';
import type {
    ChangesetRecord,
    CheckpointCleanupApplyInput,
    CheckpointCleanupApplyResult,
    CheckpointCleanupPreview,
    CheckpointCleanupPreviewInput,
    CheckpointCreateInput,
    CheckpointDeleteMilestoneInput,
    CheckpointPromoteMilestoneInput,
    CheckpointRevertChangesetInput,
    CheckpointRevertChangesetResult,
    CheckpointRenameMilestoneInput,
    CheckpointRollbackInput,
    CheckpointRollbackPreview,
    CheckpointRollbackPreviewInput,
    CheckpointRollbackResult,
    ResolvedWorkspaceContext,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { isEntityId } from '@/app/backend/runtime/contracts';
import {
    buildSnapshotIndexFromCapture,
    buildSnapshotIndexFromEntries,
    deriveChangesetFromSnapshots,
    evaluateRevertApplicability,
} from '@/app/backend/runtime/services/checkpoint/changeset';
import {
    listAffectedSessionsForExecutionTarget,
    resolveCheckpointExecutionTarget,
} from '@/app/backend/runtime/services/checkpoint/executionTarget';
import { captureGitWorkspaceArtifact } from '@/app/backend/runtime/services/checkpoint/gitWorkspace';
import {
    captureExecutionTargetSnapshot,
    restoreExecutionTargetSnapshot,
} from '@/app/backend/runtime/services/checkpoint/nativeSnapshot';
import {
    applyRetentionDispositions,
    buildCleanupPreview,
    classifyCheckpointRetention,
} from '@/app/backend/runtime/services/checkpoint/retention';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

type CheckpointSummary = NonNullable<CheckpointRollbackResult['checkpoint']>;
type SafetyCheckpointSummary = NonNullable<CheckpointRollbackResult['safetyCheckpoint']>;
type RevertSafetyCheckpointSummary = NonNullable<CheckpointRevertChangesetResult['safetyCheckpoint']>;
type CheckpointCreateResult = {
    created: boolean;
    reason?: 'not_found' | 'unsupported_run';
    diff?: DiffRecord;
    checkpoint?: CheckpointRecord;
};

function isMutatingCheckpointMode(topLevelTab: TopLevelTab, modeKey: string): boolean {
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

function mapChangesetRecord(record: CheckpointChangesetRecord): ChangesetRecord {
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

async function createNativeCheckpointForResolvedTarget(input: {
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
}): Promise<CheckpointRecord> {
    if (input.runId) {
        const existing = await checkpointStore.getByRunId(input.profileId, input.runId);
        if (existing) {
            return existing;
        }
    }

    const executionTarget = resolveCheckpointExecutionTarget(input.workspaceContext);
    if (!executionTarget) {
        throw new Error('Workspace execution target could not be resolved for checkpoint capture.');
    }

    const snapshotResult = await captureExecutionTargetSnapshot({
        workspaceRootPath: executionTarget.absolutePath,
    });
    if (snapshotResult.isErr()) {
        throw new Error(snapshotResult.error.detail);
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
        return checkpoint;
    } catch (error) {
        await checkpointStore.deleteById(input.profileId, checkpoint.id);
        throw error;
    }
}

async function loadRetentionState(input: {
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

async function captureRunDiffArtifact(input: {
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

async function captureRunChangeset(input: {
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

    return checkpointChangesetStore.replaceForCheckpoint({
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
}

async function assessRevertAction(input: {
    profileId: string;
    checkpoint: CheckpointRecord;
}): Promise<{
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

async function buildRollbackPreview(input: {
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
        ...(revertAssessment.revertBlockedReason
            ? { revertBlockedReason: revertAssessment.revertBlockedReason }
            : {}),
    };
}

function checkpointSummary(record: CheckpointRecord): CheckpointSummary {
    return {
        id: record.id,
        sessionId: record.sessionId,
        threadId: record.threadId,
        ...(record.runId ? { runId: record.runId } : {}),
        topLevelTab: record.topLevelTab,
        modeKey: record.modeKey,
    };
}

function rollbackSafetyCheckpointSummary(record: CheckpointRecord): SafetyCheckpointSummary {
    return checkpointSummary(record);
}

function revertSafetyCheckpointSummary(record: CheckpointRecord): RevertSafetyCheckpointSummary {
    return checkpointSummary(record);
}

function mapRestoreFailureReason(
    reason: 'snapshot_invalid' | 'restore_failed'
): Extract<CheckpointRollbackResult['reason'], 'snapshot_invalid' | 'restore_failed'> {
    return reason;
}

function mapRevertFailureReason(
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

export async function ensureCheckpointForRun(input: {
    profileId: string;
    runId: NonNullable<CheckpointRecord['runId']>;
    sessionId: CheckpointRecord['sessionId'];
    threadId: CheckpointRecord['threadId'];
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    workspaceContext: ResolvedWorkspaceContext;
}): Promise<CheckpointRecord | null> {
    if (!isMutatingCheckpointMode(input.topLevelTab, input.modeKey)) {
        return null;
    }

    if (!resolveCheckpointExecutionTarget(input.workspaceContext)) {
        throw new Error('Mutating run checkpoint capture requires a resolved execution target.');
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
}): Promise<{ checkpoints: CheckpointRecord[] }> {
    const retentionState = await loadRetentionState(input);
    return {
        checkpoints: retentionState.decoratedCheckpoints,
    };
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

    const checkpoint = await createNativeCheckpointForResolvedTarget({
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
    const prunedBlobCount = deleted ? await checkpointSnapshotStore.pruneUnreferencedBlobs() : 0;

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
    const prunedBlobCount = await checkpointSnapshotStore.pruneUnreferencedBlobs();

    return {
        cleanedUp: true,
        preview: retentionState.preview,
        deletedCheckpointIds,
        deletedCount: deletedCheckpointIds.length,
        prunedBlobCount,
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

    const safetyCheckpoint = await createNativeCheckpointForResolvedTarget({
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

    const safetyCheckpoint = await createNativeCheckpointForResolvedTarget({
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

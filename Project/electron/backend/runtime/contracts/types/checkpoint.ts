import type { TopLevelTab } from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface CheckpointCreateInput extends ProfileInput {
    runId: EntityId<'run'>;
    milestoneTitle: string;
}

export interface CheckpointListInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
}

export interface CheckpointForceCompactInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
    confirm: boolean;
}

export interface CheckpointPromoteMilestoneInput extends ProfileInput {
    checkpointId: EntityId<'ckpt'>;
    milestoneTitle: string;
}

export interface CheckpointRenameMilestoneInput extends ProfileInput {
    checkpointId: EntityId<'ckpt'>;
    milestoneTitle: string;
}

export interface CheckpointDeleteMilestoneInput extends ProfileInput {
    checkpointId: EntityId<'ckpt'>;
    confirm: boolean;
}

export interface CheckpointCleanupPreviewInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
}

export interface CheckpointCleanupApplyInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
    confirm: boolean;
}

export type CheckpointRetentionDisposition = 'milestone' | 'protected_recent' | 'eligible_for_cleanup';

export interface CheckpointRollbackPreviewInput extends ProfileInput {
    checkpointId: EntityId<'ckpt'>;
}

export interface ChangesetRecord {
    id: EntityId<'chg'>;
    checkpointId: EntityId<'ckpt'>;
    sourceChangesetId?: EntityId<'chg'>;
    sessionId: EntityId<'sess'>;
    threadId: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    executionTargetKey: string;
    executionTargetKind: 'workspace' | 'sandbox';
    executionTargetLabel: string;
    changesetKind: 'run_capture' | 'revert';
    changeCount: number;
    summary: string;
}

export interface CheckpointCleanupCandidate {
    checkpointId: EntityId<'ckpt'>;
    checkpointKind: 'auto' | 'safety' | 'named';
    milestoneTitle?: string;
    summary: string;
    snapshotFileCount: number;
    changesetChangeCount: number;
    createdAt: string;
}

export interface CheckpointCleanupPreview {
    sessionId: EntityId<'sess'>;
    retentionPolicy: {
        protectedRecentPerSession: number;
        protectedRecentPerExecutionTarget: number;
    };
    milestoneCount: number;
    protectedRecentCount: number;
    eligibleCount: number;
    candidates: CheckpointCleanupCandidate[];
}

export interface CheckpointCleanupApplyResult {
    cleanedUp: boolean;
    reason?: 'confirmation_required';
    message?: string;
    preview: CheckpointCleanupPreview;
    deletedCheckpointIds?: EntityId<'ckpt'>[];
    deletedCount?: number;
    prunedBlobCount?: number;
}

export interface CheckpointCompactionRunSummary {
    id: EntityId<'cpr'>;
    triggerKind: 'automatic' | 'manual';
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
}

export interface CheckpointStorageSummary {
    looseReferencedBlobCount: number;
    looseReferencedByteSize: number;
    packedReferencedBlobCount: number;
    packedReferencedByteSize: number;
    totalReferencedBlobCount: number;
    totalReferencedByteSize: number;
    lastCompactionRun?: CheckpointCompactionRunSummary;
}

export interface CheckpointListResult {
    checkpoints: Array<{
        id: EntityId<'ckpt'>;
        profileId: string;
        sessionId: EntityId<'sess'>;
        threadId: EntityId<'thr'>;
        runId?: EntityId<'run'>;
        diffId?: string;
        workspaceFingerprint: string;
        sandboxId?: EntityId<'sb'>;
        executionTargetKey: string;
        executionTargetKind: 'workspace' | 'sandbox';
        executionTargetLabel: string;
        createdByKind: 'system' | 'user';
        checkpointKind: 'auto' | 'safety' | 'named';
        milestoneTitle?: string;
        retentionDisposition?: CheckpointRetentionDisposition;
        snapshotFileCount: number;
        topLevelTab: TopLevelTab;
        modeKey: string;
        summary: string;
        createdAt: string;
        updatedAt: string;
    }>;
    storage: CheckpointStorageSummary;
}

export interface CheckpointForceCompactResult {
    compacted: boolean;
    reason?: 'confirmation_required';
    message?: string;
    storage: CheckpointStorageSummary;
    run?: CheckpointCompactionRunSummary;
}

export interface CheckpointRollbackPreview {
    checkpointId: EntityId<'ckpt'>;
    executionTargetKey: string;
    executionTargetKind: 'workspace' | 'sandbox';
    executionTargetLabel: string;
    isSharedTarget: boolean;
    hasLaterForeignChanges: boolean;
    isHighRisk: boolean;
    affectedSessions: Array<{
        sessionId: EntityId<'sess'>;
        threadId: EntityId<'thr'>;
        topLevelTab: TopLevelTab;
        threadTitle: string;
    }>;
    hasChangeset: boolean;
    changeset?: ChangesetRecord;
    recommendedAction: 'restore_checkpoint' | 'revert_changeset';
    canRevertSafely: boolean;
    revertBlockedReason?:
        | 'changeset_missing'
        | 'changeset_empty'
        | 'workspace_unresolved'
        | 'snapshot_invalid'
        | 'target_drifted';
}

export interface CheckpointRollbackInput extends ProfileInput {
    checkpointId: EntityId<'ckpt'>;
    confirm: boolean;
}

export interface CheckpointRollbackResult {
    rolledBack: boolean;
    reason?: 'confirmation_required' | 'not_found' | 'workspace_unresolved' | 'snapshot_invalid' | 'restore_failed';
    message?: string;
    checkpoint?: {
        id: EntityId<'ckpt'>;
        sessionId: EntityId<'sess'>;
        threadId: EntityId<'thr'>;
        runId?: EntityId<'run'>;
        topLevelTab: TopLevelTab;
        modeKey: string;
    };
    preview?: CheckpointRollbackPreview;
    safetyCheckpoint?: {
        id: EntityId<'ckpt'>;
        sessionId: EntityId<'sess'>;
        threadId: EntityId<'thr'>;
        runId?: EntityId<'run'>;
        topLevelTab: TopLevelTab;
        modeKey: string;
    };
}

export interface CheckpointRevertChangesetInput extends ProfileInput {
    checkpointId: EntityId<'ckpt'>;
    confirm: boolean;
}

export interface CheckpointRevertChangesetResult {
    reverted: boolean;
    reason?:
        | 'confirmation_required'
        | 'not_found'
        | 'changeset_missing'
        | 'changeset_empty'
        | 'workspace_unresolved'
        | 'snapshot_invalid'
        | 'target_drifted'
        | 'revert_failed';
    message?: string;
    checkpoint?: {
        id: EntityId<'ckpt'>;
        sessionId: EntityId<'sess'>;
        threadId: EntityId<'thr'>;
        runId?: EntityId<'run'>;
        topLevelTab: TopLevelTab;
        modeKey: string;
    };
    preview?: CheckpointRollbackPreview;
    changeset?: ChangesetRecord;
    safetyCheckpoint?: {
        id: EntityId<'ckpt'>;
        sessionId: EntityId<'sess'>;
        threadId: EntityId<'thr'>;
        runId?: EntityId<'run'>;
        topLevelTab: TopLevelTab;
        modeKey: string;
    };
    revertChangeset?: ChangesetRecord;
}

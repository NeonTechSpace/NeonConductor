import type { TopLevelTab } from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface CheckpointCreateInput extends ProfileInput {
    runId: EntityId<'run'>;
}

export interface CheckpointListInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
}

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
    executionTargetKind: 'workspace' | 'worktree';
    executionTargetLabel: string;
    changesetKind: 'run_capture' | 'revert';
    changeCount: number;
    summary: string;
}

export interface CheckpointRollbackPreview {
    checkpointId: EntityId<'ckpt'>;
    executionTargetKey: string;
    executionTargetKind: 'workspace' | 'worktree';
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
    reason?:
        | 'confirmation_required'
        | 'not_found'
        | 'workspace_unresolved'
        | 'snapshot_invalid'
        | 'restore_failed';
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

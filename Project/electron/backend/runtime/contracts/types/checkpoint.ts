import type { TopLevelTab } from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';

import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface CheckpointCreateInput extends ProfileInput {
    runId: EntityId<'run'>;
}

export interface CheckpointListInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
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
        | 'unsupported_artifact'
        | 'workspace_not_git'
        | 'restore_failed';
    message?: string;
    checkpoint?: {
        id: EntityId<'ckpt'>;
        sessionId: EntityId<'sess'>;
        runId: EntityId<'run'>;
        topLevelTab: TopLevelTab;
        modeKey: string;
    };
}

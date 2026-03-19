import {
    createParser,
    readBoolean,
    readEntityId,
    readObject,
    readString,
    readProfileId,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    CheckpointCleanupApplyInput,
    CheckpointCleanupPreviewInput,
    CheckpointCreateInput,
    CheckpointDeleteMilestoneInput,
    CheckpointListInput,
    CheckpointPromoteMilestoneInput,
    CheckpointRenameMilestoneInput,
    CheckpointRevertChangesetInput,
    CheckpointRollbackInput,
    CheckpointRollbackPreviewInput,
} from '@/app/backend/runtime/contracts/types';

export function parseCheckpointCreateInput(input: unknown): CheckpointCreateInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        runId: readEntityId(source.runId, 'runId', 'run'),
        milestoneTitle: readString(source.milestoneTitle, 'milestoneTitle'),
    };
}

export function parseCheckpointListInput(input: unknown): CheckpointListInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
    };
}

export function parseCheckpointRollbackInput(input: unknown): CheckpointRollbackInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        checkpointId: readEntityId(source.checkpointId, 'checkpointId', 'ckpt'),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export function parseCheckpointRevertChangesetInput(input: unknown): CheckpointRevertChangesetInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        checkpointId: readEntityId(source.checkpointId, 'checkpointId', 'ckpt'),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export function parseCheckpointRollbackPreviewInput(input: unknown): CheckpointRollbackPreviewInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        checkpointId: readEntityId(source.checkpointId, 'checkpointId', 'ckpt'),
    };
}

export function parseCheckpointPromoteMilestoneInput(input: unknown): CheckpointPromoteMilestoneInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        checkpointId: readEntityId(source.checkpointId, 'checkpointId', 'ckpt'),
        milestoneTitle: readString(source.milestoneTitle, 'milestoneTitle'),
    };
}

export function parseCheckpointRenameMilestoneInput(input: unknown): CheckpointRenameMilestoneInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        checkpointId: readEntityId(source.checkpointId, 'checkpointId', 'ckpt'),
        milestoneTitle: readString(source.milestoneTitle, 'milestoneTitle'),
    };
}

export function parseCheckpointDeleteMilestoneInput(input: unknown): CheckpointDeleteMilestoneInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        checkpointId: readEntityId(source.checkpointId, 'checkpointId', 'ckpt'),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export function parseCheckpointCleanupPreviewInput(input: unknown): CheckpointCleanupPreviewInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
    };
}

export function parseCheckpointCleanupApplyInput(input: unknown): CheckpointCleanupApplyInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export const checkpointCreateInputSchema = createParser(parseCheckpointCreateInput);
export const checkpointListInputSchema = createParser(parseCheckpointListInput);
export const checkpointRollbackInputSchema = createParser(parseCheckpointRollbackInput);
export const checkpointRevertChangesetInputSchema = createParser(parseCheckpointRevertChangesetInput);
export const checkpointRollbackPreviewInputSchema = createParser(parseCheckpointRollbackPreviewInput);
export const checkpointPromoteMilestoneInputSchema = createParser(parseCheckpointPromoteMilestoneInput);
export const checkpointRenameMilestoneInputSchema = createParser(parseCheckpointRenameMilestoneInput);
export const checkpointDeleteMilestoneInputSchema = createParser(parseCheckpointDeleteMilestoneInput);
export const checkpointCleanupPreviewInputSchema = createParser(parseCheckpointCleanupPreviewInput);
export const checkpointCleanupApplyInputSchema = createParser(parseCheckpointCleanupApplyInput);

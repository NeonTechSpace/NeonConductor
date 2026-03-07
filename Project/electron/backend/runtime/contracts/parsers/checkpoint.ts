import {
    createParser,
    readBoolean,
    readEntityId,
    readObject,
    readProfileId,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type { CheckpointCreateInput, CheckpointListInput, CheckpointRollbackInput } from '@/app/backend/runtime/contracts/types';

export function parseCheckpointCreateInput(input: unknown): CheckpointCreateInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        runId: readEntityId(source.runId, 'runId', 'run'),
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

export const checkpointCreateInputSchema = createParser(parseCheckpointCreateInput);
export const checkpointListInputSchema = createParser(parseCheckpointListInput);
export const checkpointRollbackInputSchema = createParser(parseCheckpointRollbackInput);

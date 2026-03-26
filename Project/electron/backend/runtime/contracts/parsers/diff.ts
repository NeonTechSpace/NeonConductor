import {
    createParser,
    readEntityId,
    readObject,
    readProfileId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type { DiffGetFilePatchInput, DiffListByRunInput } from '@/app/backend/runtime/contracts/types';

export function parseDiffListByRunInput(input: unknown): DiffListByRunInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        runId: readEntityId(source.runId, 'runId', 'run'),
    };
}

export function parseDiffGetFilePatchInput(input: unknown): DiffGetFilePatchInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        diffId: readString(source.diffId, 'diffId'),
        path: readString(source.path, 'path'),
    };
}

export const diffListByRunInputSchema = createParser(parseDiffListByRunInput);
export const diffGetFilePatchInputSchema = createParser(parseDiffGetFilePatchInput);

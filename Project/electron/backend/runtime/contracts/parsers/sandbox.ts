import { executionEnvironmentModes } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalBoolean,
    readOptionalString,
    readProfileId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    SandboxByIdInput,
    SandboxConfigureThreadInput,
    SandboxCreateInput,
    SandboxListInput,
    SandboxRemoveInput,
} from '@/app/backend/runtime/contracts/types';

export function parseSandboxListInput(input: unknown): SandboxListInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    return {
        profileId: readProfileId(source),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parseSandboxCreateInput(input: unknown): SandboxCreateInput {
    const source = readObject(input, 'input');
    const label = readOptionalString(source.label, 'label');
    const sandboxKey = readOptionalString(source.sandboxKey, 'sandboxKey');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
        ...(label ? { label } : {}),
        ...(sandboxKey ? { sandboxKey } : {}),
    };
}

export function parseSandboxByIdInput(input: unknown): SandboxByIdInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        sandboxId: readEntityId(source.sandboxId, 'sandboxId', 'sb'),
    };
}

export function parseSandboxRemoveInput(input: unknown): SandboxRemoveInput {
    const source = readObject(input, 'input');
    const removeFiles = readOptionalBoolean(source.removeFiles, 'removeFiles');

    return {
        profileId: readProfileId(source),
        sandboxId: readEntityId(source.sandboxId, 'sandboxId', 'sb'),
        ...(removeFiles !== undefined ? { removeFiles } : {}),
    };
}

export function parseSandboxConfigureThreadInput(input: unknown): SandboxConfigureThreadInput {
    const source = readObject(input, 'input');
    const mode = readEnumValue(source.mode, 'mode', executionEnvironmentModes);
    const sandboxId =
        source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;

    if (mode === 'sandbox' && !sandboxId) {
        throw new Error('Invalid "sandboxId": required when mode is "sandbox".');
    }
    if (mode !== 'sandbox' && sandboxId) {
        throw new Error('Invalid "sandboxId": allowed only when mode is "sandbox".');
    }

    return {
        profileId: readProfileId(source),
        threadId: readEntityId(source.threadId, 'threadId', 'thr'),
        mode,
        ...(sandboxId ? { sandboxId } : {}),
    };
}

export const sandboxListInputSchema = createParser(parseSandboxListInput);
export const sandboxCreateInputSchema = createParser(parseSandboxCreateInput);
export const sandboxByIdInputSchema = createParser(parseSandboxByIdInput);
export const sandboxRemoveInputSchema = createParser(parseSandboxRemoveInput);
export const sandboxConfigureThreadInputSchema = createParser(parseSandboxConfigureThreadInput);

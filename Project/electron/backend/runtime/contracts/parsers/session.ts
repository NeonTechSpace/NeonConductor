import { sessionEditModes, sessionKinds, topLevelTabs } from '@/app/backend/runtime/contracts/enums';
import {
    readArray,
    createParser,
    parseRuntimeRunOptions,
    readBoolean,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalString,
    readProfileId,
    readProviderId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    ComposerImageAttachmentInput,
    SessionBranchFromMessageInput,
    SessionBranchFromMessageWithWorkflowInput,
    SessionByIdInput,
    SessionCreateInput,
    SessionEditInput,
    SessionGetAttachedRulesInput,
    SessionGetMessageMediaInput,
    SessionGetAttachedSkillsInput,
    SessionListMessagesInput,
    SessionListRunsInput,
    SessionRevertInput,
    SessionSetAttachedRulesInput,
    SessionSetAttachedSkillsInput,
    SessionStartRunInput,
} from '@/app/backend/runtime/contracts/types';
import { composerImageAttachmentMimeTypes } from '@/app/backend/runtime/contracts/types/session';

function parseComposerImageAttachmentInput(value: unknown, field: string): ComposerImageAttachmentInput {
    const source = readObject(value, field);

    return {
        clientId: readString(source.clientId, `${field}.clientId`),
        mimeType: readEnumValue(source.mimeType, `${field}.mimeType`, composerImageAttachmentMimeTypes),
        bytesBase64: readString(source.bytesBase64, `${field}.bytesBase64`),
        width: readPositiveInteger(source.width, `${field}.width`),
        height: readPositiveInteger(source.height, `${field}.height`),
        sha256: readString(source.sha256, `${field}.sha256`),
    };
}

function readPositiveInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid "${field}": expected positive integer.`);
    }

    return value;
}

export function parseSessionCreateInput(input: unknown): SessionCreateInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        threadId: readEntityId(source.threadId, 'threadId', 'thr'),
        kind: readEnumValue(source.kind, 'kind', sessionKinds),
    };
}

export function parseSessionByIdInput(input: unknown): SessionByIdInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
    };
}

export function parseSessionRevertInput(input: unknown): SessionRevertInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
    };
}

export function parseSessionStartRunInput(input: unknown): SessionStartRunInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sandboxId =
        source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;
    const attachments =
        source.attachments !== undefined
            ? readArray(source.attachments, 'attachments').map((value, index) =>
                  parseComposerImageAttachmentInput(value, `attachments[${String(index)}]`)
              )
            : undefined;
    const runtimeOptions = parseRuntimeRunOptions(source.runtimeOptions);
    const prompt = typeof source.prompt === 'string' ? source.prompt.trim() : '';
    if (prompt.length === 0 && (!attachments || attachments.length === 0)) {
        throw new Error('Invalid "prompt": expected non-empty string when no attachments are provided.');
    }

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        prompt,
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
        runtimeOptions,
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    };
}

export function parseSessionListRunsInput(input: unknown): SessionListRunsInput {
    return parseSessionByIdInput(input);
}

export function parseSessionListMessagesInput(input: unknown): SessionListMessagesInput {
    const source = readObject(input, 'input');
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        ...(runId ? { runId } : {}),
    };
}

export function parseSessionGetMessageMediaInput(input: unknown): SessionGetMessageMediaInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        mediaId: readEntityId(source.mediaId, 'mediaId', 'media'),
    };
}

function parseSessionRegistryContextInput(input: unknown): SessionGetAttachedSkillsInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
    };
}

export function parseSessionGetAttachedSkillsInput(input: unknown): SessionGetAttachedSkillsInput {
    return parseSessionRegistryContextInput(input);
}

export function parseSessionSetAttachedSkillsInput(input: unknown): SessionSetAttachedSkillsInput {
    const source = readObject(input, 'input');
    const rawAssetKeys = source.assetKeys;
    if (!Array.isArray(rawAssetKeys)) {
        throw new Error('Invalid "assetKeys": expected array.');
    }

    return {
        ...parseSessionRegistryContextInput(input),
        assetKeys: rawAssetKeys.map((value, index) => readString(value, `assetKeys[${String(index)}]`)),
    };
}

export function parseSessionGetAttachedRulesInput(input: unknown): SessionGetAttachedRulesInput {
    return parseSessionRegistryContextInput(input);
}

export function parseSessionSetAttachedRulesInput(input: unknown): SessionSetAttachedRulesInput {
    const source = readObject(input, 'input');
    const rawAssetKeys = source.assetKeys;
    if (!Array.isArray(rawAssetKeys)) {
        throw new Error('Invalid "assetKeys": expected array.');
    }

    return {
        ...parseSessionRegistryContextInput(input),
        assetKeys: rawAssetKeys.map((value, index) => readString(value, `assetKeys[${String(index)}]`)),
    };
}

export function parseSessionEditInput(input: unknown): SessionEditInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sandboxId =
        source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;
    const runtimeOptions =
        source.runtimeOptions !== undefined ? parseRuntimeRunOptions(source.runtimeOptions) : undefined;
    const modeKey = readOptionalString(source.modeKey, 'modeKey');
    const autoStartRun =
        source.autoStartRun !== undefined ? readBoolean(source.autoStartRun, 'autoStartRun') : undefined;

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        messageId: readEntityId(source.messageId, 'messageId', 'msg'),
        replacementText: readString(source.replacementText, 'replacementText'),
        editMode: readEnumValue(source.editMode, 'editMode', sessionEditModes),
        ...(modeKey ? { modeKey } : {}),
        ...(autoStartRun !== undefined ? { autoStartRun } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        ...(runtimeOptions ? { runtimeOptions } : {}),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    };
}

export function parseSessionBranchFromMessageInput(input: unknown): SessionBranchFromMessageInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        messageId: readEntityId(source.messageId, 'messageId', 'msg'),
    };
}

export function parseSessionBranchFromMessageWithWorkflowInput(
    input: unknown
): SessionBranchFromMessageWithWorkflowInput {
    const source = readObject(input, 'input');
    const workflowId = readOptionalString(source.workflowId, 'workflowId');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        messageId: readEntityId(source.messageId, 'messageId', 'msg'),
        modeKey: readString(source.modeKey, 'modeKey'),
        ...(workflowId ? { workflowId } : {}),
    };
}

export const sessionCreateInputSchema = createParser(parseSessionCreateInput);
export const sessionByIdInputSchema = createParser(parseSessionByIdInput);
export const sessionRevertInputSchema = createParser(parseSessionRevertInput);
export const sessionStartRunInputSchema = createParser(parseSessionStartRunInput);
export const sessionListRunsInputSchema = createParser(parseSessionListRunsInput);
export const sessionListMessagesInputSchema = createParser(parseSessionListMessagesInput);
export const sessionGetMessageMediaInputSchema = createParser(parseSessionGetMessageMediaInput);
export const sessionGetAttachedSkillsInputSchema = createParser(parseSessionGetAttachedSkillsInput);
export const sessionSetAttachedSkillsInputSchema = createParser(parseSessionSetAttachedSkillsInput);
export const sessionGetAttachedRulesInputSchema = createParser(parseSessionGetAttachedRulesInput);
export const sessionSetAttachedRulesInputSchema = createParser(parseSessionSetAttachedRulesInput);
export const sessionEditInputSchema = createParser(parseSessionEditInput);
export const sessionBranchFromMessageInputSchema = createParser(parseSessionBranchFromMessageInput);
export const sessionBranchFromMessageWithWorkflowInputSchema = createParser(parseSessionBranchFromMessageWithWorkflowInput);

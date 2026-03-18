import {
    memoryCreatedByKinds,
    memoryScopeKinds,
    memoryStates,
    memoryTypes,
} from '@/app/backend/runtime/contracts/enums';
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
    ApplyMemoryEditProposalInput,
    MemoryByIdInput,
    MemoryCreateInput,
    MemoryDisableInput,
    MemoryListInput,
    MemoryProjectionContextInput,
    MemorySupersedeInput,
} from '@/app/backend/runtime/contracts/types';

function readMetadataRecord(value: unknown, field: string): Record<string, unknown> | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readObject(value, field);
}

export function parseMemoryCreateInput(input: unknown): MemoryCreateInput {
    const source = readObject(input, 'input');
    const summaryText = readOptionalString(source.summaryText, 'summaryText');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const threadId =
        source.threadId !== undefined ? readEntityId(source.threadId, 'threadId', 'thr') : undefined;
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;
    const metadata = readMetadataRecord(source.metadata, 'metadata');

    return {
        profileId: readProfileId(source),
        memoryType: readEnumValue(source.memoryType, 'memoryType', memoryTypes),
        scopeKind: readEnumValue(source.scopeKind, 'scopeKind', memoryScopeKinds),
        createdByKind: readEnumValue(source.createdByKind, 'createdByKind', memoryCreatedByKinds),
        title: readString(source.title, 'title'),
        bodyMarkdown: readString(source.bodyMarkdown, 'bodyMarkdown'),
        ...(summaryText ? { summaryText } : {}),
        ...(metadata ? { metadata } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(threadId ? { threadId } : {}),
        ...(runId ? { runId } : {}),
    };
}

export function parseMemoryListInput(input: unknown): MemoryListInput {
    const source = readObject(input, 'input');
    const memoryType =
        source.memoryType !== undefined ? readEnumValue(source.memoryType, 'memoryType', memoryTypes) : undefined;
    const scopeKind =
        source.scopeKind !== undefined ? readEnumValue(source.scopeKind, 'scopeKind', memoryScopeKinds) : undefined;
    const state = source.state !== undefined ? readEnumValue(source.state, 'state', memoryStates) : undefined;
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const threadId =
        source.threadId !== undefined ? readEntityId(source.threadId, 'threadId', 'thr') : undefined;
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;

    return {
        profileId: readProfileId(source),
        ...(memoryType ? { memoryType } : {}),
        ...(scopeKind ? { scopeKind } : {}),
        ...(state ? { state } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(threadId ? { threadId } : {}),
        ...(runId ? { runId } : {}),
    };
}

export function parseMemoryByIdInput(input: unknown): MemoryByIdInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        memoryId: readEntityId(source.memoryId, 'memoryId', 'mem'),
    };
}

export function parseMemoryDisableInput(input: unknown): MemoryDisableInput {
    return parseMemoryByIdInput(input);
}

export function parseMemorySupersedeInput(input: unknown): MemorySupersedeInput {
    const source = readObject(input, 'input');
    const summaryText = readOptionalString(source.summaryText, 'summaryText');
    const metadata = readMetadataRecord(source.metadata, 'metadata');

    return {
        profileId: readProfileId(source),
        memoryId: readEntityId(source.memoryId, 'memoryId', 'mem'),
        createdByKind: readEnumValue(source.createdByKind, 'createdByKind', memoryCreatedByKinds),
        title: readString(source.title, 'title'),
        bodyMarkdown: readString(source.bodyMarkdown, 'bodyMarkdown'),
        ...(summaryText ? { summaryText } : {}),
        ...(metadata ? { metadata } : {}),
    };
}

export function parseMemoryProjectionContextInput(input: unknown): MemoryProjectionContextInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const worktreeId =
        source.worktreeId !== undefined ? readEntityId(source.worktreeId, 'worktreeId', 'wt') : undefined;
    const threadId =
        source.threadId !== undefined ? readEntityId(source.threadId, 'threadId', 'thr') : undefined;
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;
    const includeBroaderScopes = readOptionalBoolean(source.includeBroaderScopes, 'includeBroaderScopes');

    return {
        profileId: readProfileId(source),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(worktreeId ? { worktreeId } : {}),
        ...(threadId ? { threadId } : {}),
        ...(runId ? { runId } : {}),
        ...(includeBroaderScopes !== undefined ? { includeBroaderScopes } : {}),
    };
}

export function parseApplyMemoryEditProposalInput(input: unknown): ApplyMemoryEditProposalInput {
    const source = readObject(input, 'input');
    const context = parseMemoryProjectionContextInput(input);

    return {
        ...context,
        memoryId: readEntityId(source.memoryId, 'memoryId', 'mem'),
        observedContentHash: readString(source.observedContentHash, 'observedContentHash'),
        decision: readEnumValue(source.decision, 'decision', ['accept', 'reject'] as const),
    };
}

export const memoryCreateInputSchema = createParser(parseMemoryCreateInput);
export const memoryListInputSchema = createParser(parseMemoryListInput);
export const memoryByIdInputSchema = createParser(parseMemoryByIdInput);
export const memoryDisableInputSchema = createParser(parseMemoryDisableInput);
export const memorySupersedeInputSchema = createParser(parseMemorySupersedeInput);
export const memoryProjectionContextInputSchema = createParser(parseMemoryProjectionContextInput);
export const applyMemoryEditProposalInputSchema = createParser(parseApplyMemoryEditProposalInput);

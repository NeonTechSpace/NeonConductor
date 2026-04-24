import {
    memoryCreatedByKinds,
    memoryScopeKinds,
    memoryStates,
    memoryTypes,
} from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readArray,
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
    MemoryCanonicalBody,
    MemoryCanonicalBodySection,
    MemoryCreateInput,
    MemoryEvidenceCreateInput,
    MemoryDisableInput,
    MemoryListInput,
    MemoryProjectionContextInput,
    MemorySupersedeInput,
} from '@/app/backend/runtime/contracts/types';
import {
    memoryCanonicalBodySectionKinds,
    memoryEvidenceKinds,
    memoryRevisionReasons,
} from '@/app/backend/runtime/contracts/types/memory';

function readMetadataRecord(value: unknown, field: string): Record<string, unknown> | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readObject(value, field);
}

function readMemoryCanonicalBody(value: unknown, field: string): MemoryCanonicalBody | undefined {
    if (value === undefined) {
        return undefined;
    }

    const source = readObject(value, field);
    if (source.formatVersion !== 1) {
        throw new Error(`Invalid "${field}.formatVersion": expected 1.`);
    }

    const sections = readArray(source.sections, `${field}.sections`).map((item, index): MemoryCanonicalBodySection => {
        const section = readObject(item, `${field}.sections[${String(index)}]`);
        return {
            id: readString(section.id, `${field}.sections[${String(index)}].id`),
            kind: readEnumValue(
                section.kind,
                `${field}.sections[${String(index)}].kind`,
                memoryCanonicalBodySectionKinds
            ),
            heading: readString(section.heading, `${field}.sections[${String(index)}].heading`),
            items: readArray(section.items, `${field}.sections[${String(index)}].items`).map((entry, itemIndex) =>
                readString(entry, `${field}.sections[${String(index)}].items[${String(itemIndex)}]`)
            ),
        };
    });

    return {
        formatVersion: 1,
        sections,
    };
}

function readMemoryEvidenceArray(value: unknown, field: string): MemoryEvidenceCreateInput[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readArray(value, field).map((item, index) => {
        const source = readObject(item, `${field}[${String(index)}]`);
        const excerptText = readOptionalString(source.excerptText, `${field}[${String(index)}].excerptText`);
        const sourceRunId =
            source.sourceRunId !== undefined
                ? readEntityId(source.sourceRunId, `${field}[${String(index)}].sourceRunId`, 'run')
                : undefined;
        const sourceMessageId =
            source.sourceMessageId !== undefined
                ? readEntityId(source.sourceMessageId, `${field}[${String(index)}].sourceMessageId`, 'msg')
                : undefined;
        const sourceMessagePartId =
            source.sourceMessagePartId !== undefined
                ? readEntityId(source.sourceMessagePartId, `${field}[${String(index)}].sourceMessagePartId`, 'part')
                : undefined;
        const metadata = readMetadataRecord(source.metadata, `${field}[${String(index)}].metadata`);

        return {
            kind: readEnumValue(source.kind, `${field}[${String(index)}].kind`, memoryEvidenceKinds),
            label: readString(source.label, `${field}[${String(index)}].label`),
            ...(excerptText ? { excerptText } : {}),
            ...(sourceRunId ? { sourceRunId } : {}),
            ...(sourceMessageId ? { sourceMessageId } : {}),
            ...(sourceMessagePartId ? { sourceMessagePartId } : {}),
            ...(metadata ? { metadata } : {}),
        };
    });
}

export function parseMemoryCreateInput(input: unknown): MemoryCreateInput {
    const source = readObject(input, 'input');
    const summaryText = readOptionalString(source.summaryText, 'summaryText');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const threadId = source.threadId !== undefined ? readEntityId(source.threadId, 'threadId', 'thr') : undefined;
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;
    const temporalSubjectKey = readOptionalString(source.temporalSubjectKey, 'temporalSubjectKey');
    const metadata = readMetadataRecord(source.metadata, 'metadata');
    const evidence = readMemoryEvidenceArray(source.evidence, 'evidence');
    const canonicalBody = readMemoryCanonicalBody(source.canonicalBody, 'canonicalBody');

    return {
        profileId: readProfileId(source),
        memoryType: readEnumValue(source.memoryType, 'memoryType', memoryTypes),
        scopeKind: readEnumValue(source.scopeKind, 'scopeKind', memoryScopeKinds),
        createdByKind: readEnumValue(source.createdByKind, 'createdByKind', memoryCreatedByKinds),
        title: readString(source.title, 'title'),
        bodyMarkdown: readString(source.bodyMarkdown, 'bodyMarkdown'),
        ...(canonicalBody ? { canonicalBody } : {}),
        ...(summaryText ? { summaryText } : {}),
        ...(metadata ? { metadata } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(threadId ? { threadId } : {}),
        ...(runId ? { runId } : {}),
        ...(temporalSubjectKey ? { temporalSubjectKey } : {}),
        ...(evidence ? { evidence } : {}),
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
    const threadId = source.threadId !== undefined ? readEntityId(source.threadId, 'threadId', 'thr') : undefined;
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
    const evidence = readMemoryEvidenceArray(source.evidence, 'evidence');
    const revisionReason = readEnumValue(source.revisionReason, 'revisionReason', memoryRevisionReasons);
    const canonicalBody = readMemoryCanonicalBody(source.canonicalBody, 'canonicalBody');

    return {
        profileId: readProfileId(source),
        memoryId: readEntityId(source.memoryId, 'memoryId', 'mem'),
        createdByKind: readEnumValue(source.createdByKind, 'createdByKind', memoryCreatedByKinds),
        title: readString(source.title, 'title'),
        bodyMarkdown: readString(source.bodyMarkdown, 'bodyMarkdown'),
        ...(canonicalBody ? { canonicalBody } : {}),
        revisionReason,
        ...(summaryText ? { summaryText } : {}),
        ...(metadata ? { metadata } : {}),
        ...(evidence ? { evidence } : {}),
    };
}

export function parseMemoryProjectionContextInput(input: unknown): MemoryProjectionContextInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sandboxId = source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;
    const threadId = source.threadId !== undefined ? readEntityId(source.threadId, 'threadId', 'thr') : undefined;
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;
    const includeBroaderScopes = readOptionalBoolean(source.includeBroaderScopes, 'includeBroaderScopes');

    return {
        profileId: readProfileId(source),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
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

import {
    memoryCreatedByKinds,
    memoryRetentionClasses,
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
import { parsePromotionSource } from '@/app/backend/runtime/contracts/parsers/promotion';
import type {
    ApplyMemoryEditProposalInput,
    MemoryApplyReviewActionInput,
    MemoryByIdInput,
    MemoryCanonicalBody,
    MemoryCanonicalBodySection,
    MemoryCreateInput,
    MemoryEvidenceCreateInput,
    MemoryDisableInput,
    MemoryListInput,
    MemoryApplyPromotionInput,
    MemoryPreparePromotionInput,
    MemoryPromotionDraft,
    MemoryProjectionContextInput,
    MemoryReviewDetailsInput,
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

function readMemoryPromotionDraft(value: unknown): MemoryPromotionDraft {
    const source = readObject(value, 'draft');
    const summaryText = readOptionalString(source.summaryText, 'draft.summaryText');
    const metadata = readMetadataRecord(source.metadata, 'draft.metadata');
    const memoryRetentionClass =
        source.memoryRetentionClass !== undefined
            ? readEnumValue(source.memoryRetentionClass, 'draft.memoryRetentionClass', memoryRetentionClasses)
            : undefined;
    const retentionExpiresAt = readOptionalString(source.retentionExpiresAt, 'draft.retentionExpiresAt');
    const retentionPinnedAt = readOptionalString(source.retentionPinnedAt, 'draft.retentionPinnedAt');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'draft.workspaceFingerprint');
    const threadId =
        source.threadId !== undefined ? readEntityId(source.threadId, 'draft.threadId', 'thr') : undefined;

    return {
        target: readEnumValue(source.target, 'draft.target', ['memory'] as const),
        memoryType: readEnumValue(source.memoryType, 'draft.memoryType', memoryTypes),
        scopeKind: readEnumValue(source.scopeKind, 'draft.scopeKind', ['global', 'workspace', 'thread'] as const),
        title: readString(source.title, 'draft.title'),
        bodyMarkdown: readString(source.bodyMarkdown, 'draft.bodyMarkdown'),
        ...(summaryText ? { summaryText } : {}),
        ...(metadata ? { metadata } : {}),
        ...(memoryRetentionClass ? { memoryRetentionClass } : {}),
        ...(retentionExpiresAt ? { retentionExpiresAt } : {}),
        ...(retentionPinnedAt ? { retentionPinnedAt } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(threadId ? { threadId } : {}),
    };
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
    const memoryRetentionClass =
        source.memoryRetentionClass !== undefined
            ? readEnumValue(source.memoryRetentionClass, 'memoryRetentionClass', memoryRetentionClasses)
            : undefined;
    const retentionExpiresAt = readOptionalString(source.retentionExpiresAt, 'retentionExpiresAt');
    const retentionPinnedAt = readOptionalString(source.retentionPinnedAt, 'retentionPinnedAt');

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
        ...(memoryRetentionClass ? { memoryRetentionClass } : {}),
        ...(retentionExpiresAt ? { retentionExpiresAt } : {}),
        ...(retentionPinnedAt ? { retentionPinnedAt } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(threadId ? { threadId } : {}),
        ...(runId ? { runId } : {}),
        ...(temporalSubjectKey ? { temporalSubjectKey } : {}),
        ...(evidence ? { evidence } : {}),
    };
}

export function parseMemoryPreparePromotionInput(input: unknown): MemoryPreparePromotionInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    return {
        profileId: readProfileId(source),
        source: parsePromotionSource(source.source),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parseMemoryApplyPromotionInput(input: unknown): MemoryApplyPromotionInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        source: parsePromotionSource(source.source),
        sourceDigest: readString(source.sourceDigest, 'sourceDigest'),
        draft: readMemoryPromotionDraft(source.draft),
    };
}

export function parseMemoryListInput(input: unknown): MemoryListInput {
    const source = readObject(input, 'input');
    const memoryType =
        source.memoryType !== undefined ? readEnumValue(source.memoryType, 'memoryType', memoryTypes) : undefined;
    const scopeKind =
        source.scopeKind !== undefined ? readEnumValue(source.scopeKind, 'scopeKind', memoryScopeKinds) : undefined;
    const state = source.state !== undefined ? readEnumValue(source.state, 'state', memoryStates) : undefined;
    const memoryRetentionClass =
        source.memoryRetentionClass !== undefined
            ? readEnumValue(source.memoryRetentionClass, 'memoryRetentionClass', memoryRetentionClasses)
            : undefined;
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const threadId = source.threadId !== undefined ? readEntityId(source.threadId, 'threadId', 'thr') : undefined;
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;

    return {
        profileId: readProfileId(source),
        ...(memoryType ? { memoryType } : {}),
        ...(scopeKind ? { scopeKind } : {}),
        ...(state ? { state } : {}),
        ...(memoryRetentionClass ? { memoryRetentionClass } : {}),
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

export function parseMemoryReviewDetailsInput(input: unknown): MemoryReviewDetailsInput {
    return parseMemoryByIdInput(input);
}

export function parseMemoryApplyReviewActionInput(input: unknown): MemoryApplyReviewActionInput {
    const source = readObject(input, 'input');
    const base = {
        profileId: readProfileId(source),
        memoryId: readEntityId(source.memoryId, 'memoryId', 'mem'),
        expectedUpdatedAt: readString(source.expectedUpdatedAt, 'expectedUpdatedAt'),
    };
    const action = readEnumValue(source.action, 'action', ['update', 'supersede', 'forget'] as const);

    if (action === 'forget') {
        return {
            ...base,
            action,
        };
    }

    const summaryText = readOptionalString(source.summaryText, 'summaryText');
    const canonicalBody = readMemoryCanonicalBody(source.canonicalBody, 'canonicalBody');
    if (action === 'update') {
        return {
            ...base,
            action,
            title: readString(source.title, 'title'),
            bodyMarkdown: readString(source.bodyMarkdown, 'bodyMarkdown'),
            ...(canonicalBody ? { canonicalBody } : {}),
            ...(summaryText ? { summaryText } : {}),
        };
    }

    return {
        ...base,
        action,
        title: readString(source.title, 'title'),
        bodyMarkdown: readString(source.bodyMarkdown, 'bodyMarkdown'),
        ...(canonicalBody ? { canonicalBody } : {}),
        ...(summaryText ? { summaryText } : {}),
        revisionReason: readEnumValue(source.revisionReason, 'revisionReason', [
            'correction',
            'refinement',
            'deprecation',
        ] as const),
    };
}

export function parseMemorySupersedeInput(input: unknown): MemorySupersedeInput {
    const source = readObject(input, 'input');
    const summaryText = readOptionalString(source.summaryText, 'summaryText');
    const metadata = readMetadataRecord(source.metadata, 'metadata');
    const evidence = readMemoryEvidenceArray(source.evidence, 'evidence');
    const revisionReason = readEnumValue(source.revisionReason, 'revisionReason', memoryRevisionReasons);
    const canonicalBody = readMemoryCanonicalBody(source.canonicalBody, 'canonicalBody');
    const memoryRetentionClass =
        source.memoryRetentionClass !== undefined
            ? readEnumValue(source.memoryRetentionClass, 'memoryRetentionClass', memoryRetentionClasses)
            : undefined;
    const retentionExpiresAt = readOptionalString(source.retentionExpiresAt, 'retentionExpiresAt');
    const retentionPinnedAt = readOptionalString(source.retentionPinnedAt, 'retentionPinnedAt');
    const retentionSupersedenceRationale = readOptionalString(
        source.retentionSupersedenceRationale,
        'retentionSupersedenceRationale'
    );

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
        ...(memoryRetentionClass ? { memoryRetentionClass } : {}),
        ...(retentionExpiresAt ? { retentionExpiresAt } : {}),
        ...(retentionPinnedAt ? { retentionPinnedAt } : {}),
        ...(retentionSupersedenceRationale ? { retentionSupersedenceRationale } : {}),
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
export const memoryPreparePromotionInputSchema = createParser(parseMemoryPreparePromotionInput);
export const memoryApplyPromotionInputSchema = createParser(parseMemoryApplyPromotionInput);
export const memoryListInputSchema = createParser(parseMemoryListInput);
export const memoryByIdInputSchema = createParser(parseMemoryByIdInput);
export const memoryDisableInputSchema = createParser(parseMemoryDisableInput);
export const memoryReviewDetailsInputSchema = createParser(parseMemoryReviewDetailsInput);
export const memoryApplyReviewActionInputSchema = createParser(parseMemoryApplyReviewActionInput);
export const memorySupersedeInputSchema = createParser(parseMemorySupersedeInput);
export const memoryProjectionContextInputSchema = createParser(parseMemoryProjectionContextInput);
export const applyMemoryEditProposalInputSchema = createParser(parseApplyMemoryEditProposalInput);

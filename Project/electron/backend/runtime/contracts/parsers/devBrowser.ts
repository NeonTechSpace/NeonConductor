import { createParser, readArray, readEntityId, readEnumValue, readObject, readOptionalNumber, readOptionalString, readString } from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    BrowserCommentDraft,
    BrowserCommentPacket,
    BrowserCommentPacketComment,
    BrowserContextSummary,
    BrowserSelectionAncestryEntry,
    BrowserSelectionBounds,
    BrowserSelectionRecord,
    BrowserSelectionSelectorSnapshot,
    BrowserSelectionSnapshotInput,
    DevBrowserCurrentPage,
    DevBrowserTarget,
    DevBrowserTargetDraft,
    DevBrowserValidation,
    SessionBuildBrowserCommentPacketInput,
    SessionClearStaleBrowserContextInput,
    SessionControlDevBrowserInput,
    SessionCreateBrowserCommentDraftInput,
    SessionDeleteBrowserCommentDraftInput,
    SessionDevBrowserStateInput,
    SessionMoveBrowserCommentDraftInput,
    SessionPersistBrowserSelectionInput,
    SessionSetBrowserCommentDraftInclusionInput,
    SessionSetDevBrowserPickerInput,
    SessionSetDevBrowserTargetInput,
    SessionUpdateBrowserCommentDraftInput,
} from '@/app/backend/runtime/contracts/types/devBrowser';
import {
    browserCommentDraftInclusionStates,
    devBrowserAvailabilityStates,
    devBrowserBlockedReasonCodes,
    devBrowserControlActions,
    devBrowserEnrichmentModes,
    devBrowserTargetSchemes,
    devBrowserTargetSourceKinds,
    devBrowserValidationSources,
    devBrowserValidationStatuses,
} from '@/app/backend/runtime/contracts/types/devBrowser';
import { readProfileId } from '@/app/backend/runtime/contracts/parsers/helpers';

function readNonNegativeNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid "${field}": expected non-negative number.`);
    }
    return value;
}

function readOptionalPort(value: unknown, field: string): number | undefined {
    const port = readOptionalNumber(value, field);
    if (port === undefined) {
        return undefined;
    }
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid "${field}": expected TCP port between 1 and 65535.`);
    }
    return port;
}

function parseBrowserSelectionBounds(value: unknown, field: string): BrowserSelectionBounds {
    const source = readObject(value, field);
    return {
        x: readNonNegativeNumber(source.x, `${field}.x`),
        y: readNonNegativeNumber(source.y, `${field}.y`),
        width: readNonNegativeNumber(source.width, `${field}.width`),
        height: readNonNegativeNumber(source.height, `${field}.height`),
    };
}

function parseBrowserSelectionSelectorSnapshot(value: unknown, field: string): BrowserSelectionSelectorSnapshot {
    const source = readObject(value, field);
    return {
        primary: readString(source.primary, `${field}.primary`),
        path: readArray(source.path, `${field}.path`).map((item, index) => readString(item, `${field}.path[${String(index)}]`)),
    };
}

function parseBrowserSelectionAncestryEntry(value: unknown, field: string): BrowserSelectionAncestryEntry {
    const source = readObject(value, field);
    const accessibleLabel = readOptionalString(source.accessibleLabel, `${field}.accessibleLabel`);
    const accessibleRole = readOptionalString(source.accessibleRole, `${field}.accessibleRole`);
    return {
        tagName: readString(source.tagName, `${field}.tagName`),
        selector: readString(source.selector, `${field}.selector`),
        ...(accessibleLabel ? { accessibleLabel } : {}),
        ...(accessibleRole ? { accessibleRole } : {}),
    };
}

function parseDevBrowserCurrentPage(value: unknown, field: string): DevBrowserCurrentPage {
    const source = readObject(value, field);
    const title = readOptionalString(source.title, `${field}.title`);
    return {
        url: readString(source.url, `${field}.url`),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        ...(title ? { title } : {}),
        isLoading: source.isLoading === true,
        canGoBack: source.canGoBack === true,
        canGoForward: source.canGoForward === true,
    };
}

function parseDevBrowserValidation(value: unknown, field: string): DevBrowserValidation {
    const source = readObject(value, field);
    const normalizedUrl = readOptionalString(source.normalizedUrl, `${field}.normalizedUrl`);
    const blockedReasonCode =
        source.blockedReasonCode !== undefined
            ? readEnumValue(source.blockedReasonCode, `${field}.blockedReasonCode`, devBrowserBlockedReasonCodes)
            : undefined;
    const blockedReasonMessage = readOptionalString(source.blockedReasonMessage, `${field}.blockedReasonMessage`);
    const attemptedUrl = readOptionalString(source.attemptedUrl, `${field}.attemptedUrl`);
    const validationSource =
        source.source !== undefined ? readEnumValue(source.source, `${field}.source`, devBrowserValidationSources) : undefined;

    return {
        status: readEnumValue(source.status, `${field}.status`, devBrowserValidationStatuses),
        ...(normalizedUrl ? { normalizedUrl } : {}),
        resolvedAddresses: readArray(source.resolvedAddresses ?? [], `${field}.resolvedAddresses`).map((item, index) =>
            readString(item, `${field}.resolvedAddresses[${String(index)}]`)
        ),
        ...(blockedReasonCode ? { blockedReasonCode } : {}),
        ...(blockedReasonMessage ? { blockedReasonMessage } : {}),
        ...(attemptedUrl ? { attemptedUrl } : {}),
        ...(validationSource ? { source: validationSource } : {}),
    };
}

export function parseDevBrowserTargetDraft(value: unknown, field: string): DevBrowserTargetDraft {
    const source = readObject(value, field);
    const port = readOptionalPort(source.port, `${field}.port`);
    return {
        scheme: readEnumValue(source.scheme, `${field}.scheme`, devBrowserTargetSchemes),
        host: readString(source.host, `${field}.host`),
        ...(port !== undefined ? { port } : {}),
        path: readString(source.path, `${field}.path`),
        sourceKind:
            source.sourceKind !== undefined
                ? readEnumValue(source.sourceKind, `${field}.sourceKind`, devBrowserTargetSourceKinds)
                : 'manual',
    };
}

export function parseDevBrowserTarget(value: unknown, field: string): DevBrowserTarget {
    const source = readObject(value, field);
    const currentPage =
        source.currentPage !== undefined ? parseDevBrowserCurrentPage(source.currentPage, `${field}.currentPage`) : undefined;
    return {
        ...parseDevBrowserTargetDraft(source, field),
        validation: parseDevBrowserValidation(source.validation, `${field}.validation`),
        browserAvailability: readEnumValue(
            source.browserAvailability,
            `${field}.browserAvailability`,
            devBrowserAvailabilityStates
        ),
        ...(currentPage ? { currentPage } : {}),
    };
}

export function parseBrowserSelectionSnapshotInput(value: unknown, field: string): BrowserSelectionSnapshotInput {
    const source = readObject(value, field);
    const pageTitle = readOptionalString(source.pageTitle, `${field}.pageTitle`);
    const accessibleLabel = readOptionalString(source.accessibleLabel, `${field}.accessibleLabel`);
    const accessibleRole = readOptionalString(source.accessibleRole, `${field}.accessibleRole`);
    const textExcerpt = readOptionalString(source.textExcerpt, `${field}.textExcerpt`);
    const cropAttachmentId =
        source.cropAttachmentId !== undefined
            ? readEntityId(source.cropAttachmentId, `${field}.cropAttachmentId`, 'att')
            : undefined;

    return {
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        pageUrl: readString(source.pageUrl, `${field}.pageUrl`),
        ...(pageTitle ? { pageTitle } : {}),
        selector: parseBrowserSelectionSelectorSnapshot(source.selector, `${field}.selector`),
        ancestryTrail: readArray(source.ancestryTrail, `${field}.ancestryTrail`).map((item, index) =>
            parseBrowserSelectionAncestryEntry(item, `${field}.ancestryTrail[${String(index)}]`)
        ),
        ...(accessibleLabel ? { accessibleLabel } : {}),
        ...(accessibleRole ? { accessibleRole } : {}),
        ...(textExcerpt ? { textExcerpt } : {}),
        bounds: parseBrowserSelectionBounds(source.bounds, `${field}.bounds`),
        ...(cropAttachmentId ? { cropAttachmentId } : {}),
        enrichmentMode: readEnumValue(source.enrichmentMode, `${field}.enrichmentMode`, devBrowserEnrichmentModes),
    };
}

export function parseBrowserSelectionRecord(value: unknown, field: string): BrowserSelectionRecord {
    const source = readObject(value, field);
    const createdAt = readString(source.createdAt, `${field}.createdAt`);
    return {
        id: readEntityId(source.id, `${field}.id`, 'bsel'),
        ...parseBrowserSelectionSnapshotInput(source, field),
        stale: source.stale === true,
        createdAt,
    };
}

export function parseBrowserCommentDraft(value: unknown, field: string): BrowserCommentDraft {
    const source = readObject(value, field);
    return {
        id: readEntityId(source.id, `${field}.id`, 'bcmt'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        commentText: readString(source.commentText, `${field}.commentText`),
        inclusionState: readEnumValue(source.inclusionState, `${field}.inclusionState`, browserCommentDraftInclusionStates),
        sequence: readNonNegativeNumber(source.sequence, `${field}.sequence`),
        stale: source.stale === true,
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        updatedAt: readString(source.updatedAt, `${field}.updatedAt`),
    };
}

function parseBrowserCommentPacketComment(value: unknown, field: string): BrowserCommentPacketComment {
    const source = readObject(value, field);
    return {
        draftId: readEntityId(source.draftId, `${field}.draftId`, 'bcmt'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        commentText: readString(source.commentText, `${field}.commentText`),
        sequence: readNonNegativeNumber(source.sequence, `${field}.sequence`),
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        updatedAt: readString(source.updatedAt, `${field}.updatedAt`),
    };
}

export function parseBrowserContextSummary(value: unknown, field: string): BrowserContextSummary {
    const source = readObject(value, field);
    return {
        targetUrl: readString(source.targetUrl, `${field}.targetUrl`),
        targetLabel: readString(source.targetLabel, `${field}.targetLabel`),
        selectedElementCount: readNonNegativeNumber(source.selectedElementCount, `${field}.selectedElementCount`),
        commentCount: readNonNegativeNumber(source.commentCount, `${field}.commentCount`),
        captureCount: readNonNegativeNumber(source.captureCount, `${field}.captureCount`),
        enrichmentMode: readEnumValue(source.enrichmentMode, `${field}.enrichmentMode`, devBrowserEnrichmentModes),
        digest: readString(source.digest, `${field}.digest`),
    };
}

export function parseBrowserCommentPacket(value: unknown, field: string): BrowserCommentPacket {
    const source = readObject(value, field);
    return {
        target: parseDevBrowserTarget(source.target, `${field}.target`),
        selections: readArray(source.selections, `${field}.selections`).map((item, index) =>
            parseBrowserSelectionRecord(item, `${field}.selections[${String(index)}]`)
        ),
        comments: readArray(source.comments, `${field}.comments`).map((item, index) =>
            parseBrowserCommentPacketComment(item, `${field}.comments[${String(index)}]`)
        ),
        cropAttachmentIds: readArray(source.cropAttachmentIds ?? [], `${field}.cropAttachmentIds`).map((item, index) =>
            readEntityId(item, `${field}.cropAttachmentIds[${String(index)}]`, 'att')
        ),
        enrichmentMode: readEnumValue(source.enrichmentMode, `${field}.enrichmentMode`, devBrowserEnrichmentModes),
    };
}

function parseSessionDevBrowserStateInputBase(input: unknown): SessionDevBrowserStateInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
    };
}

export function parseSessionDevBrowserStateInput(input: unknown): SessionDevBrowserStateInput {
    return parseSessionDevBrowserStateInputBase(input);
}

export function parseSessionSetDevBrowserTargetInput(input: unknown): SessionSetDevBrowserTargetInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        target: parseDevBrowserTargetDraft(source.target, 'target'),
    };
}

export function parseSessionControlDevBrowserInput(input: unknown): SessionControlDevBrowserInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        action: readEnumValue(source.action, 'action', devBrowserControlActions),
    };
}

export function parseSessionSetDevBrowserPickerInput(input: unknown): SessionSetDevBrowserPickerInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        active: source.active === true,
    };
}

export function parseSessionPersistBrowserSelectionInput(input: unknown): SessionPersistBrowserSelectionInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        selection: parseBrowserSelectionSnapshotInput(source.selection, 'selection'),
    };
}

export function parseSessionCreateBrowserCommentDraftInput(input: unknown): SessionCreateBrowserCommentDraftInput {
    const source = readObject(input, 'input');
    const inclusionState =
        source.inclusionState !== undefined
            ? readEnumValue(source.inclusionState, 'inclusionState', browserCommentDraftInclusionStates)
            : undefined;
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        selectionId: readEntityId(source.selectionId, 'selectionId', 'bsel'),
        commentText: readString(source.commentText, 'commentText'),
        ...(inclusionState ? { inclusionState } : {}),
    };
}

export function parseSessionUpdateBrowserCommentDraftInput(input: unknown): SessionUpdateBrowserCommentDraftInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        draftId: readEntityId(source.draftId, 'draftId', 'bcmt'),
        commentText: readString(source.commentText, 'commentText'),
    };
}

export function parseSessionDeleteBrowserCommentDraftInput(input: unknown): SessionDeleteBrowserCommentDraftInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        draftId: readEntityId(source.draftId, 'draftId', 'bcmt'),
    };
}

export function parseSessionMoveBrowserCommentDraftInput(input: unknown): SessionMoveBrowserCommentDraftInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        draftId: readEntityId(source.draftId, 'draftId', 'bcmt'),
        direction: readEnumValue(source.direction, 'direction', ['up', 'down'] as const),
    };
}

export function parseSessionSetBrowserCommentDraftInclusionInput(
    input: unknown
): SessionSetBrowserCommentDraftInclusionInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        draftId: readEntityId(source.draftId, 'draftId', 'bcmt'),
        inclusionState: readEnumValue(source.inclusionState, 'inclusionState', browserCommentDraftInclusionStates),
    };
}

export function parseSessionClearStaleBrowserContextInput(input: unknown): SessionClearStaleBrowserContextInput {
    return parseSessionDevBrowserStateInputBase(input);
}

export function parseSessionBuildBrowserCommentPacketInput(input: unknown): SessionBuildBrowserCommentPacketInput {
    const source = readObject(input, 'input');
    const draftIds =
        source.draftIds !== undefined
            ? readArray(source.draftIds, 'draftIds').map((item, index) => readEntityId(item, `draftIds[${String(index)}]`, 'bcmt'))
            : undefined;
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        ...(draftIds ? { draftIds } : {}),
    };
}

export const sessionDevBrowserStateInputSchema = createParser(parseSessionDevBrowserStateInput);
export const sessionSetDevBrowserTargetInputSchema = createParser(parseSessionSetDevBrowserTargetInput);
export const sessionControlDevBrowserInputSchema = createParser(parseSessionControlDevBrowserInput);
export const sessionSetDevBrowserPickerInputSchema = createParser(parseSessionSetDevBrowserPickerInput);
export const sessionPersistBrowserSelectionInputSchema = createParser(parseSessionPersistBrowserSelectionInput);
export const sessionCreateBrowserCommentDraftInputSchema = createParser(parseSessionCreateBrowserCommentDraftInput);
export const sessionUpdateBrowserCommentDraftInputSchema = createParser(parseSessionUpdateBrowserCommentDraftInput);
export const sessionDeleteBrowserCommentDraftInputSchema = createParser(parseSessionDeleteBrowserCommentDraftInput);
export const sessionMoveBrowserCommentDraftInputSchema = createParser(parseSessionMoveBrowserCommentDraftInput);
export const sessionSetBrowserCommentDraftInclusionInputSchema = createParser(
    parseSessionSetBrowserCommentDraftInclusionInput
);
export const sessionClearStaleBrowserContextInputSchema = createParser(parseSessionClearStaleBrowserContextInput);
export const sessionBuildBrowserCommentPacketInputSchema = createParser(parseSessionBuildBrowserCommentPacketInput);

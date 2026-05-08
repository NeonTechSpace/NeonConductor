import {
    createParser,
    parseRuntimeRunOptions,
    readArray,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalNumber,
    readOptionalString,
    readProfileId,
    readProviderId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import { topLevelTabs } from '@/app/backend/runtime/contracts/enums';
import type {
    BrowserCommentDraft,
    BrowserContextPacket,
    BrowserContextPacketComment,
    BrowserContextPacketDesignerDraft,
    BrowserContextSummary,
    BrowserDesignQualityFinding,
    BrowserDesignerAnnotation,
    BrowserDesignerAnnotationGeometry,
    BrowserDesignerDraft,
    BrowserDesignerLiveSession,
    BrowserDesignerStylePatchSet,
    BrowserDesignerVariant,
    BrowserSelectionAncestryEntry,
    BrowserSelectionBounds,
    BrowserSelectionReactComponentIdentity,
    BrowserSelectionReactEnrichment,
    BrowserSelectionRecord,
    BrowserSelectionSelectorSnapshot,
    BrowserSelectionSnapshotInput,
    BrowserSelectionSourceAnchor,
    DevBrowserCurrentPage,
    DevBrowserTarget,
    DevBrowserTargetDraft,
    DevBrowserValidation,
    DevBrowserValidatedTargetBinding,
    SessionBuildBrowserContextPacketInput,
    SessionClearStaleBrowserContextInput,
    SessionControlDevBrowserInput,
    SessionAcceptBrowserDesignerVariantInput,
    SessionActivateBrowserDesignerVariantInput,
    SessionCreateBrowserCommentDraftInput,
    SessionCreateBrowserDesignerAnnotationInput,
    SessionCreateBrowserDesignerLiveSessionInput,
    SessionDeleteBrowserCommentDraftInput,
    SessionDeleteBrowserDesignerDraftInput,
    SessionDevBrowserStateInput,
    SessionDiscardBrowserDesignerVariantInput,
    SessionMoveBrowserCommentDraftInput,
    SessionPersistBrowserSelectionInput,
    SessionQueueBrowserDesignerApplyIntentInput,
    SessionSetBrowserCommentDraftInclusionInput,
    SessionSetBrowserDesignerDraftInclusionInput,
    SessionSetDevBrowserPickerInput,
    SessionSetDevBrowserTargetInput,
    SessionStartBrowserDesignerVariantGenerationInput,
    SessionTuneBrowserDesignerVariantInput,
    SessionUpdateBrowserCommentDraftInput,
    SessionUpsertBrowserDesignerDraftInput,
} from '@/app/backend/runtime/contracts/types/devBrowser';
import {
    browserDesignQualityFindingCategories,
    browserDesignQualityFindingScopes,
    browserDesignQualityFindingSeverities,
    browserCommentDraftInclusionStates,
    browserContextSummaryDesignerApplyIntentStatuses,
    browserDesignerActionChips,
    browserDesignerAnnotationKinds,
    browserDesignerApplyModes,
    browserDesignerApplyStatuses,
    browserDesignerGenerationStatuses,
    browserDesignerStylePropertyKeys,
    browserDesignerVariantStatuses,
    browserSelectionReactSourceKinds,
    browserSelectionSourceAnchorStatuses,
    devBrowserAvailabilityStates,
    devBrowserBlockedReasonCodes,
    devBrowserControlActions,
    devBrowserEnrichmentModes,
    devBrowserTargetSchemes,
    devBrowserTargetSourceKinds,
    devBrowserValidationSources,
    devBrowserValidationStatuses,
} from '@/app/backend/runtime/contracts/types/devBrowser';

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
        path: readArray(source.path, `${field}.path`).map((item, index) =>
            readString(item, `${field}.path[${String(index)}]`)
        ),
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

function parseBrowserSelectionSourceAnchor(value: unknown, field: string): BrowserSelectionSourceAnchor {
    const source = readObject(value, field);
    const line = readOptionalNumber(source.line, `${field}.line`);
    const column = readOptionalNumber(source.column, `${field}.column`);
    const workspaceFingerprint =
        source.workspaceFingerprint !== undefined
            ? readEntityId(source.workspaceFingerprint, `${field}.workspaceFingerprint`, 'ws')
            : undefined;
    const relativePath = readOptionalString(source.relativePath, `${field}.relativePath`);
    return {
        status: readEnumValue(source.status, `${field}.status`, browserSelectionSourceAnchorStatuses),
        displayPath: readString(source.displayPath, `${field}.displayPath`),
        ...(line !== undefined ? { line } : {}),
        ...(column !== undefined ? { column } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(relativePath ? { relativePath } : {}),
    };
}

function parseBrowserSelectionReactComponentIdentity(
    value: unknown,
    field: string
): BrowserSelectionReactComponentIdentity {
    const source = readObject(value, field);
    return {
        displayName: readString(source.displayName, `${field}.displayName`),
    };
}

function parseBrowserSelectionReactEnrichment(value: unknown, field: string): BrowserSelectionReactEnrichment {
    const source = readObject(value, field);
    const sourceAnchor =
        source.sourceAnchor !== undefined
            ? parseBrowserSelectionSourceAnchor(source.sourceAnchor, `${field}.sourceAnchor`)
            : undefined;
    return {
        sourceKind: readEnumValue(source.sourceKind, `${field}.sourceKind`, browserSelectionReactSourceKinds),
        componentChain: readArray(source.componentChain, `${field}.componentChain`).map((item, index) =>
            parseBrowserSelectionReactComponentIdentity(item, `${field}.componentChain[${String(index)}]`)
        ),
        ...(sourceAnchor ? { sourceAnchor } : {}),
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

function parseDevBrowserValidatedTargetBinding(value: unknown, field: string): DevBrowserValidatedTargetBinding {
    const source = readObject(value, field);
    const port = readOptionalPort(source.port, `${field}.port`);
    return {
        normalizedUrl: readString(source.normalizedUrl, `${field}.normalizedUrl`),
        host: readString(source.host, `${field}.host`),
        ...(port !== undefined ? { port } : {}),
        resolvedAddresses: readArray(source.resolvedAddresses ?? [], `${field}.resolvedAddresses`).map((item, index) =>
            readString(item, `${field}.resolvedAddresses[${String(index)}]`)
        ),
    };
}

function parseDevBrowserValidation(value: unknown, field: string): DevBrowserValidation {
    const source = readObject(value, field);
    const normalizedUrl = readOptionalString(source.normalizedUrl, `${field}.normalizedUrl`);
    const binding =
        source.binding !== undefined
            ? parseDevBrowserValidatedTargetBinding(source.binding, `${field}.binding`)
            : undefined;
    const blockedReasonCode =
        source.blockedReasonCode !== undefined
            ? readEnumValue(source.blockedReasonCode, `${field}.blockedReasonCode`, devBrowserBlockedReasonCodes)
            : undefined;
    const blockedReasonMessage = readOptionalString(source.blockedReasonMessage, `${field}.blockedReasonMessage`);
    const attemptedUrl = readOptionalString(source.attemptedUrl, `${field}.attemptedUrl`);
    const validationSource =
        source.source !== undefined
            ? readEnumValue(source.source, `${field}.source`, devBrowserValidationSources)
            : undefined;

    return {
        status: readEnumValue(source.status, `${field}.status`, devBrowserValidationStatuses),
        ...(normalizedUrl ? { normalizedUrl } : {}),
        ...(binding ? { binding } : {}),
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
        source.currentPage !== undefined
            ? parseDevBrowserCurrentPage(source.currentPage, `${field}.currentPage`)
            : undefined;
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

function parseBrowserDesignerStylePatchSet(value: unknown, field: string): BrowserDesignerStylePatchSet {
    const source = readObject(value, field);
    const allowedKeys = new Set<string>(browserDesignerStylePropertyKeys);
    const next: BrowserDesignerStylePatchSet = {};
    for (const [key, rawValue] of Object.entries(source)) {
        if (!allowedKeys.has(key)) {
            throw new Error(`Invalid "${field}.${key}": unsupported browser designer property.`);
        }
        next[key as keyof BrowserDesignerStylePatchSet] = readString(rawValue, `${field}.${key}`);
    }
    return next;
}

function parseBrowserDesignerAnnotationGeometry(value: unknown, field: string): BrowserDesignerAnnotationGeometry {
    const source = readObject(value, field);
    const width = readOptionalNumber(source.width, `${field}.width`);
    const height = readOptionalNumber(source.height, `${field}.height`);
    const points =
        source.points !== undefined
            ? readArray(source.points, `${field}.points`).map((item, index) => {
                  const point = readObject(item, `${field}.points[${String(index)}]`);
                  return {
                      x: readNonNegativeNumber(point.x, `${field}.points[${String(index)}].x`),
                      y: readNonNegativeNumber(point.y, `${field}.points[${String(index)}].y`),
                  };
              })
            : undefined;
    return {
        x: readNonNegativeNumber(source.x, `${field}.x`),
        y: readNonNegativeNumber(source.y, `${field}.y`),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(points ? { points } : {}),
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
    const reactEnrichment =
        source.reactEnrichment !== undefined
            ? parseBrowserSelectionReactEnrichment(source.reactEnrichment, `${field}.reactEnrichment`)
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
        ...(reactEnrichment ? { reactEnrichment } : {}),
    };
}

export function parseBrowserSelectionRecord(value: unknown, field: string): BrowserSelectionRecord {
    const source = readObject(value, field);
    return {
        id: readEntityId(source.id, `${field}.id`, 'bsel'),
        ...parseBrowserSelectionSnapshotInput(source, field),
        stale: source.stale === true,
        createdAt: readString(source.createdAt, `${field}.createdAt`),
    };
}

export function parseBrowserCommentDraft(value: unknown, field: string): BrowserCommentDraft {
    const source = readObject(value, field);
    return {
        id: readEntityId(source.id, `${field}.id`, 'bcmt'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        commentText: readString(source.commentText, `${field}.commentText`),
        inclusionState: readEnumValue(
            source.inclusionState,
            `${field}.inclusionState`,
            browserCommentDraftInclusionStates
        ),
        sequence: readNonNegativeNumber(source.sequence, `${field}.sequence`),
        stale: source.stale === true,
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        updatedAt: readString(source.updatedAt, `${field}.updatedAt`),
    };
}

export function parseBrowserDesignerDraft(value: unknown, field: string): BrowserDesignerDraft {
    const source = readObject(value, field);
    const blockedReasonMessage = readOptionalString(source.blockedReasonMessage, `${field}.blockedReasonMessage`);
    const textContentOverride = readOptionalString(source.textContentOverride, `${field}.textContentOverride`);
    const sourceVariantId =
        source.sourceVariantId !== undefined
            ? readEntityId(source.sourceVariantId, `${field}.sourceVariantId`, 'bdvar')
            : undefined;
    return {
        id: readEntityId(source.id, `${field}.id`, 'bdsn'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        ...(sourceVariantId ? { sourceVariantId } : {}),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        inclusionState: readEnumValue(
            source.inclusionState,
            `${field}.inclusionState`,
            browserCommentDraftInclusionStates
        ),
        applyMode: readEnumValue(source.applyMode, `${field}.applyMode`, browserDesignerApplyModes),
        applyStatus: readEnumValue(source.applyStatus, `${field}.applyStatus`, browserDesignerApplyStatuses),
        ...(blockedReasonMessage ? { blockedReasonMessage } : {}),
        stylePatches: parseBrowserDesignerStylePatchSet(source.stylePatches ?? {}, `${field}.stylePatches`),
        ...(textContentOverride ? { textContentOverride } : {}),
        stale: source.stale === true,
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        updatedAt: readString(source.updatedAt, `${field}.updatedAt`),
    };
}

export function parseBrowserDesignerLiveSession(value: unknown, field: string): BrowserDesignerLiveSession {
    const source = readObject(value, field);
    const actionChip =
        source.actionChip !== undefined
            ? readEnumValue(source.actionChip, `${field}.actionChip`, browserDesignerActionChips)
            : undefined;
    const activeVariantId =
        source.activeVariantId !== undefined
            ? readEntityId(source.activeVariantId, `${field}.activeVariantId`, 'bdvar')
            : undefined;
    const acceptedVariantId =
        source.acceptedVariantId !== undefined
            ? readEntityId(source.acceptedVariantId, `${field}.acceptedVariantId`, 'bdvar')
            : undefined;
    const generationRunId =
        source.generationRunId !== undefined
            ? readEntityId(source.generationRunId, `${field}.generationRunId`, 'run')
            : undefined;
    const errorMessage = readOptionalString(source.errorMessage, `${field}.errorMessage`);
    return {
        id: readEntityId(source.id, `${field}.id`, 'bdsess'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        ...(actionChip ? { actionChip } : {}),
        intentText: readString(source.intentText, `${field}.intentText`),
        requestedVariantCount: readNonNegativeNumber(source.requestedVariantCount, `${field}.requestedVariantCount`),
        generationStatus: readEnumValue(
            source.generationStatus,
            `${field}.generationStatus`,
            browserDesignerGenerationStatuses
        ),
        ...(activeVariantId ? { activeVariantId } : {}),
        ...(acceptedVariantId ? { acceptedVariantId } : {}),
        ...(generationRunId ? { generationRunId } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        stale: source.stale === true,
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        updatedAt: readString(source.updatedAt, `${field}.updatedAt`),
    };
}

export function parseBrowserDesignerAnnotation(value: unknown, field: string): BrowserDesignerAnnotation {
    const source = readObject(value, field);
    const text = readOptionalString(source.text, `${field}.text`);
    const cropAttachmentId =
        source.cropAttachmentId !== undefined
            ? readEntityId(source.cropAttachmentId, `${field}.cropAttachmentId`, 'att')
            : undefined;
    return {
        id: readEntityId(source.id, `${field}.id`, 'bdann'),
        designerSessionId: readEntityId(source.designerSessionId, `${field}.designerSessionId`, 'bdsess'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        kind: readEnumValue(source.kind, `${field}.kind`, browserDesignerAnnotationKinds),
        ...(text ? { text } : {}),
        geometry: parseBrowserDesignerAnnotationGeometry(source.geometry, `${field}.geometry`),
        ...(cropAttachmentId ? { cropAttachmentId } : {}),
        sequence: readNonNegativeNumber(source.sequence, `${field}.sequence`),
        stale: source.stale === true,
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        updatedAt: readString(source.updatedAt, `${field}.updatedAt`),
    };
}

export function parseBrowserDesignerVariant(value: unknown, field: string): BrowserDesignerVariant {
    const source = readObject(value, field);
    const textContentOverride = readOptionalString(source.textContentOverride, `${field}.textContentOverride`);
    return {
        id: readEntityId(source.id, `${field}.id`, 'bdvar'),
        designerSessionId: readEntityId(source.designerSessionId, `${field}.designerSessionId`, 'bdsess'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        name: readString(source.name, `${field}.name`),
        summaryMarkdown: readString(source.summaryMarkdown, `${field}.summaryMarkdown`),
        rationaleMarkdown: readString(source.rationaleMarkdown, `${field}.rationaleMarkdown`),
        stylePatches: parseBrowserDesignerStylePatchSet(source.stylePatches ?? {}, `${field}.stylePatches`),
        ...(textContentOverride ? { textContentOverride } : {}),
        status: readEnumValue(source.status, `${field}.status`, browserDesignerVariantStatuses),
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        updatedAt: readString(source.updatedAt, `${field}.updatedAt`),
    };
}

export function parseBrowserDesignQualityFinding(value: unknown, field: string): BrowserDesignQualityFinding {
    const source = readObject(value, field);
    const evidence = readOptionalString(source.evidence, `${field}.evidence`);
    const selectionId =
        source.selectionId !== undefined ? readEntityId(source.selectionId, `${field}.selectionId`, 'bsel') : undefined;
    const designerSessionId =
        source.designerSessionId !== undefined
            ? readEntityId(source.designerSessionId, `${field}.designerSessionId`, 'bdsess')
            : undefined;
    const variantId =
        source.variantId !== undefined ? readEntityId(source.variantId, `${field}.variantId`, 'bdvar') : undefined;
    const draftId =
        source.draftId !== undefined ? readEntityId(source.draftId, `${field}.draftId`, 'bdsn') : undefined;
    return {
        id: readEntityId(source.id, `${field}.id`, 'bddiag'),
        scope: readEnumValue(source.scope, `${field}.scope`, browserDesignQualityFindingScopes),
        severity: readEnumValue(source.severity, `${field}.severity`, browserDesignQualityFindingSeverities),
        category: readEnumValue(source.category, `${field}.category`, browserDesignQualityFindingCategories),
        title: readString(source.title, `${field}.title`),
        message: readString(source.message, `${field}.message`),
        ...(evidence ? { evidence } : {}),
        ...(selectionId ? { selectionId } : {}),
        ...(designerSessionId ? { designerSessionId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(draftId ? { draftId } : {}),
        stale: source.stale === true,
    };
}

function parseBrowserContextPacketComment(value: unknown, field: string): BrowserContextPacketComment {
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

function parseBrowserContextPacketDesignerDraft(value: unknown, field: string): BrowserContextPacketDesignerDraft {
    const source = readObject(value, field);
    const blockedReasonMessage = readOptionalString(source.blockedReasonMessage, `${field}.blockedReasonMessage`);
    const textContentOverride = readOptionalString(source.textContentOverride, `${field}.textContentOverride`);
    const sourceVariantId =
        source.sourceVariantId !== undefined
            ? readEntityId(source.sourceVariantId, `${field}.sourceVariantId`, 'bdvar')
            : undefined;
    return {
        draftId: readEntityId(source.draftId, `${field}.draftId`, 'bdsn'),
        selectionId: readEntityId(source.selectionId, `${field}.selectionId`, 'bsel'),
        ...(sourceVariantId ? { sourceVariantId } : {}),
        pageIdentity: readString(source.pageIdentity, `${field}.pageIdentity`),
        applyMode: readEnumValue(source.applyMode, `${field}.applyMode`, browserDesignerApplyModes),
        applyStatus: readEnumValue(source.applyStatus, `${field}.applyStatus`, browserDesignerApplyStatuses),
        ...(blockedReasonMessage ? { blockedReasonMessage } : {}),
        stylePatches: parseBrowserDesignerStylePatchSet(source.stylePatches ?? {}, `${field}.stylePatches`),
        ...(textContentOverride ? { textContentOverride } : {}),
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
        designerDraftCount: readNonNegativeNumber(source.designerDraftCount, `${field}.designerDraftCount`),
        designerPatchCount: readNonNegativeNumber(source.designerPatchCount, `${field}.designerPatchCount`),
        designerApplyIntentStatus: readEnumValue(
            source.designerApplyIntentStatus,
            `${field}.designerApplyIntentStatus`,
            browserContextSummaryDesignerApplyIntentStatuses
        ),
        designDiagnosticCount:
            source.designDiagnosticCount !== undefined
                ? readNonNegativeNumber(source.designDiagnosticCount, `${field}.designDiagnosticCount`)
                : 0,
        designDiagnosticWarningCount:
            source.designDiagnosticWarningCount !== undefined
                ? readNonNegativeNumber(source.designDiagnosticWarningCount, `${field}.designDiagnosticWarningCount`)
                : 0,
        designDiagnosticErrorCount:
            source.designDiagnosticErrorCount !== undefined
                ? readNonNegativeNumber(source.designDiagnosticErrorCount, `${field}.designDiagnosticErrorCount`)
                : 0,
        digest: readString(source.digest, `${field}.digest`),
    };
}

export function parseBrowserContextPacket(value: unknown, field: string): BrowserContextPacket {
    const source = readObject(value, field);
    return {
        target: parseDevBrowserTarget(source.target, `${field}.target`),
        selections: readArray(source.selections, `${field}.selections`).map((item, index) =>
            parseBrowserSelectionRecord(item, `${field}.selections[${String(index)}]`)
        ),
        comments: readArray(source.comments, `${field}.comments`).map((item, index) =>
            parseBrowserContextPacketComment(item, `${field}.comments[${String(index)}]`)
        ),
        cropAttachmentIds: readArray(source.cropAttachmentIds ?? [], `${field}.cropAttachmentIds`).map((item, index) =>
            readEntityId(item, `${field}.cropAttachmentIds[${String(index)}]`, 'att')
        ),
        designerDrafts: readArray(source.designerDrafts ?? [], `${field}.designerDrafts`).map((item, index) =>
            parseBrowserContextPacketDesignerDraft(item, `${field}.designerDrafts[${String(index)}]`)
        ),
        designDiagnostics: readArray(source.designDiagnostics ?? [], `${field}.designDiagnostics`).map((item, index) =>
            parseBrowserDesignQualityFinding(item, `${field}.designDiagnostics[${String(index)}]`)
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

export function parseSessionUpsertBrowserDesignerDraftInput(input: unknown): SessionUpsertBrowserDesignerDraftInput {
    const source = readObject(input, 'input');
    const inclusionState =
        source.inclusionState !== undefined
            ? readEnumValue(source.inclusionState, 'inclusionState', browserCommentDraftInclusionStates)
            : undefined;
    const textContentOverride = readOptionalString(source.textContentOverride, 'textContentOverride');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        selectionId: readEntityId(source.selectionId, 'selectionId', 'bsel'),
        applyMode: readEnumValue(source.applyMode, 'applyMode', browserDesignerApplyModes),
        stylePatches: parseBrowserDesignerStylePatchSet(source.stylePatches ?? {}, 'stylePatches'),
        ...(inclusionState ? { inclusionState } : {}),
        ...(textContentOverride ? { textContentOverride } : {}),
    };
}

export function parseSessionCreateBrowserDesignerLiveSessionInput(
    input: unknown
): SessionCreateBrowserDesignerLiveSessionInput {
    const source = readObject(input, 'input');
    const actionChip =
        source.actionChip !== undefined
            ? readEnumValue(source.actionChip, 'actionChip', browserDesignerActionChips)
            : undefined;
    const requestedVariantCount =
        source.requestedVariantCount !== undefined
            ? readNonNegativeNumber(source.requestedVariantCount, 'requestedVariantCount')
            : undefined;
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        selectionId: readEntityId(source.selectionId, 'selectionId', 'bsel'),
        ...(actionChip ? { actionChip } : {}),
        intentText: readString(source.intentText, 'intentText'),
        ...(requestedVariantCount !== undefined ? { requestedVariantCount } : {}),
    };
}

export function parseSessionCreateBrowserDesignerAnnotationInput(
    input: unknown
): SessionCreateBrowserDesignerAnnotationInput {
    const source = readObject(input, 'input');
    const text = readOptionalString(source.text, 'text');
    const cropAttachmentId =
        source.cropAttachmentId !== undefined ? readEntityId(source.cropAttachmentId, 'cropAttachmentId', 'att') : undefined;
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        designerSessionId: readEntityId(source.designerSessionId, 'designerSessionId', 'bdsess'),
        kind: readEnumValue(source.kind, 'kind', browserDesignerAnnotationKinds),
        geometry: parseBrowserDesignerAnnotationGeometry(source.geometry, 'geometry'),
        ...(text ? { text } : {}),
        ...(cropAttachmentId ? { cropAttachmentId } : {}),
    };
}

export function parseSessionStartBrowserDesignerVariantGenerationInput(
    input: unknown
): SessionStartBrowserDesignerVariantGenerationInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sandboxId = source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        designerSessionId: readEntityId(source.designerSessionId, 'designerSessionId', 'bdsess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        runtimeOptions: parseRuntimeRunOptions(source.runtimeOptions),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    };
}

function parseVariantInputBase(input: unknown): SessionActivateBrowserDesignerVariantInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        designerSessionId: readEntityId(source.designerSessionId, 'designerSessionId', 'bdsess'),
        variantId: readEntityId(source.variantId, 'variantId', 'bdvar'),
    };
}

export function parseSessionActivateBrowserDesignerVariantInput(
    input: unknown
): SessionActivateBrowserDesignerVariantInput {
    return parseVariantInputBase(input);
}

export function parseSessionTuneBrowserDesignerVariantInput(input: unknown): SessionTuneBrowserDesignerVariantInput {
    const source = readObject(input, 'input');
    const textContentOverride = readOptionalString(source.textContentOverride, 'textContentOverride');
    return {
        ...parseVariantInputBase(input),
        stylePatches: parseBrowserDesignerStylePatchSet(source.stylePatches ?? {}, 'stylePatches'),
        ...(textContentOverride ? { textContentOverride } : {}),
    };
}

export function parseSessionAcceptBrowserDesignerVariantInput(input: unknown): SessionAcceptBrowserDesignerVariantInput {
    const source = readObject(input, 'input');
    const inclusionState =
        source.inclusionState !== undefined
            ? readEnumValue(source.inclusionState, 'inclusionState', browserCommentDraftInclusionStates)
            : undefined;
    return {
        ...parseVariantInputBase(input),
        applyMode: readEnumValue(source.applyMode, 'applyMode', browserDesignerApplyModes),
        ...(inclusionState ? { inclusionState } : {}),
    };
}

export function parseSessionDiscardBrowserDesignerVariantInput(
    input: unknown
): SessionDiscardBrowserDesignerVariantInput {
    return parseVariantInputBase(input);
}

export function parseSessionQueueBrowserDesignerApplyIntentInput(
    input: unknown
): SessionQueueBrowserDesignerApplyIntentInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sandboxId = source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        draftId: readEntityId(source.draftId, 'draftId', 'bdsn'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        runtimeOptions: parseRuntimeRunOptions(source.runtimeOptions),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    };
}

export function parseSessionDeleteBrowserDesignerDraftInput(input: unknown): SessionDeleteBrowserDesignerDraftInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        draftId: readEntityId(source.draftId, 'draftId', 'bdsn'),
    };
}

export function parseSessionSetBrowserDesignerDraftInclusionInput(
    input: unknown
): SessionSetBrowserDesignerDraftInclusionInput {
    const source = readObject(input, 'input');
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        draftId: readEntityId(source.draftId, 'draftId', 'bdsn'),
        inclusionState: readEnumValue(source.inclusionState, 'inclusionState', browserCommentDraftInclusionStates),
    };
}

export function parseSessionClearStaleBrowserContextInput(input: unknown): SessionClearStaleBrowserContextInput {
    return parseSessionDevBrowserStateInputBase(input);
}

export function parseSessionBuildBrowserContextPacketInput(input: unknown): SessionBuildBrowserContextPacketInput {
    const source = readObject(input, 'input');
    const commentDraftIds =
        source.commentDraftIds !== undefined
            ? readArray(source.commentDraftIds, 'commentDraftIds').map((item, index) =>
                  readEntityId(item, `commentDraftIds[${String(index)}]`, 'bcmt')
              )
            : undefined;
    return {
        ...parseSessionDevBrowserStateInputBase(input),
        ...(commentDraftIds ? { commentDraftIds } : {}),
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
export const sessionUpsertBrowserDesignerDraftInputSchema = createParser(parseSessionUpsertBrowserDesignerDraftInput);
export const sessionCreateBrowserDesignerLiveSessionInputSchema = createParser(
    parseSessionCreateBrowserDesignerLiveSessionInput
);
export const sessionCreateBrowserDesignerAnnotationInputSchema = createParser(
    parseSessionCreateBrowserDesignerAnnotationInput
);
export const sessionStartBrowserDesignerVariantGenerationInputSchema = createParser(
    parseSessionStartBrowserDesignerVariantGenerationInput
);
export const sessionActivateBrowserDesignerVariantInputSchema = createParser(
    parseSessionActivateBrowserDesignerVariantInput
);
export const sessionTuneBrowserDesignerVariantInputSchema = createParser(parseSessionTuneBrowserDesignerVariantInput);
export const sessionAcceptBrowserDesignerVariantInputSchema = createParser(parseSessionAcceptBrowserDesignerVariantInput);
export const sessionDiscardBrowserDesignerVariantInputSchema = createParser(
    parseSessionDiscardBrowserDesignerVariantInput
);
export const sessionQueueBrowserDesignerApplyIntentInputSchema = createParser(
    parseSessionQueueBrowserDesignerApplyIntentInput
);
export const sessionDeleteBrowserDesignerDraftInputSchema = createParser(parseSessionDeleteBrowserDesignerDraftInput);
export const sessionSetBrowserDesignerDraftInclusionInputSchema = createParser(
    parseSessionSetBrowserDesignerDraftInclusionInput
);
export const sessionClearStaleBrowserContextInputSchema = createParser(parseSessionClearStaleBrowserContextInput);
export const sessionBuildBrowserContextPacketInputSchema = createParser(parseSessionBuildBrowserContextPacketInput);

export const parseBrowserCommentPacket = parseBrowserContextPacket;
export const sessionBuildBrowserCommentPacketInputSchema = sessionBuildBrowserContextPacketInputSchema;

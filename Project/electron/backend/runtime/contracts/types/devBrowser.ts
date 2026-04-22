import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export const devBrowserTargetSchemes = ['http', 'https'] as const;
export type DevBrowserTargetScheme = (typeof devBrowserTargetSchemes)[number];

export const devBrowserTargetSourceKinds = ['manual', 'detected'] as const;
export type DevBrowserTargetSourceKind = (typeof devBrowserTargetSourceKinds)[number];

export const devBrowserAvailabilityStates = ['available', 'unavailable'] as const;
export type DevBrowserAvailabilityState = (typeof devBrowserAvailabilityStates)[number];

export const devBrowserValidationStatuses = ['allowed', 'blocked'] as const;
export type DevBrowserValidationStatus = (typeof devBrowserValidationStatuses)[number];

export const devBrowserValidationSources = ['input', 'navigation', 'redirect', 'popup'] as const;
export type DevBrowserValidationSource = (typeof devBrowserValidationSources)[number];

export const devBrowserBlockedReasonCodes = [
    'unsupported_scheme',
    'credentials_not_allowed',
    'empty_host',
    'resolution_failed',
    'host_not_local',
    'mixed_resolution',
    'redirect_not_local',
    'popup_blocked',
    'navigation_blocked',
] as const;
export type DevBrowserBlockedReasonCode = (typeof devBrowserBlockedReasonCodes)[number];

export const devBrowserEnrichmentModes = ['dom_only', 'react_component_enriched', 'react_source_enriched'] as const;
export type DevBrowserEnrichmentMode = (typeof devBrowserEnrichmentModes)[number];

export const browserCommentDraftInclusionStates = ['included', 'excluded'] as const;
export type BrowserCommentDraftInclusionState = (typeof browserCommentDraftInclusionStates)[number];

export const browserSelectionSourceAnchorStatuses = ['workspace_relative', 'outside_current_workspace', 'unresolved'] as const;
export type BrowserSelectionSourceAnchorStatus = (typeof browserSelectionSourceAnchorStatuses)[number];

export const browserSelectionReactSourceKinds = ['provider', 'fiber_zero_config'] as const;
export type BrowserSelectionReactSourceKind = (typeof browserSelectionReactSourceKinds)[number];

export const browserDesignerApplyModes = ['preview_only', 'apply_with_agent'] as const;
export type BrowserDesignerApplyMode = (typeof browserDesignerApplyModes)[number];

export const browserDesignerApplyStatuses = [
    'eligible',
    'blocked_no_workspace',
    'blocked_outside_current_workspace',
    'blocked_missing_source_anchor',
] as const;
export type BrowserDesignerApplyStatus = (typeof browserDesignerApplyStatuses)[number];

export const browserDesignerStylePropertyKeys = [
    'display',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'width',
    'minWidth',
    'maxWidth',
    'height',
    'minHeight',
    'maxHeight',
    'flexDirection',
    'flexWrap',
    'justifyContent',
    'alignItems',
    'alignSelf',
    'gap',
    'rowGap',
    'columnGap',
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'color',
    'backgroundColor',
    'borderRadius',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'boxShadow',
    'opacity',
] as const;
export type BrowserDesignerStylePropertyKey = (typeof browserDesignerStylePropertyKeys)[number];

export const devBrowserControlActions = ['back', 'forward', 'reload'] as const;
export type DevBrowserControlAction = (typeof devBrowserControlActions)[number];

export const browserContextSummaryDesignerApplyIntentStatuses = ['none', 'preview_only', 'apply_with_agent', 'mixed'] as const;
export type BrowserContextSummaryDesignerApplyIntentStatus =
    (typeof browserContextSummaryDesignerApplyIntentStatuses)[number];

export interface DevBrowserValidation {
    status: DevBrowserValidationStatus;
    normalizedUrl?: string;
    resolvedAddresses: string[];
    blockedReasonCode?: DevBrowserBlockedReasonCode;
    blockedReasonMessage?: string;
    attemptedUrl?: string;
    source?: DevBrowserValidationSource;
}

export interface DevBrowserCurrentPage {
    url: string;
    pageIdentity: string;
    title?: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
}

export interface DevBrowserTargetDraft {
    scheme: DevBrowserTargetScheme;
    host: string;
    port?: number;
    path: string;
    sourceKind: DevBrowserTargetSourceKind;
}

export interface DevBrowserTarget extends DevBrowserTargetDraft {
    validation: DevBrowserValidation;
    browserAvailability: DevBrowserAvailabilityState;
    currentPage?: DevBrowserCurrentPage;
}

export interface BrowserSelectionBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BrowserSelectionAncestryEntry {
    tagName: string;
    selector: string;
    accessibleLabel?: string;
    accessibleRole?: string;
}

export interface BrowserSelectionSelectorSnapshot {
    primary: string;
    path: string[];
}

export interface BrowserSelectionSourceAnchor {
    status: BrowserSelectionSourceAnchorStatus;
    displayPath: string;
    line?: number;
    column?: number;
    workspaceFingerprint?: string;
    relativePath?: string;
}

export interface BrowserSelectionReactComponentIdentity {
    displayName: string;
}

export interface BrowserSelectionReactEnrichment {
    sourceKind: BrowserSelectionReactSourceKind;
    componentChain: BrowserSelectionReactComponentIdentity[];
    sourceAnchor?: BrowserSelectionSourceAnchor;
}

export interface BrowserSelectionRecord {
    id: EntityId<'bsel'>;
    pageIdentity: string;
    pageUrl: string;
    pageTitle?: string;
    selector: BrowserSelectionSelectorSnapshot;
    ancestryTrail: BrowserSelectionAncestryEntry[];
    accessibleLabel?: string;
    accessibleRole?: string;
    textExcerpt?: string;
    bounds: BrowserSelectionBounds;
    cropAttachmentId?: EntityId<'att'>;
    enrichmentMode: DevBrowserEnrichmentMode;
    reactEnrichment?: BrowserSelectionReactEnrichment;
    stale: boolean;
    createdAt: string;
}

export interface BrowserSelectionSnapshotInput {
    pageIdentity: string;
    pageUrl: string;
    pageTitle?: string;
    selector: BrowserSelectionSelectorSnapshot;
    ancestryTrail: BrowserSelectionAncestryEntry[];
    accessibleLabel?: string;
    accessibleRole?: string;
    textExcerpt?: string;
    bounds: BrowserSelectionBounds;
    cropAttachmentId?: EntityId<'att'>;
    enrichmentMode: DevBrowserEnrichmentMode;
    reactEnrichment?: BrowserSelectionReactEnrichment;
}

export interface BrowserCommentDraft {
    id: EntityId<'bcmt'>;
    selectionId: EntityId<'bsel'>;
    pageIdentity: string;
    commentText: string;
    inclusionState: BrowserCommentDraftInclusionState;
    sequence: number;
    stale: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface BrowserContextPacketComment {
    draftId: EntityId<'bcmt'>;
    selectionId: EntityId<'bsel'>;
    pageIdentity: string;
    commentText: string;
    sequence: number;
    createdAt: string;
    updatedAt: string;
}

export type BrowserDesignerStylePatchSet = Partial<Record<BrowserDesignerStylePropertyKey, string>>;

export interface BrowserDesignerDraft {
    id: EntityId<'bdsn'>;
    selectionId: EntityId<'bsel'>;
    pageIdentity: string;
    inclusionState: BrowserCommentDraftInclusionState;
    applyMode: BrowserDesignerApplyMode;
    applyStatus: BrowserDesignerApplyStatus;
    blockedReasonMessage?: string;
    stylePatches: BrowserDesignerStylePatchSet;
    textContentOverride?: string;
    stale: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface BrowserContextPacketDesignerDraft {
    draftId: EntityId<'bdsn'>;
    selectionId: EntityId<'bsel'>;
    pageIdentity: string;
    applyMode: BrowserDesignerApplyMode;
    applyStatus: BrowserDesignerApplyStatus;
    blockedReasonMessage?: string;
    stylePatches: BrowserDesignerStylePatchSet;
    textContentOverride?: string;
    createdAt: string;
    updatedAt: string;
}

export interface BrowserContextSummary {
    targetUrl: string;
    targetLabel: string;
    selectedElementCount: number;
    commentCount: number;
    captureCount: number;
    enrichmentMode: DevBrowserEnrichmentMode;
    designerDraftCount: number;
    designerPatchCount: number;
    designerApplyIntentStatus: BrowserContextSummaryDesignerApplyIntentStatus;
    digest: string;
}

export interface BrowserContextPacket {
    target: DevBrowserTarget;
    selections: BrowserSelectionRecord[];
    comments: BrowserContextPacketComment[];
    cropAttachmentIds: EntityId<'att'>[];
    designerDrafts: BrowserContextPacketDesignerDraft[];
    enrichmentMode: DevBrowserEnrichmentMode;
}

export interface SessionDevBrowserState {
    sessionId: EntityId<'sess'>;
    target?: DevBrowserTarget;
    pickerActive: boolean;
    selections: BrowserSelectionRecord[];
    commentDrafts: BrowserCommentDraft[];
    designerDrafts: BrowserDesignerDraft[];
    summary?: BrowserContextSummary;
}

export interface SessionDevBrowserStateInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
}

export interface SessionSetDevBrowserTargetInput extends SessionDevBrowserStateInput {
    target: DevBrowserTargetDraft;
}

export interface SessionControlDevBrowserInput extends SessionDevBrowserStateInput {
    action: DevBrowserControlAction;
}

export interface SessionSetDevBrowserPickerInput extends SessionDevBrowserStateInput {
    active: boolean;
}

export interface SessionPersistBrowserSelectionInput extends SessionDevBrowserStateInput {
    selection: BrowserSelectionSnapshotInput;
}

export interface SessionCreateBrowserCommentDraftInput extends SessionDevBrowserStateInput {
    selectionId: EntityId<'bsel'>;
    commentText: string;
    inclusionState?: BrowserCommentDraftInclusionState;
}

export interface SessionUpdateBrowserCommentDraftInput extends SessionDevBrowserStateInput {
    draftId: EntityId<'bcmt'>;
    commentText: string;
}

export interface SessionDeleteBrowserCommentDraftInput extends SessionDevBrowserStateInput {
    draftId: EntityId<'bcmt'>;
}

export interface SessionMoveBrowserCommentDraftInput extends SessionDevBrowserStateInput {
    draftId: EntityId<'bcmt'>;
    direction: 'up' | 'down';
}

export interface SessionSetBrowserCommentDraftInclusionInput extends SessionDevBrowserStateInput {
    draftId: EntityId<'bcmt'>;
    inclusionState: BrowserCommentDraftInclusionState;
}

export interface SessionUpsertBrowserDesignerDraftInput extends SessionDevBrowserStateInput {
    selectionId: EntityId<'bsel'>;
    inclusionState?: BrowserCommentDraftInclusionState;
    applyMode: BrowserDesignerApplyMode;
    stylePatches: BrowserDesignerStylePatchSet;
    textContentOverride?: string;
}

export interface SessionDeleteBrowserDesignerDraftInput extends SessionDevBrowserStateInput {
    draftId: EntityId<'bdsn'>;
}

export interface SessionSetBrowserDesignerDraftInclusionInput extends SessionDevBrowserStateInput {
    draftId: EntityId<'bdsn'>;
    inclusionState: BrowserCommentDraftInclusionState;
}

export type SessionClearStaleBrowserContextInput = SessionDevBrowserStateInput;

export interface SessionBuildBrowserContextPacketInput extends SessionDevBrowserStateInput {
    commentDraftIds?: EntityId<'bcmt'>[];
}

export type SessionBuildBrowserContextPacketResult =
    | {
          available: false;
          reason: 'missing_target' | 'missing_context' | 'missing_selection';
          message: string;
      }
    | {
          available: true;
          packet: BrowserContextPacket;
          summary: BrowserContextSummary;
      };

export type BrowserCommentPacketComment = BrowserContextPacketComment;
export type BrowserCommentPacket = BrowserContextPacket;
export type SessionBuildBrowserCommentPacketInput = SessionBuildBrowserContextPacketInput;
export type SessionBuildBrowserCommentPacketResult = SessionBuildBrowserContextPacketResult;

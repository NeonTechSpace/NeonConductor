import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';

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

export const devBrowserEnrichmentModes = ['dom_only', 'react_source_enriched'] as const;
export type DevBrowserEnrichmentMode = (typeof devBrowserEnrichmentModes)[number];

export const browserCommentDraftInclusionStates = ['included', 'excluded'] as const;
export type BrowserCommentDraftInclusionState = (typeof browserCommentDraftInclusionStates)[number];

export const devBrowserControlActions = ['back', 'forward', 'reload'] as const;
export type DevBrowserControlAction = (typeof devBrowserControlActions)[number];

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

export interface BrowserCommentPacketComment {
    draftId: EntityId<'bcmt'>;
    selectionId: EntityId<'bsel'>;
    pageIdentity: string;
    commentText: string;
    sequence: number;
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
    digest: string;
}

export interface BrowserCommentPacket {
    target: DevBrowserTarget;
    selections: BrowserSelectionRecord[];
    comments: BrowserCommentPacketComment[];
    cropAttachmentIds: EntityId<'att'>[];
    enrichmentMode: DevBrowserEnrichmentMode;
}

export interface SessionDevBrowserState {
    sessionId: EntityId<'sess'>;
    target?: DevBrowserTarget;
    pickerActive: boolean;
    selections: BrowserSelectionRecord[];
    commentDrafts: BrowserCommentDraft[];
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

export type SessionClearStaleBrowserContextInput = SessionDevBrowserStateInput;

export interface SessionBuildBrowserCommentPacketInput extends SessionDevBrowserStateInput {
    draftIds?: EntityId<'bcmt'>[];
}

export type SessionBuildBrowserCommentPacketResult =
    | {
          available: false;
          reason: 'missing_target' | 'missing_comments' | 'missing_selection';
          message: string;
      }
    | {
          available: true;
          packet: BrowserCommentPacket;
          summary: BrowserContextSummary;
      };

import type {
    RegistryPresetKey,
    RuntimeProviderId,
    SessionEditMode,
    RuntimeReasoningEffort,
    RuntimeReasoningSummary,
    RuntimeCacheStrategy,
    RuntimeRequestedTransportFamily,
    SessionKind,
    CloudSessionAuthorityState,
    CloudSessionRecordKind,
    CloudSessionSyncState,
    TopLevelTab,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type {
    BrowserContextPacket,
    SessionBuildBrowserContextPacketResult,
    SessionBuildBrowserContextPacketInput,
    SessionClearStaleBrowserContextInput,
    SessionControlDevBrowserInput,
    SessionCreateBrowserCommentDraftInput,
    SessionDeleteBrowserCommentDraftInput,
    SessionDeleteBrowserDesignerDraftInput,
    SessionDevBrowserState,
    SessionMoveBrowserCommentDraftInput,
    SessionPersistBrowserSelectionInput,
    SessionSetBrowserCommentDraftInclusionInput,
    SessionSetBrowserDesignerDraftInclusionInput,
    SessionSetDevBrowserPickerInput,
    SessionSetDevBrowserTargetInput,
    SessionUpdateBrowserCommentDraftInput,
    SessionDevBrowserStateInput,
    SessionUpsertBrowserDesignerDraftInput,
} from '@/app/backend/runtime/contracts/types/devBrowser';
import type { RulesetDefinition, SkillfileDefinition } from '@/app/backend/runtime/contracts/types/mode';
import type { ResearchTargetRequest } from '@/app/backend/runtime/contracts/types/research';
import type { RunContractPreview, SessionOutboxEntry, ExecutionReceipt } from '@/app/backend/runtime/contracts/types/runContract';

import type { CloudSessionSyncBackExpectation } from '@/shared/contracts/cloudSessionAuthority';

export const composerImageAttachmentMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ComposerImageAttachmentMimeType = (typeof composerImageAttachmentMimeTypes)[number];
export const composerTextFileAttachmentEncodings = ['utf-8', 'utf-8-bom'] as const;
export type ComposerTextFileAttachmentEncoding = (typeof composerTextFileAttachmentEncodings)[number];
export const composerDocumentAttachmentMimeTypes = ['application/pdf'] as const;
export type ComposerDocumentAttachmentMimeType = (typeof composerDocumentAttachmentMimeTypes)[number];
export const documentExtractionStates = ['pending', 'extracted', 'empty', 'failed'] as const;
export type DocumentExtractionState = (typeof documentExtractionStates)[number];
export const documentArtifactLifecycleStates = ['draft', 'attached', 'deleted'] as const;
export type DocumentArtifactLifecycleState = (typeof documentArtifactLifecycleStates)[number];
export const documentContextModes = ['artifact_only', 'selected_text'] as const;
export type DocumentContextMode = (typeof documentContextModes)[number];
export const documentCountingStates = ['exact_text_estimate', 'unavailable'] as const;
export type DocumentCountingState = (typeof documentCountingStates)[number];

export interface ComposerImageAttachmentInput {
    clientId: string;
    kind?: 'image_attachment';
    mimeType: ComposerImageAttachmentMimeType;
    bytesBase64: string;
    width: number;
    height: number;
    sha256: string;
    byteSize?: number;
    fileName?: string;
}

export interface ComposerTextFileAttachmentInput {
    clientId: string;
    kind: 'text_file_attachment';
    fileName: string;
    mimeType: string;
    text: string;
    sha256: string;
    byteSize: number;
    encoding: ComposerTextFileAttachmentEncoding;
}

export interface ComposerDocumentAttachmentInput {
    clientId: string;
    kind: 'document_attachment';
    documentArtifactId: EntityId<'doc'>;
    fileName: string;
    mimeType: ComposerDocumentAttachmentMimeType;
    sha256: string;
    byteSize: number;
    pageCount?: number;
    extractionState: DocumentExtractionState;
    extractedTextByteSize: number;
    extractedTextTokenCount: number;
}

export type ComposerAttachmentInput =
    | ComposerImageAttachmentInput
    | ComposerTextFileAttachmentInput
    | ComposerDocumentAttachmentInput;

export interface DocumentArtifactPageSummary {
    pageNumber: number;
    textByteSize: number;
    estimatedTokenCount: number;
    textSha256?: string;
    hasText: boolean;
}

export interface DocumentArtifactSummary {
    id: EntityId<'doc'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    fileName: string;
    mimeType: ComposerDocumentAttachmentMimeType;
    sha256: string;
    byteSize: number;
    pageCount?: number;
    extractionState: DocumentExtractionState;
    lifecycleState: DocumentArtifactLifecycleState;
    extractedTextByteSize: number;
    extractedTextTokenCount: number;
    errorCode?: string;
    errorMessage?: string;
    pages: DocumentArtifactPageSummary[];
    createdAt: string;
    updatedAt: string;
}

export interface SessionAttachmentSummary {
    id: EntityId<'att'>;
    kind: ComposerAttachmentInput['kind'];
    fileName?: string;
    mimeType: string;
    sha256: string;
    byteSize: number;
    width?: number;
    height?: number;
    encoding?: ComposerTextFileAttachmentEncoding;
    documentArtifactId?: EntityId<'doc'>;
    pageCount?: number;
    extractionState?: DocumentExtractionState;
    extractedTextByteSize?: number;
    extractedTextTokenCount?: number;
    createdAt: string;
}

export type SessionAttachmentPayload =
    | ({
          kind: 'image_attachment';
          bytesBase64: string;
      } & SessionAttachmentSummary)
    | ({
          kind: 'text_file_attachment';
          text: string;
      } & SessionAttachmentSummary)
    | ({
          kind: 'document_attachment';
          documentArtifact: DocumentArtifactSummary;
      } & SessionAttachmentSummary);

export interface CloudSessionSummary {
    id: EntityId<'csess'>;
    profileId: string;
    providerId: 'kilo';
    recordKind: CloudSessionRecordKind;
    authorityState: CloudSessionAuthorityState;
    syncState: CloudSessionSyncState;
    syncBackExpectation: CloudSessionSyncBackExpectation;
    remoteSessionId: string;
    remoteScopeKey: string;
    localSessionId?: EntityId<'sess'>;
    accountId?: string;
    organizationId?: string;
    title?: string;
    remoteCreatedAt?: string;
    remoteUpdatedAt?: string;
    lastSyncedAt?: string;
    lastSyncErrorCode?: string;
    lastSyncErrorMessage?: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface CloudSessionCreateMetadata {
    providerId?: 'kilo';
    remoteSessionId: string;
    remoteScopeKey?: string;
    accountId?: string;
    organizationId?: string;
    title?: string;
    remoteCreatedAt?: string;
    remoteUpdatedAt?: string;
}

interface BaseSessionCreateInput extends ProfileInput {
    threadId: EntityId<'thr'>;
}

export type SessionCreateInput =
    | (BaseSessionCreateInput & {
          kind: Exclude<SessionKind, 'cloud'>;
      })
    | (BaseSessionCreateInput & {
          kind: 'cloud';
          cloudSession?: CloudSessionCreateMetadata;
      });

export interface SessionByIdInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
}

export interface SessionRevertInput extends SessionByIdInput {
    topLevelTab: TopLevelTab;
}

export interface RuntimeReasoningOptions {
    effort: RuntimeReasoningEffort;
    summary: RuntimeReasoningSummary;
    includeEncrypted: boolean;
}

export interface RuntimeCacheOptions {
    strategy: RuntimeCacheStrategy;
    key?: string;
}

export interface RuntimeTransportOptions {
    family: RuntimeRequestedTransportFamily;
}

export interface RuntimeRunOptions {
    reasoning: RuntimeReasoningOptions;
    cache: RuntimeCacheOptions;
    transport: RuntimeTransportOptions;
}

export interface SessionStartRunInput extends SessionByIdInput {
    prompt: string;
    attachments?: ComposerAttachmentInput[];
    browserContext?: BrowserContextPacket;
    providerId?: RuntimeProviderId;
    modelId?: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    runtimeOptions: RuntimeRunOptions;
    researchTarget?: ResearchTargetRequest;
}

export interface SessionEditInput extends SessionByIdInput {
    topLevelTab: TopLevelTab;
    modeKey?: string;
    messageId: EntityId<'msg'>;
    replacementText: string;
    editMode: SessionEditMode;
    autoStartRun?: boolean;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    runtimeOptions?: RuntimeRunOptions;
}

export interface SessionBranchFromMessageInput extends SessionByIdInput {
    topLevelTab: TopLevelTab;
    messageId: EntityId<'msg'>;
}

export interface SessionBranchFromMessageWithBranchWorkflowInput extends SessionBranchFromMessageInput {
    modeKey: string;
    branchWorkflowId?: string;
}

export type SessionListRunsInput = SessionByIdInput;
export type SessionListOutboxInput = SessionByIdInput;

export interface SessionListCloudSessionsInput extends ProfileInput {
    query?: string;
    scopeMode?: 'current' | 'all';
    recordKind?: CloudSessionRecordKind | 'all';
    authorityState?: CloudSessionAuthorityState | 'all';
    syncState?: CloudSessionSyncState | 'all';
}

export interface SessionCloudSessionByIdInput extends ProfileInput {
    cloudSessionId: EntityId<'csess'>;
}

export interface SessionImportCloudSessionInput extends ProfileInput {
    threadId: EntityId<'thr'>;
    remoteSessionId: string;
}

export interface SessionForkCloudSessionInput extends SessionCloudSessionByIdInput {
    threadId: EntityId<'thr'>;
}

export type SessionContinueCloudSessionInput = SessionForkCloudSessionInput;

export interface SessionListCloudSessionsResult {
    cloudSessions: CloudSessionSummary[];
}

export interface SessionListMessagesInput extends SessionByIdInput {
    runId?: EntityId<'run'>;
}

export type SessionQueueRunInput = SessionStartRunInput;

export interface SessionOutboxEntryInput extends SessionByIdInput {
    entryId: EntityId<'outbox'>;
}

export interface SessionMoveOutboxEntryInput extends SessionOutboxEntryInput {
    direction: 'up' | 'down';
}

export interface SessionUpdateOutboxEntryInput extends SessionOutboxEntryInput {
    prompt: string;
    attachments?: ComposerAttachmentInput[];
    browserContext?: BrowserContextPacket | null;
}

export interface SessionGetExecutionReceiptInput extends ProfileInput {
    runId: EntityId<'run'>;
}

export type SessionGetDevBrowserStateInput = SessionDevBrowserStateInput;
export type SessionGetDevBrowserStateResult = SessionDevBrowserState;
export type SessionSetDevBrowserTargetResult = SessionDevBrowserState;
export type SessionControlDevBrowserResult = SessionDevBrowserState;
export type SessionSetDevBrowserPickerResult = SessionDevBrowserState;
export type SessionPersistBrowserSelectionResult = SessionDevBrowserState;
export type SessionCreateBrowserCommentDraftResult = SessionDevBrowserState;
export type SessionUpdateBrowserCommentDraftResult = SessionDevBrowserState;
export type SessionDeleteBrowserCommentDraftResult = SessionDevBrowserState;
export type SessionMoveBrowserCommentDraftResult = SessionDevBrowserState;
export type SessionSetBrowserCommentDraftInclusionResult = SessionDevBrowserState;
export type SessionUpsertBrowserDesignerDraftResult = SessionDevBrowserState;
export type SessionDeleteBrowserDesignerDraftResult = SessionDevBrowserState;
export type SessionSetBrowserDesignerDraftInclusionResult = SessionDevBrowserState;
export type SessionClearStaleBrowserContextResult = SessionDevBrowserState;

export type {
    SessionSetDevBrowserTargetInput,
    SessionControlDevBrowserInput,
    SessionSetDevBrowserPickerInput,
    SessionPersistBrowserSelectionInput,
    SessionCreateBrowserCommentDraftInput,
    SessionUpdateBrowserCommentDraftInput,
    SessionDeleteBrowserCommentDraftInput,
    SessionMoveBrowserCommentDraftInput,
    SessionSetBrowserCommentDraftInclusionInput,
    SessionUpsertBrowserDesignerDraftInput,
    SessionDeleteBrowserDesignerDraftInput,
    SessionSetBrowserDesignerDraftInclusionInput,
    SessionClearStaleBrowserContextInput,
    SessionBuildBrowserContextPacketInput,
    SessionBuildBrowserContextPacketResult,
};

export interface SessionGetMessageMediaInput extends ProfileInput {
    mediaId: EntityId<'media'>;
}

export interface SessionGetAttachmentInput extends ProfileInput {
    attachmentId: EntityId<'att'>;
}

export interface SessionPrepareDocumentAttachmentInput extends SessionByIdInput {
    clientId: string;
    fileName: string;
    mimeType: ComposerDocumentAttachmentMimeType;
    byteSize: number;
    sha256: string;
    bytesBase64: string;
}

export interface SessionGetDocumentArtifactInput extends SessionByIdInput {
    documentArtifactId: EntityId<'doc'>;
}

export type SessionDiscardDocumentAttachmentInput = SessionGetDocumentArtifactInput;

export interface SessionMessageMediaPayload {
    mimeType: ComposerImageAttachmentMimeType;
    bytes: Uint8Array;
    byteSize: number;
    width: number;
    height: number;
    sha256: string;
}

export interface SessionTextFileAttachmentPayload {
    mimeType: string;
    text: string;
    byteSize: number;
    sha256: string;
    fileName: string;
    encoding: ComposerTextFileAttachmentEncoding;
}

export type SessionGetMessageMediaResult =
    | {
          found: false;
      }
    | ({
          found: true;
      } & SessionMessageMediaPayload);

export type SessionGetAttachmentResult =
    | {
          found: false;
      }
    | ({
          found: true;
      } & SessionAttachmentPayload);

export type SessionPrepareDocumentAttachmentResult =
    | {
          prepared: true;
          attachment: ComposerDocumentAttachmentInput;
          document: DocumentArtifactSummary;
      }
    | {
          prepared: false;
          code: 'file_read_guard_blocked' | 'document_limit_exceeded' | 'invalid_pdf_payload' | 'document_extraction_failed';
          message: string;
          document?: DocumentArtifactSummary;
      };

export type SessionGetDocumentArtifactResult =
    | {
          found: false;
      }
    | {
          found: true;
          document: DocumentArtifactSummary;
      };

export type SessionDiscardDocumentAttachmentResult =
    | {
          discarded: true;
      }
    | {
          discarded: false;
          reason: 'not_found' | 'already_attached';
      };

export interface SessionListOutboxResult {
    entries: SessionOutboxEntry[];
}

export type SessionGetOutboxEntryResult =
    | {
          found: false;
      }
    | {
          found: true;
          entry: SessionOutboxEntry;
          attachments: SessionAttachmentPayload[];
      };

export interface SessionQueueRunResult {
    queued: true;
    entry: SessionOutboxEntry;
}

export interface SessionUpdateOutboxEntryResult {
    updated: boolean;
    reason?: 'not_found';
    entry?: SessionOutboxEntry;
}

export interface SessionMoveOutboxEntryResult {
    moved: boolean;
    reason?: 'not_found' | 'boundary';
    entry?: SessionOutboxEntry;
}

export interface SessionCancelOutboxEntryResult {
    cancelled: boolean;
    reason?: 'not_found';
    entry?: SessionOutboxEntry;
}

export interface SessionResumeOutboxEntryResult {
    resumed: boolean;
    reason?: 'not_found' | 'already_running' | 'rejected';
    entry?: SessionOutboxEntry;
    runId?: EntityId<'run'>;
    runContractPreview?: RunContractPreview;
    code?: string;
    message?: string;
    action?: {
        code: string;
        [key: string]: unknown;
    };
}

export type SessionGetExecutionReceiptResult =
    | {
          found: false;
      }
    | {
          found: true;
          receipt: ExecutionReceipt;
      };

export interface SessionRegistryContextInput extends SessionByIdInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
}

export type SessionGetAttachedSkillsInput = SessionRegistryContextInput;

export interface SessionSetAttachedSkillsInput extends SessionRegistryContextInput {
    assetKeys: string[];
}

export interface SessionAttachedSkillsResult {
    sessionId: EntityId<'sess'>;
    skillfiles: SkillfileDefinition[];
    missingAssetKeys?: string[];
}

export type SessionGetAttachedRulesInput = SessionRegistryContextInput;

export interface SessionSetAttachedRulesInput extends SessionRegistryContextInput {
    assetKeys: string[];
}

export interface SessionAttachedRulesResult {
    sessionId: EntityId<'sess'>;
    presetKeys: RegistryPresetKey[];
    rulesets: RulesetDefinition[];
    missingAssetKeys?: string[];
}

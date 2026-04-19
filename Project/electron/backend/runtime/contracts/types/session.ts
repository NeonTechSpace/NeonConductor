import type {
    RegistryPresetKey,
    RuntimeProviderId,
    SessionEditMode,
    RuntimeReasoningEffort,
    RuntimeReasoningSummary,
    RuntimeCacheStrategy,
    RuntimeRequestedTransportFamily,
    SessionKind,
    TopLevelTab,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { RulesetDefinition, SkillfileDefinition } from '@/app/backend/runtime/contracts/types/mode';
import type { RunContractPreview, SessionOutboxEntry, ExecutionReceipt } from '@/app/backend/runtime/contracts/types/runContract';

export const composerImageAttachmentMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ComposerImageAttachmentMimeType = (typeof composerImageAttachmentMimeTypes)[number];
export const composerTextFileAttachmentEncodings = ['utf-8', 'utf-8-bom'] as const;
export type ComposerTextFileAttachmentEncoding = (typeof composerTextFileAttachmentEncodings)[number];

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

export type ComposerAttachmentInput = ComposerImageAttachmentInput | ComposerTextFileAttachmentInput;

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
      } & SessionAttachmentSummary);

export interface SessionCreateInput extends ProfileInput {
    threadId: EntityId<'thr'>;
    kind: SessionKind;
}

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
    providerId?: RuntimeProviderId;
    modelId?: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    runtimeOptions: RuntimeRunOptions;
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

export interface SessionListMessagesInput extends SessionByIdInput {
    runId?: EntityId<'run'>;
}

export interface SessionQueueRunInput extends SessionStartRunInput {}

export interface SessionOutboxEntryInput extends SessionByIdInput {
    entryId: EntityId<'outbox'>;
}

export interface SessionMoveOutboxEntryInput extends SessionOutboxEntryInput {
    direction: 'up' | 'down';
}

export interface SessionUpdateOutboxEntryInput extends SessionOutboxEntryInput {
    prompt: string;
    attachments?: ComposerAttachmentInput[];
}

export interface SessionGetExecutionReceiptInput extends ProfileInput {
    runId: EntityId<'run'>;
}

export interface SessionGetMessageMediaInput extends ProfileInput {
    mediaId: EntityId<'media'>;
}

export interface SessionGetAttachmentInput extends ProfileInput {
    attachmentId: EntityId<'att'>;
}

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

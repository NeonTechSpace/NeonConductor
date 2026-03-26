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

export const composerImageAttachmentMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ComposerImageAttachmentMimeType = (typeof composerImageAttachmentMimeTypes)[number];

export interface ComposerImageAttachmentInput {
    clientId: string;
    mimeType: ComposerImageAttachmentMimeType;
    bytesBase64: string;
    width: number;
    height: number;
    sha256: string;
}

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
    attachments?: ComposerImageAttachmentInput[];
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

export interface SessionBranchFromMessageWithWorkflowInput extends SessionBranchFromMessageInput {
    modeKey: string;
    workflowId?: string;
}

export type SessionListRunsInput = SessionByIdInput;

export interface SessionListMessagesInput extends SessionByIdInput {
    runId?: EntityId<'run'>;
}

export interface SessionGetMessageMediaInput extends ProfileInput {
    mediaId: EntityId<'media'>;
}

export interface SessionMessageMediaPayload {
    mimeType: ComposerImageAttachmentMimeType;
    bytes: Uint8Array;
    byteSize: number;
    width: number;
    height: number;
    sha256: string;
}

export type SessionGetMessageMediaResult =
    | {
          found: false;
      }
    | ({
          found: true;
      } & SessionMessageMediaPayload);

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

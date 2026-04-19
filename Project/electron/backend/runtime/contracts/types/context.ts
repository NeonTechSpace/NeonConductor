import type {
    ContextCompactionSource,
    PreparedContextInstructionAuthority,
    PreparedContextTrustLevel,
    ContextLimitSource,
    ContextProfileOverrideMode,
    ContextSettingMode,
    RuntimeProviderId,
    TokenCountMode,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { RetrievedMemorySummary } from '@/app/backend/runtime/contracts/types/memory';
import type { SkillDynamicContextSafetyClass } from '@/app/backend/runtime/contracts/types/mode';
import type { PreparedContextInjectionCheckpoint } from '@/app/backend/runtime/contracts/types/prompt';

export interface ContextGlobalSettings {
    enabled: boolean;
    mode: ContextSettingMode;
    percent: number;
    updatedAt: string;
}

export interface ContextProfileSettings {
    profileId: string;
    overrideMode: ContextProfileOverrideMode;
    percent?: number;
    fixedInputTokens?: number;
    updatedAt: string;
}

export interface ModelLimitOverrideRecord {
    providerId: RuntimeProviderId;
    modelId: string;
    contextLength?: number;
    maxOutputTokens?: number;
    reason: string;
    updatedAt: string;
}

export interface ResolvedModelLimits {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    contextLength?: number;
    maxOutputTokens?: number;
    contextLengthSource: ContextLimitSource;
    maxOutputTokensSource: ContextLimitSource;
    source: ContextLimitSource;
    updatedAt?: string;
    overrideReason?: string;
    modelLimitsKnown: boolean;
}

export interface TokenCountEstimatePart {
    role: 'system' | 'user' | 'assistant' | 'tool';
    textLength: number;
    tokenCount: number;
    containsImages?: boolean;
}

export interface TokenCountEstimate {
    providerId: RuntimeProviderId;
    modelId: string;
    mode: TokenCountMode;
    totalTokens: number;
    parts: TokenCountEstimatePart[];
}

export interface ResolvedContextPolicy {
    enabled: boolean;
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    limits: ResolvedModelLimits;
    mode: 'percent' | 'fixed_tokens';
    safetyBufferTokens?: number;
    usableInputBudgetTokens?: number;
    thresholdTokens?: number;
    percent?: number;
    fixedInputTokens?: number;
    disabledReason?: 'missing_model_limits' | 'feature_disabled' | 'multimodal_counting_unavailable';
}

export interface SessionContextCompactionRecord {
    profileId: string;
    sessionId: EntityId<'sess'>;
    summaryText: string;
    cutoffMessageId: EntityId<'msg'>;
    source: ContextCompactionSource;
    thresholdTokens: number;
    estimatedInputTokens: number;
    createdAt: string;
    updatedAt: string;
}

export interface ContextPolicyInput {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
}

export type ContextPreviewTargetInput = ContextPolicyInput;

export interface SetContextGlobalSettingsInput {
    enabled: boolean;
    mode: ContextSettingMode;
    percent: number;
    preview?: ContextPreviewTargetInput;
}

export interface SetContextProfileSettingsInput {
    profileId: string;
    overrideMode: ContextProfileOverrideMode;
    percent?: number;
    fixedInputTokens?: number;
    preview?: ContextPreviewTargetInput;
}

export interface ResolvedContextStateInput extends ContextPolicyInput {
    sessionId?: EntityId<'sess'>;
    topLevelTab?: TopLevelTab;
    modeKey?: string;
    workspaceFingerprint?: string;
    runId?: EntityId<'run'>;
}

export type PreparedContextContributorKind =
    | 'workspace_prelude'
    | 'environment_guidance'
    | 'prompt_layer'
    | 'mode_role_definition'
    | 'mode_custom_instructions'
    | 'ruleset'
    | 'project_instruction'
    | 'attached_skill'
    | 'dynamic_skill_context'
    | 'retrieved_memory'
    | 'compaction_summary';

export type PreparedContextContributorGroup =
    | 'runtime_environment'
    | 'shared_prompt_layer'
    | 'mode_prompt'
    | 'ruleset'
    | 'project_instruction'
    | 'attached_skill'
    | 'dynamic_skill_context'
    | 'retrieved_memory'
    | 'compaction';

export type PreparedContextContributorInclusionState = 'included' | 'excluded';

export type PreparedContextContributorCountMode = 'estimated' | 'not_counted';

export interface PreparedContextContributorSource {
    kind:
        | 'workspace'
        | 'environment'
        | 'prompt_layer'
        | 'mode'
        | 'ruleset'
        | 'project_instruction'
        | 'skill'
        | 'skill_dynamic_context'
        | 'memory'
        | 'compaction';
    key: string;
    label: string;
}

export type DynamicContextExpansionResolutionState =
    | 'preview_only'
    | 'pending_approval'
    | 'resolved'
    | 'omitted'
    | 'failed'
    | 'invalid';

export interface DynamicContextExpansion {
    sourceId: string;
    sourceLabel: string;
    required: boolean;
    effectiveSafetyClass?: SkillDynamicContextSafetyClass;
    resolutionState: DynamicContextExpansionResolutionState;
    commandDigest: string;
    outputDigest?: string;
    truncated: boolean;
    failureReason?: string;
    permissionRequestId?: EntityId<'perm'>;
}

export interface PreparedContextContributorSummary {
    id: string;
    kind: PreparedContextContributorKind;
    group: PreparedContextContributorGroup;
    label: string;
    source: PreparedContextContributorSource;
    inclusionState: PreparedContextContributorInclusionState;
    inclusionReason: string;
    injectionCheckpoint: PreparedContextInjectionCheckpoint;
    resolvedOrder: number;
    countMode: PreparedContextContributorCountMode;
    trustLevel: PreparedContextTrustLevel;
    instructionAuthority: PreparedContextInstructionAuthority;
    tokenCount?: number;
    digest: string;
    dynamicExpansion?: DynamicContextExpansion;
}

export interface PreparedContextCheckpointSummary {
    checkpoint: PreparedContextInjectionCheckpoint;
    includedContributorCount: number;
    excludedContributorCount: number;
    estimatedTokenCount?: number;
    digest: string;
    active: boolean;
}

export interface PreparedContextDigestSummary {
    fullDigest: string;
    contributorDigest: string;
    cacheabilityHint: string;
    checkpoints: Record<PreparedContextInjectionCheckpoint, PreparedContextCheckpointSummary>;
}

export interface PreparedContextSummary {
    contributors: PreparedContextContributorSummary[];
    digest: PreparedContextDigestSummary;
    activeContributorCount: number;
    compactionReseedActive: boolean;
}

export interface ResolvedContextState {
    policy: ResolvedContextPolicy;
    countingMode: TokenCountMode;
    estimate?: TokenCountEstimate;
    compaction?: SessionContextCompactionRecord;
    retrievedMemory?: RetrievedMemorySummary;
    preparedContext: PreparedContextSummary;
    compactable: boolean;
}

export interface CompactSessionInput extends ContextPolicyInput {
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
}

export interface CompactSessionResult {
    compacted: boolean;
    reason?:
        | 'not_needed'
        | 'missing_model_limits'
        | 'feature_disabled'
        | 'not_enough_messages'
        | 'multimodal_counting_unavailable';
    state: ResolvedContextState;
}

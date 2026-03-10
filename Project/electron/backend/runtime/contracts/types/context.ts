import type {
    ContextCompactionSource,
    ContextLimitSource,
    ContextProfileOverrideMode,
    ContextSettingMode,
    RuntimeProviderId,
    TokenCountMode,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';

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
    role: 'system' | 'user' | 'assistant';
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
}

export interface ResolvedContextState {
    policy: ResolvedContextPolicy;
    countingMode: TokenCountMode;
    estimate?: TokenCountEstimate;
    compaction?: SessionContextCompactionRecord;
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

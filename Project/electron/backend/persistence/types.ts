import type {
    ComposerMediaSettings,
    ContextCompactionSource,
    MemoryCausalLinkRecord as RuntimeMemoryCausalLinkRecord,
    MemoryDerivedSummary as RuntimeMemoryDerivedSummary,
    MemoryCreatedByKind,
    MemoryTemporalFactRecord as RuntimeMemoryTemporalFactRecord,
    MemoryScopeKind,
    MemoryState,
    MemoryType,
    ModelLimitOverrideRecord as RuntimeModelLimitOverrideRecord,
    ContextProfileSettings,
    ContextGlobalSettings,
    EntityId,
    ExecutionEnvironmentMode,
    ExecutionPreset,
    KiloDynamicSort,
    KiloRoutingMode,
    KiloAccountContext,
    MarketplacePackage,
    ModeDefinition,
    ModePromptDefinition,
    OpenAIExecutionMode,
    ProviderAuthFlowStatus,
    ProviderAuthFlowType,
    ProviderAuthMethod,
    ProviderAuthState,
    ProviderSecret,
    ProviderSecretKind,
    PermissionPolicy,
    PermissionScopeKind,
    McpDiscoveredToolRecord as RuntimeMcpDiscoveredToolRecord,
    McpServerRecord as RuntimeMcpServerRecord,
    RuntimeRequestedTransportFamily,
    RuntimeMessagePartType,
    RuntimeReasoningEffort,
    RuntimeReasoningSummary,
    RuntimeProviderId,
    RulesetDefinition,
    RunStatus,
    SkillfileDefinition,
    TopLevelTab,
    ToolCapability,
    SandboxRecord as RuntimeSandboxRecord,
    WorkspaceRootRecord as RuntimeWorkspaceRootRecord,
} from '@/app/backend/runtime/contracts';
import type {
    ProviderModelFeatureSet,
    ProviderRuntimeDescriptor,
    ProviderRuntimeTransportFamily,
} from '@/app/backend/providers/types';

export interface SessionSummaryRecord {
    id: EntityId<'sess'>;
    profileId: string;
    conversationId: string;
    threadId: string;
    kind: 'local' | 'sandbox' | 'cloud';
    sandboxId?: EntityId<'sb'>;
    delegatedFromOrchestratorRunId?: EntityId<'orch'>;
    runStatus: RunStatus;
    turnCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface SessionAttachedSkillRecord {
    sessionId: EntityId<'sess'>;
    profileId: string;
    assetKey: string;
    createdAt: string;
}

export interface SessionAttachedRuleRecord {
    sessionId: EntityId<'sess'>;
    profileId: string;
    assetKey: string;
    createdAt: string;
}

export interface MemoryRecord {
    id: EntityId<'mem'>;
    profileId: string;
    memoryType: MemoryType;
    scopeKind: MemoryScopeKind;
    state: MemoryState;
    createdByKind: MemoryCreatedByKind;
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    metadata: Record<string, unknown>;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    supersededByMemoryId?: EntityId<'mem'>;
    createdAt: string;
    updatedAt: string;
}

export type MemoryTemporalFactRecord = RuntimeMemoryTemporalFactRecord;

export type MemoryCausalLinkRecord = RuntimeMemoryCausalLinkRecord;

export type MemoryDerivedSummary = RuntimeMemoryDerivedSummary;

export interface ProfileRecord {
    id: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ActiveProfileState {
    activeProfileId: string;
    profile: ProfileRecord;
}

export interface ProfileDeletionGuardResult {
    deleted: boolean;
    reason?: 'last_profile' | 'profile_not_found';
    activeProfileId?: string;
    promotedProfileId?: string;
}

export interface PermissionApprovalCandidate {
    label: string;
    resource: string;
    detail?: string;
}

export interface PermissionRecord {
    id: EntityId<'perm'>;
    profileId: string;
    policy: PermissionPolicy;
    resource: string;
    toolId: string;
    workspaceFingerprint?: string;
    scopeKind: PermissionScopeKind;
    summary: {
        title: string;
        detail: string;
    };
    commandText?: string;
    approvalCandidates?: PermissionApprovalCandidate[];
    selectedApprovalResource?: string;
    decision: 'pending' | 'granted' | 'denied';
    resolvedScope?: 'once' | 'profile' | 'workspace';
    createdAt: string;
    updatedAt: string;
    consumedAt?: string;
    rationale?: string;
}

export interface ProviderRecord {
    id: RuntimeProviderId;
    label: string;
    supportsByok: boolean;
}

export interface ProviderModelRecord {
    id: string;
    providerId: RuntimeProviderId;
    label: string;
    sourceProvider?: string;
    source?: string;
    updatedAt?: string;
    features: ProviderModelFeatureSet;
    runtime: ProviderRuntimeDescriptor;
    reasoningEfforts?: RuntimeReasoningEffort[];
    promptFamily?: string;
    contextLength?: number;
    maxOutputTokens?: number;
    inputPrice?: number;
    outputPrice?: number;
    cacheReadPrice?: number;
    cacheWritePrice?: number;
    price?: number;
    latency?: number;
    tps?: number;
}

export interface ProviderAuthStateRecord {
    profileId: string;
    providerId: RuntimeProviderId;
    authMethod: ProviderAuthMethod | 'none';
    authState: ProviderAuthState;
    accountId?: string;
    organizationId?: string;
    tokenExpiresAt?: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    updatedAt: string;
}

export interface ProviderExecutionPreferenceRecord {
    providerId: 'openai';
    mode: OpenAIExecutionMode;
    canUseRealtimeWebSocket: boolean;
    disabledReason?: 'provider_not_supported' | 'api_key_required' | 'base_url_not_supported';
}

export interface ProviderAuthFlowRecord {
    id: string;
    profileId: string;
    providerId: RuntimeProviderId;
    flowType: ProviderAuthFlowType;
    authMethod: Extract<ProviderAuthMethod, 'device_code' | 'oauth_pkce' | 'oauth_device'>;
    nonce?: string;
    state?: string;
    codeVerifier?: string;
    redirectUri?: string;
    deviceCode?: string;
    userCode?: string;
    verificationUri?: string;
    pollIntervalSeconds?: number;
    expiresAt: string;
    status: ProviderAuthFlowStatus;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    createdAt: string;
    updatedAt: string;
    consumedAt?: string;
}

export interface KiloModelRoutingPreferenceRecord {
    profileId: string;
    providerId: 'kilo';
    modelId: string;
    routingMode: KiloRoutingMode;
    sort?: KiloDynamicSort;
    pinnedProviderId?: string;
    updatedAt: string;
}

export interface ProviderDiscoverySnapshotRecord {
    profileId: string;
    providerId: string;
    kind: 'models' | 'providers';
    status: 'ok' | 'error';
    etag?: string;
    payload: Record<string, unknown>;
    fetchedAt: string;
}

export type AppContextSettingsRecord = ContextGlobalSettings;

export interface AppPromptLayerSettingsRecord {
    globalInstructions: string;
    updatedAt: string;
}

export interface BuiltInModePromptOverrideRecord {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    prompt: ModePromptDefinition;
    updatedAt: string;
}

export type AppComposerMediaSettingsRecord = ComposerMediaSettings;

export type ProfileContextSettingsRecord = ContextProfileSettings;

export type ModelLimitOverrideRecord = RuntimeModelLimitOverrideRecord;

export interface SessionContextCompactionRecord {
    profileId: string;
    sessionId: EntityId<'sess'>;
    cutoffMessageId: EntityId<'msg'>;
    summaryText: string;
    source: ContextCompactionSource;
    thresholdTokens: number;
    estimatedInputTokens: number;
    createdAt: string;
    updatedAt: string;
}

export interface ToolRecord {
    id: string;
    label: string;
    description: string;
    permissionPolicy: PermissionPolicy;
    capabilities: ToolCapability[];
    requiresWorkspace: boolean;
    allowsExternalPaths: boolean;
    allowsIgnoredPaths: boolean;
}

export type McpDiscoveredToolRecord = RuntimeMcpDiscoveredToolRecord;

export type McpServerRecord = RuntimeMcpServerRecord;

export const runtimeEntityTypes = [
    'session',
    'run',
    'profile',
    'permission',
    'provider',
    'tool',
    'mcp',
    'runtime',
    'conversation',
    'thread',
    'tag',
    'diff',
    'checkpoint',
    'plan',
    'orchestrator',
    'message',
    'messagePart',
] as const;

export type RuntimeEntityType = (typeof runtimeEntityTypes)[number];

export const runtimeEventDomains = [
    'conversation',
    'thread',
    'session',
    'run',
    'message',
    'messagePart',
    'tag',
    'provider',
    'diff',
    'plan',
    'checkpoint',
    'orchestrator',
    'profile',
    'permission',
    'tool',
    'mcp',
    'runtime',
] as const;

export type RuntimeEventDomain = (typeof runtimeEventDomains)[number];

export const runtimeEventOperations = ['upsert', 'remove', 'status', 'append', 'reset', 'sync'] as const;

export type RuntimeEventOperation = (typeof runtimeEventOperations)[number];

export interface RuntimeEventRecordV1 {
    sequence: number;
    eventId: EntityId<'evt'>;
    entityType: RuntimeEntityType;
    domain: RuntimeEventDomain;
    operation: RuntimeEventOperation;
    entityId: string;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface ConversationRecord {
    id: string;
    profileId: string;
    scope: 'detached' | 'workspace';
    workspaceFingerprint?: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}

export type WorkspaceRootRecord = RuntimeWorkspaceRootRecord;

export interface ThreadRecord {
    id: string;
    profileId: string;
    conversationId: string;
    title: string;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    parentThreadId?: string;
    rootThreadId: string;
    delegatedFromOrchestratorRunId?: EntityId<'orch'>;
    isFavorite: boolean;
    executionEnvironmentMode: ExecutionEnvironmentMode;
    sandboxId?: EntityId<'sb'>;
    lastAssistantAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ThreadListRecord extends ThreadRecord {
    scope: 'detached' | 'workspace';
    workspaceFingerprint?: string;
    anchorKind: 'workspace' | 'playground';
    anchorId?: string;
    sessionCount: number;
    latestSessionUpdatedAt?: string;
}

export interface TagRecord {
    id: string;
    profileId: string;
    label: string;
    createdAt: string;
    updatedAt: string;
}

export interface ThreadTagRecord {
    profileId: string;
    threadId: string;
    tagId: string;
    createdAt: string;
}

export interface DiffRecord {
    id: string;
    profileId: string;
    sessionId: string;
    runId: string | null;
    summary: string;
    artifact: DiffArtifact;
    createdAt: string;
    updatedAt: string;
}

export interface DiffFileArtifact {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type_changed' | 'untracked';
    previousPath?: string;
    addedLines?: number;
    deletedLines?: number;
}

export interface GitDiffArtifact {
    kind: 'git';
    workspaceRootPath: string;
    workspaceLabel: string;
    baseRef: 'HEAD';
    fileCount: number;
    totalAddedLines?: number;
    totalDeletedLines?: number;
    files: DiffFileArtifact[];
    fullPatch: string;
    patchesByPath: Record<string, string>;
}

export interface UnsupportedDiffArtifact {
    kind: 'unsupported';
    workspaceRootPath: string;
    workspaceLabel: string;
    reason: 'workspace_not_git' | 'git_unavailable' | 'workspace_unresolved' | 'capture_failed';
    detail: string;
}

export type DiffArtifact = GitDiffArtifact | UnsupportedDiffArtifact;

export interface CheckpointRecord {
    id: EntityId<'ckpt'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    threadId: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    diffId?: string;
    workspaceFingerprint: string;
    sandboxId?: EntityId<'sb'>;
    executionTargetKey: string;
    executionTargetKind: 'workspace' | 'sandbox';
    executionTargetLabel: string;
    createdByKind: 'system' | 'user';
    checkpointKind: 'auto' | 'safety' | 'named';
    milestoneTitle?: string;
    retentionDisposition?: 'milestone' | 'protected_recent' | 'eligible_for_cleanup';
    snapshotFileCount: number;
    topLevelTab: TopLevelTab;
    modeKey: string;
    summary: string;
    createdAt: string;
    updatedAt: string;
}

export interface CheckpointStorageSummary {
    profileId: string;
    looseReferencedBlobCount: number;
    looseReferencedByteSize: number;
    packedReferencedBlobCount: number;
    packedReferencedByteSize: number;
    totalReferencedBlobCount: number;
    totalReferencedByteSize: number;
    lastCompactionRun?: CheckpointCompactionRunRecord;
}

export interface CheckpointCompactionRunRecord {
    id: EntityId<'cpr'>;
    profileId: string;
    triggerKind: 'automatic' | 'manual';
    status: 'success' | 'failed' | 'noop';
    message?: string;
    blobCountBefore: number;
    blobCountAfter: number;
    bytesBefore: number;
    bytesAfter: number;
    blobsCompacted: number;
    databaseReclaimed: boolean;
    startedAt: string;
    completedAt: string;
}

export interface CheckpointChangesetEntryRecord {
    changesetId?: EntityId<'chg'>;
    relativePath: string;
    changeKind: 'added' | 'modified' | 'deleted';
    beforeBlobSha256?: string;
    beforeByteSize?: number;
    beforeBytes?: Uint8Array;
    afterBlobSha256?: string;
    afterByteSize?: number;
    afterBytes?: Uint8Array;
}

export interface CheckpointChangesetRecord {
    id: EntityId<'chg'>;
    profileId: string;
    checkpointId: EntityId<'ckpt'>;
    sourceChangesetId?: EntityId<'chg'>;
    sessionId: EntityId<'sess'>;
    threadId: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    executionTargetKey: string;
    executionTargetKind: 'workspace' | 'sandbox';
    executionTargetLabel: string;
    createdByKind: 'system' | 'user';
    changesetKind: 'run_capture' | 'revert';
    summary: string;
    changeCount: number;
    createdAt: string;
    updatedAt: string;
    entries: CheckpointChangesetEntryRecord[];
}

export type SandboxRecord = RuntimeSandboxRecord;

export interface RunRecord {
    id: EntityId<'run'>;
    sessionId: EntityId<'sess'>;
    profileId: string;
    prompt: string;
    status: RunStatus;
    providerId?: RuntimeProviderId;
    modelId?: string;
    authMethod?: ProviderAuthMethod | 'none';
    reasoning?: {
        effort: RuntimeReasoningEffort;
        summary: RuntimeReasoningSummary;
        includeEncrypted: boolean;
    };
    cache?: {
        strategy: 'auto' | 'manual';
        key?: string;
        applied: boolean;
        reason?: string;
    };
    transport?: {
        requestedFamily: RuntimeRequestedTransportFamily;
        selected?: ProviderRuntimeTransportFamily;
        degradedReason?: string;
    };
    startedAt?: string;
    completedAt?: string;
    abortedAt?: string;
    errorCode?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface MessageRecord {
    id: EntityId<'msg'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    role: 'user' | 'assistant' | 'system' | 'tool';
    createdAt: string;
    updatedAt: string;
}

export interface MessagePartRecord {
    id: EntityId<'part'>;
    messageId: EntityId<'msg'>;
    sequence: number;
    partType: RuntimeMessagePartType;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface MessageMediaRecord {
    mediaId: string;
    messagePartId: EntityId<'part'>;
    mimeType: string;
    width: number;
    height: number;
    byteSize: number;
    sha256: string;
    createdAt: string;
}

export interface RunUsageRecord {
    runId: EntityId<'run'>;
    providerId: RuntimeProviderId;
    modelId: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    costMicrounits?: number;
    billedVia: 'kilo_gateway' | 'openai_api' | 'openai_subscription' | 'zai_api' | 'moonshot_api';
    recordedAt: string;
}

export interface PlanQuestionRecord {
    id: string;
    question: string;
}

export interface PlanRecord {
    id: EntityId<'plan'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
    status: 'awaiting_answers' | 'draft' | 'approved' | 'implementing' | 'implemented' | 'failed' | 'cancelled';
    sourcePrompt: string;
    summaryMarkdown: string;
    questions: PlanQuestionRecord[];
    answers: Record<string, string>;
    workspaceFingerprint?: string;
    implementationRunId?: EntityId<'run'>;
    orchestratorRunId?: EntityId<'orch'>;
    approvedAt?: string;
    implementedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PlanItemRecord {
    id: EntityId<'step'>;
    planId: EntityId<'plan'>;
    sequence: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
    runId?: EntityId<'run'>;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorRunRecord {
    id: EntityId<'orch'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    planId: EntityId<'plan'>;
    status: 'running' | 'completed' | 'aborted' | 'failed';
    executionStrategy: 'delegate' | 'parallel';
    activeStepIndex?: number;
    startedAt: string;
    completedAt?: string;
    abortedAt?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorStepRecord {
    id: EntityId<'step'>;
    orchestratorRunId: EntityId<'orch'>;
    sequence: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    activeRunId?: EntityId<'run'>;
    runId?: EntityId<'run'>;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PermissionPolicyOverrideRecord {
    profileId: string;
    scopeKey: string;
    resource: string;
    policy: PermissionPolicy;
    createdAt: string;
    updatedAt: string;
}

export interface ProviderUsageSummary {
    providerId: RuntimeProviderId;
    runCount: number;
    totalTokens: number;
    totalCostMicrounits: number;
}

export interface OpenAISubscriptionUsageWindowSummary {
    windowLabel: 'last_5_hours' | 'last_7_days';
    windowStart: string;
    windowEnd: string;
    runCount: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    totalCostMicrounits: number;
    averageLatencyMs?: number;
}

export interface OpenAISubscriptionUsageSummary {
    providerId: 'openai_codex';
    billedVia: 'openai_subscription';
    fiveHour: OpenAISubscriptionUsageWindowSummary;
    weekly: OpenAISubscriptionUsageWindowSummary;
}

export interface OpenAISubscriptionRateLimitWindow {
    usedPercent: number;
    windowMinutes?: number;
    resetsAt?: number;
}

export interface OpenAISubscriptionRateLimitEntry {
    limitId: string;
    limitName?: string;
    primary?: OpenAISubscriptionRateLimitWindow;
    secondary?: OpenAISubscriptionRateLimitWindow;
}

export interface OpenAISubscriptionRateLimitsSummary {
    providerId: 'openai_codex';
    source: 'chatgpt_wham' | 'unavailable';
    fetchedAt: number;
    planType?: string;
    primary?: OpenAISubscriptionRateLimitWindow;
    secondary?: OpenAISubscriptionRateLimitWindow;
    limits: OpenAISubscriptionRateLimitEntry[];
    reason?: 'oauth_required' | 'not_authenticated' | 'missing_access_token' | 'fetch_failed' | 'invalid_payload';
    detail?: string;
}

export type ModeDefinitionRecord = ModeDefinition;

export type RulesetDefinitionRecord = RulesetDefinition;

export type SkillfileDefinitionRecord = SkillfileDefinition;

export type MarketplacePackageRecord = MarketplacePackage;

export type KiloAccountContextRecord = KiloAccountContext;

export type ProviderSecretKindRecord = ProviderSecretKind;

export type ProviderSecretRecord = ProviderSecret;

export interface RuntimeSnapshotV1 {
    generatedAt: string;
    lastSequence: number;
    profiles: ProfileRecord[];
    activeProfileId: string;
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    messages: MessageRecord[];
    messageParts: MessagePartRecord[];
    runUsage: RunUsageRecord[];
    providerUsageSummaries: ProviderUsageSummary[];
    permissions: PermissionRecord[];
    executionPreset: ExecutionPreset;
    providers: Array<
        ProviderRecord & {
            isDefault: boolean;
            authMethod: ProviderAuthMethod | 'none';
            authState: string;
        }
    >;
    providerModels: ProviderModelRecord[];
    providerAuthStates: ProviderAuthStateRecord[];
    providerAuthFlows: ProviderAuthFlowRecord[];
    providerDiscoverySnapshots: ProviderDiscoverySnapshotRecord[];
    tools: ToolRecord[];
    mcpServers: McpServerRecord[];
    conversations: ConversationRecord[];
    workspaceRoots: WorkspaceRootRecord[];
    sandboxes: SandboxRecord[];
    threads: ThreadRecord[];
    tags: TagRecord[];
    threadTags: ThreadTagRecord[];
    diffs: DiffRecord[];
    checkpoints: CheckpointRecord[];
    modeDefinitions: ModeDefinitionRecord[];
    rulesets: RulesetDefinitionRecord[];
    skillfiles: SkillfileDefinitionRecord[];
    marketplacePackages: MarketplacePackageRecord[];
    kiloAccountContext: KiloAccountContextRecord;
    providerSecrets: ProviderSecretRecord[];
    defaults: {
        providerId: string;
        modelId: string;
    };
}

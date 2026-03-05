import type {
    EntityId,
    KiloDynamicSort,
    KiloRoutingMode,
    KiloAccountContext,
    MarketplacePackage,
    ModeDefinition,
    ProviderAuthFlowStatus,
    ProviderAuthFlowType,
    ProviderAuthMethod,
    ProviderAuthState,
    PermissionPolicy,
    RuntimeOpenAITransport,
    RuntimeMessagePartType,
    RuntimeReasoningEffort,
    RuntimeReasoningSummary,
    RuntimeProviderId,
    RulesetDefinition,
    RunStatus,
    SecretReference,
    SkillfileDefinition,
} from '@/app/backend/runtime/contracts';

export interface SessionSummaryRecord {
    id: EntityId<'sess'>;
    profileId: string;
    conversationId: string;
    threadId: string;
    kind: 'local' | 'worktree' | 'cloud';
    runStatus: RunStatus;
    turnCount: number;
    createdAt: string;
    updatedAt: string;
}

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

export interface PermissionRecord {
    id: EntityId<'perm'>;
    policy: PermissionPolicy;
    resource: string;
    decision: 'pending' | 'granted' | 'denied';
    createdAt: string;
    updatedAt: string;
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
    supportsTools: boolean;
    supportsReasoning: boolean;
    supportsVision: boolean;
    supportsAudioInput: boolean;
    supportsAudioOutput: boolean;
    inputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    outputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    promptFamily?: string;
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

export interface ToolRecord {
    id: string;
    label: string;
    description: string;
    permissionPolicy: PermissionPolicy;
}

export interface McpServerRecord {
    id: string;
    label: string;
    authMode: 'none' | 'token';
    connectionState: 'disconnected' | 'connected';
    authState: 'unauthenticated' | 'authenticated';
}

export type RuntimeEntityType =
    | 'session'
    | 'run'
    | 'profile'
    | 'permission'
    | 'provider'
    | 'tool'
    | 'mcp'
    | 'runtime'
    | 'conversation'
    | 'thread'
    | 'tag'
    | 'diff'
    | 'plan'
    | 'orchestrator';

export interface RuntimeEventRecordV1 {
    sequence: number;
    eventId: EntityId<'evt'>;
    entityType: RuntimeEntityType;
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

export interface ThreadRecord {
    id: string;
    profileId: string;
    conversationId: string;
    title: string;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    parentThreadId?: string;
    rootThreadId: string;
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
    payload: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

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
        openaiPreference: RuntimeOpenAITransport;
        selected?: 'responses' | 'chat_completions';
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
    billedVia: 'kilo_gateway' | 'openai_api' | 'openai_subscription';
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
    providerId: 'openai';
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
    providerId: 'openai';
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

export type SecretReferenceRecord = SecretReference;

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
    threads: ThreadRecord[];
    tags: TagRecord[];
    threadTags: ThreadTagRecord[];
    diffs: DiffRecord[];
    modeDefinitions: ModeDefinitionRecord[];
    rulesets: RulesetDefinitionRecord[];
    skillfiles: SkillfileDefinitionRecord[];
    marketplacePackages: MarketplacePackageRecord[];
    kiloAccountContext: KiloAccountContextRecord;
    secretReferences: SecretReferenceRecord[];
    defaults: {
        providerId: string;
        modelId: string;
    };
}

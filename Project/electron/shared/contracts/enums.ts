export const firstPartyProviderIds = ['kilo', 'openai', 'openai_codex', 'zai', 'moonshot'] as const;
export type FirstPartyProviderId = (typeof firstPartyProviderIds)[number];

export const conversationScopes = ['detached', 'workspace'] as const;
export type ConversationScope = (typeof conversationScopes)[number];

export const sessionKinds = ['local', 'sandbox', 'cloud'] as const;
export type SessionKind = (typeof sessionKinds)[number];

export const executionEnvironmentModes = ['local', 'new_sandbox', 'sandbox'] as const;
export type ExecutionEnvironmentMode = (typeof executionEnvironmentModes)[number];

export const sandboxStatuses = ['pending', 'ready', 'missing', 'broken', 'removed'] as const;
export type SandboxStatus = (typeof sandboxStatuses)[number];

export const conversationThreadSorts = ['latest', 'alphabetical'] as const;
export type ConversationThreadSort = (typeof conversationThreadSorts)[number];

export const conversationThreadGroupViews = ['workspace', 'branch'] as const;
export type ConversationThreadGroupView = (typeof conversationThreadGroupViews)[number];

export const conversationEditResolutions = ['ask', 'truncate', 'branch'] as const;
export type ConversationEditResolution = (typeof conversationEditResolutions)[number];

export const threadTitleGenerationModes = ['template', 'utility_refine'] as const;
export type ThreadTitleGenerationMode = (typeof threadTitleGenerationModes)[number];

export const utilityModelConsumerIds = ['conversation_naming', 'context_compaction'] as const;
export type UtilityModelConsumerId = (typeof utilityModelConsumerIds)[number];

export const topLevelTabs = ['chat', 'agent', 'orchestrator'] as const;
export type TopLevelTab = (typeof topLevelTabs)[number];

export const sessionEditModes = ['truncate', 'branch'] as const;
export type SessionEditMode = (typeof sessionEditModes)[number];

export const agentModes = ['plan', 'debug', 'code', 'ask'] as const;
export type AgentMode = (typeof agentModes)[number];

export const orchestratorModes = ['plan', 'orchestrate', 'debug'] as const;
export type OrchestratorMode = (typeof orchestratorModes)[number];

export const permissionPolicies = ['ask', 'allow', 'deny'] as const;
export type PermissionPolicy = (typeof permissionPolicies)[number];

export const executionPresets = ['privacy', 'standard', 'yolo'] as const;
export type ExecutionPreset = (typeof executionPresets)[number];

export const permissionScopeKinds = ['tool', 'boundary'] as const;
export type PermissionScopeKind = (typeof permissionScopeKinds)[number];

export const permissionResolutions = ['deny', 'allow_once', 'allow_profile', 'allow_workspace'] as const;
export type PermissionResolution = (typeof permissionResolutions)[number];

export const toolCapabilities = ['filesystem_read', 'filesystem_write', 'shell', 'git', 'mcp', 'code_runtime'] as const;
export type ToolCapability = (typeof toolCapabilities)[number];

export const workflowCapabilities = [
    'planning',
    'orchestration',
    'recovery',
    'review',
    'artifact_view',
    'flow_execution',
] as const;
export type WorkflowCapability = (typeof workflowCapabilities)[number];

export const behaviorFlags = [
    'approval_gated',
    'checkpoint_eligible',
    'workspace_mutating',
    'artifact_producing',
    'child_worker_capable',
    'read_only_execution',
] as const;
export type BehaviorFlag = (typeof behaviorFlags)[number];

export const runtimeRequirementProfiles = [
    'general',
    'read_only_agent',
    'mutating_agent',
    'planner',
    'orchestrator',
    'reviewer',
] as const;
export type RuntimeRequirementProfile = (typeof runtimeRequirementProfiles)[number];

export const flowTriggerKinds = ['manual'] as const;
export type FlowTriggerKind = (typeof flowTriggerKinds)[number];

export const flowStepKinds = ['legacy_command', 'mode_run', 'workflow', 'approval_gate'] as const;
export type FlowStepKind = (typeof flowStepKinds)[number];

export const flowInstanceStatuses = [
    'queued',
    'running',
    'approval_required',
    'failed',
    'completed',
    'cancelled',
] as const;
export type FlowInstanceStatus = (typeof flowInstanceStatuses)[number];

export const flowApprovalKinds = ['flow_gate', 'tool_permission', 'plan_checkpoint'] as const;
export type FlowApprovalKind = (typeof flowApprovalKinds)[number];

export const flowDefinitionOriginKinds = ['canonical', 'branch_workflow_adapter'] as const;
export type FlowDefinitionOriginKind = (typeof flowDefinitionOriginKinds)[number];

export const toolMutabilities = ['read_only', 'mutating'] as const;
export type ToolMutability = (typeof toolMutabilities)[number];

export const contextBudgets = ['low', 'balanced', 'high'] as const;
export type ContextBudget = (typeof contextBudgets)[number];

export const contextSettingModes = ['percent'] as const;
export type ContextSettingMode = (typeof contextSettingModes)[number];

export const contextProfileOverrideModes = ['inherit', 'percent', 'fixed_tokens'] as const;
export type ContextProfileOverrideMode = (typeof contextProfileOverrideModes)[number];

export const contextCompactionSources = ['auto', 'manual'] as const;
export type ContextCompactionSource = (typeof contextCompactionSources)[number];

export const memoryTypes = ['semantic', 'episodic', 'procedural'] as const;
export type MemoryType = (typeof memoryTypes)[number];

export const memoryScopeKinds = ['global', 'workspace', 'thread', 'run'] as const;
export type MemoryScopeKind = (typeof memoryScopeKinds)[number];

export const memoryStates = ['active', 'disabled', 'superseded'] as const;
export type MemoryState = (typeof memoryStates)[number];

export const memoryCreatedByKinds = ['user', 'system'] as const;
export type MemoryCreatedByKind = (typeof memoryCreatedByKinds)[number];

export const contextLimitSources = ['override', 'discovery', 'static', 'unknown', 'mixed'] as const;
export type ContextLimitSource = (typeof contextLimitSources)[number];

export const tokenCountModes = ['exact', 'estimated'] as const;
export type TokenCountMode = (typeof tokenCountModes)[number];

export const runStatuses = ['idle', 'running', 'completed', 'aborted', 'error'] as const;
export type RunStatus = (typeof runStatuses)[number];

export const runtimeReasoningEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export type RuntimeReasoningEffort = (typeof runtimeReasoningEfforts)[number];

export const runtimeReasoningSummaries = ['auto', 'none'] as const;
export type RuntimeReasoningSummary = (typeof runtimeReasoningSummaries)[number];

export const runtimeCacheStrategies = ['auto', 'manual'] as const;
export type RuntimeCacheStrategy = (typeof runtimeCacheStrategies)[number];

export const runtimeRequestedTransportFamilies = ['auto', 'openai_responses', 'openai_chat_completions'] as const;
export type RuntimeRequestedTransportFamily = (typeof runtimeRequestedTransportFamilies)[number];

export const kiloRoutingModes = ['dynamic', 'pinned'] as const;
export type KiloRoutingMode = (typeof kiloRoutingModes)[number];

export const kiloDynamicSorts = ['default', 'price', 'throughput', 'latency'] as const;
export type KiloDynamicSort = (typeof kiloDynamicSorts)[number];

export const runtimeMessagePartTypes = [
    'text',
    'image',
    'reasoning',
    'reasoning_summary',
    'reasoning_encrypted',
    'tool_call',
    'tool_result',
    'error',
    'status',
] as const;
export type RuntimeMessagePartType = (typeof runtimeMessagePartTypes)[number];

export const streamEventTypes = ['status', 'message-part', 'tool-call', 'error'] as const;
export type StreamEventType = (typeof streamEventTypes)[number];

export const runtimeResetTargets = ['workspace', 'workspace_all', 'profile_settings', 'full'] as const;
export type RuntimeResetTarget = (typeof runtimeResetTargets)[number];

export const providerIds = firstPartyProviderIds;
export type RuntimeProviderId = FirstPartyProviderId;

export const providerAuthMethods = ['api_key', 'device_code', 'oauth_pkce', 'oauth_device'] as const;
export type ProviderAuthMethod = (typeof providerAuthMethods)[number];

export const openAIExecutionModes = ['standard_http', 'realtime_websocket'] as const;
export type OpenAIExecutionMode = (typeof openAIExecutionModes)[number];

export const providerAuthStates = ['logged_out', 'pending', 'configured', 'authenticated', 'error', 'expired'] as const;
export type ProviderAuthState = (typeof providerAuthStates)[number];

export const providerAuthFlowTypes = ['device_code', 'oauth_pkce', 'oauth_device'] as const;
export type ProviderAuthFlowType = (typeof providerAuthFlowTypes)[number];

export const providerAuthFlowStatuses = ['pending', 'completed', 'cancelled', 'expired', 'failed'] as const;
export type ProviderAuthFlowStatus = (typeof providerAuthFlowStatuses)[number];

export const providerSecretKinds = ['api_key', 'access_token', 'refresh_token'] as const;
export type ProviderSecretKind = (typeof providerSecretKinds)[number];

export const planStatuses = [
    'awaiting_answers',
    'draft',
    'approved',
    'implementing',
    'implemented',
    'failed',
    'cancelled',
] as const;
export type PlanStatus = (typeof planStatuses)[number];

export const planItemStatuses = ['pending', 'running', 'completed', 'failed', 'aborted'] as const;
export type PlanItemStatus = (typeof planItemStatuses)[number];

export const orchestratorRunStatuses = ['running', 'completed', 'aborted', 'failed'] as const;
export type OrchestratorRunStatus = (typeof orchestratorRunStatuses)[number];

export const orchestratorExecutionStrategies = ['delegate', 'parallel'] as const;
export type OrchestratorExecutionStrategy = (typeof orchestratorExecutionStrategies)[number];

export const registryScopes = ['system', 'global', 'workspace', 'session'] as const;
export type RegistryScope = (typeof registryScopes)[number];

export const registrySourceKinds = ['system_seed', 'global_file', 'workspace_file', 'session_override'] as const;
export type RegistrySourceKind = (typeof registrySourceKinds)[number];

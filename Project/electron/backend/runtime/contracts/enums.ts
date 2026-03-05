import type { FirstPartyProviderId } from '@/app/backend/providers/registry';

export const conversationScopes = ['detached', 'workspace'] as const;
export type ConversationScope = (typeof conversationScopes)[number];

export const sessionKinds = ['local', 'worktree', 'cloud'] as const;
export type SessionKind = (typeof sessionKinds)[number];

export const conversationThreadSorts = ['latest', 'alphabetical'] as const;
export type ConversationThreadSort = (typeof conversationThreadSorts)[number];

export const conversationThreadGroupViews = ['workspace', 'branch'] as const;
export type ConversationThreadGroupView = (typeof conversationThreadGroupViews)[number];

export const conversationEditResolutions = ['ask', 'truncate', 'branch'] as const;
export type ConversationEditResolution = (typeof conversationEditResolutions)[number];

export const threadTitleGenerationModes = ['template', 'ai_optional'] as const;
export type ThreadTitleGenerationMode = (typeof threadTitleGenerationModes)[number];

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

export const contextBudgets = ['low', 'balanced', 'high'] as const;
export type ContextBudget = (typeof contextBudgets)[number];

export const runStatuses = ['idle', 'running', 'completed', 'aborted', 'error'] as const;
export type RunStatus = (typeof runStatuses)[number];

export const runtimeReasoningEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export type RuntimeReasoningEffort = (typeof runtimeReasoningEfforts)[number];

export const runtimeReasoningSummaries = ['auto', 'none'] as const;
export type RuntimeReasoningSummary = (typeof runtimeReasoningSummaries)[number];

export const runtimeCacheStrategies = ['auto', 'manual'] as const;
export type RuntimeCacheStrategy = (typeof runtimeCacheStrategies)[number];

export const runtimeOpenAITransports = ['responses', 'chat', 'auto'] as const;
export type RuntimeOpenAITransport = (typeof runtimeOpenAITransports)[number];

export const kiloRoutingModes = ['dynamic', 'pinned'] as const;
export type KiloRoutingMode = (typeof kiloRoutingModes)[number];

export const kiloDynamicSorts = ['default', 'price', 'throughput', 'latency'] as const;
export type KiloDynamicSort = (typeof kiloDynamicSorts)[number];

export const runtimeMessagePartTypes = [
    'text',
    'reasoning',
    'reasoning_summary',
    'reasoning_encrypted',
    'tool_call',
    'error',
    'status',
] as const;
export type RuntimeMessagePartType = (typeof runtimeMessagePartTypes)[number];

export const streamEventTypes = ['status', 'message-part', 'tool-call', 'error'] as const;
export type StreamEventType = (typeof streamEventTypes)[number];

export const runtimeResetTargets = ['workspace', 'workspace_all', 'profile_settings', 'full'] as const;
export type RuntimeResetTarget = (typeof runtimeResetTargets)[number];

export const providerIds = ['kilo', 'openai'] as const;
export type RuntimeProviderId = FirstPartyProviderId;

export const providerAuthMethods = ['api_key', 'device_code', 'oauth_pkce', 'oauth_device'] as const;
export type ProviderAuthMethod = (typeof providerAuthMethods)[number];

export const providerAuthStates = ['logged_out', 'pending', 'configured', 'authenticated', 'error', 'expired'] as const;
export type ProviderAuthState = (typeof providerAuthStates)[number];

export const providerAuthFlowTypes = ['device_code', 'oauth_pkce', 'oauth_device'] as const;
export type ProviderAuthFlowType = (typeof providerAuthFlowTypes)[number];

export const providerAuthFlowStatuses = ['pending', 'completed', 'cancelled', 'expired', 'failed'] as const;
export type ProviderAuthFlowStatus = (typeof providerAuthFlowStatuses)[number];

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

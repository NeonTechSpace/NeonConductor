import { type as arktype } from 'arktype';
import { randomUUID } from 'node:crypto';

import type { FirstPartyProviderId } from '@/app/backend/providers/registry';

export type EntityIdPrefix =
    | 'ws'
    | 'thr'
    | 'wt'
    | 'run'
    | 'msg'
    | 'part'
    | 'tag'
    | 'sess'
    | 'perm'
    | 'tool'
    | 'mcp'
    | 'provider'
    | 'model'
    | 'evt';

export type EntityId<P extends EntityIdPrefix = EntityIdPrefix> = `${P}_${string}`;

export function createEntityId<P extends EntityIdPrefix>(prefix: P): EntityId<P> {
    return `${prefix}_${randomUUID()}`;
}

export const conversationScopes = ['detached', 'workspace'] as const;
export type ConversationScope = (typeof conversationScopes)[number];

export const sessionKinds = ['local', 'worktree', 'cloud'] as const;
export type SessionKind = (typeof sessionKinds)[number];

export const topLevelTabs = ['chat', 'agent', 'orchestrator'] as const;
export type TopLevelTab = (typeof topLevelTabs)[number];

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

export interface ModeDefinition {
    id: string;
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    prompt: Record<string, unknown>;
    executionPolicy: Record<string, unknown>;
    source: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface RulesetDefinition {
    id: string;
    profileId: string;
    workspaceFingerprint?: string;
    name: string;
    bodyMarkdown: string;
    source: string;
    enabled: boolean;
    precedence: number;
    createdAt: string;
    updatedAt: string;
}

export interface SkillfileDefinition {
    id: string;
    profileId: string;
    workspaceFingerprint?: string;
    name: string;
    bodyMarkdown: string;
    source: string;
    enabled: boolean;
    precedence: number;
    createdAt: string;
    updatedAt: string;
}

export interface MarketplacePackage {
    id: string;
    packageKind: string;
    slug: string;
    version: string;
    enabled: boolean;
    pinned: boolean;
    source: Record<string, unknown>;
    installedAt: string;
    updatedAt: string;
    assets: Array<{
        assetKind: string;
        assetId: string;
        createdAt: string;
    }>;
}

export interface KiloAccountContext {
    profileId: string;
    accountId?: string;
    displayName: string;
    emailMasked: string;
    authState: string;
    tokenExpiresAt?: string;
    organizations: Array<{
        id: string;
        organizationId: string;
        name: string;
        isActive: boolean;
        entitlement: Record<string, unknown>;
    }>;
    updatedAt: string;
}

export interface SecretReference {
    id: string;
    profileId: string;
    providerId: RuntimeProviderId;
    secretKeyRef: string;
    secretKind: string;
    status: string;
    updatedAt: string;
}

export interface StreamEventEnvelope {
    id: EntityId<'evt'>;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    eventType: StreamEventType;
    at: string;
    payload: Record<string, unknown>;
}

export interface ProfileInput {
    profileId: string;
}

export interface SessionCreateInput {
    scope: ConversationScope;
    kind: SessionKind;
    workspaceFingerprint?: string;
}

export interface SessionByIdInput {
    sessionId: EntityId<'sess'>;
}

export interface SessionPromptInput extends SessionByIdInput {
    prompt: string;
}

export interface ProviderSetDefaultInput extends ProfileInput {
    providerId: RuntimeProviderId;
    modelId: string;
}

export type ProviderListProvidersInput = ProfileInput;

export interface ProviderByIdInput extends ProfileInput {
    providerId: RuntimeProviderId;
}

export type ProviderListModelsInput = ProviderByIdInput;

export interface ProviderSetApiKeyInput extends ProviderByIdInput {
    apiKey: string;
}

export type ProviderClearAuthInput = ProviderByIdInput;

export interface ProviderSyncCatalogInput extends ProviderByIdInput {
    force?: boolean;
}

export type ProviderListAuthMethodsInput = ProfileInput;

export interface ProviderStartAuthInput extends ProfileInput {
    providerId: RuntimeProviderId;
    method: ProviderAuthMethod;
}

export interface ProviderFlowInput extends ProviderByIdInput {
    flowId: string;
}

export type ProviderPollAuthInput = ProviderFlowInput;

export interface ProviderCompleteAuthInput extends ProviderFlowInput {
    code?: string;
}

export type ProviderCancelAuthInput = ProviderFlowInput;

export type ProviderRefreshAuthInput = ProviderByIdInput;

export type ProviderGetAccountContextInput = ProviderByIdInput;

export interface ProviderSetOrganizationInput extends ProfileInput {
    providerId: 'kilo';
    organizationId?: string | null;
}

export interface PermissionRequestInput {
    policy: PermissionPolicy;
    resource: string;
    rationale?: string;
}

export interface PermissionDecisionInput {
    requestId: EntityId<'perm'>;
}

export interface ToolInvokeInput {
    toolId: string;
    args?: Record<string, unknown>;
}

export interface McpByServerInput {
    serverId: string;
}

export interface RuntimeEventsSubscriptionInput {
    afterSequence?: number;
}

export type RuntimeSnapshotInput = ProfileInput;

export interface RuntimeResetInput {
    target: RuntimeResetTarget;
    profileId?: string;
    workspaceFingerprint?: string;
    dryRun?: boolean;
    confirm?: boolean;
}

export interface RuntimeResetCounts {
    settings: number;
    runtimeEvents: number;
    sessions: number;
    runs: number;
    permissions: number;
    conversations: number;
    threads: number;
    threadTags: number;
    tags: number;
    diffs: number;
    modeDefinitions: number;
    rulesets: number;
    skillfiles: number;
    marketplacePackages: number;
    marketplaceAssets: number;
    kiloAccountSnapshots: number;
    kiloOrgSnapshots: number;
    secretReferences: number;
    providerAuthStates: number;
    providerAuthFlows: number;
    providerCatalogModels: number;
    providerDiscoverySnapshots: number;
}

export interface RuntimeResetResult {
    dryRun: boolean;
    target: RuntimeResetTarget;
    applied: boolean;
    counts: RuntimeResetCounts;
}

export interface ContextBudgetInput {
    contextBudget: ContextBudget;
}

export const unknownInputSchema = arktype('unknown');

interface RuntimeParser<T> {
    parse: (input: unknown) => T;
}

function createParser<T>(parse: (input: unknown) => T): RuntimeParser<T> {
    return { parse };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Invalid "${field}": expected non-empty string.`);
    }

    return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readString(value, field);
}

function readBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`Invalid "${field}": expected boolean.`);
    }

    return value;
}

function readOptionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readBoolean(value, field);
}

function readEnumValue<const T extends readonly string[]>(value: unknown, field: string, allowedValues: T): T[number] {
    const text = readString(value, field);
    if ((allowedValues as readonly string[]).includes(text)) {
        return text as T[number];
    }

    throw new Error(`Invalid "${field}": expected one of ${allowedValues.join(', ')}.`);
}

function readEntityId<P extends EntityIdPrefix>(value: unknown, field: string, prefix: P): EntityId<P> {
    const text = readString(value, field);
    const expectedPrefix = `${prefix}_`;
    if (!text.startsWith(expectedPrefix)) {
        throw new Error(`Invalid "${field}": expected "${expectedPrefix}..." ID.`);
    }

    return text as EntityId<P>;
}

function readOptionalNumber(value: unknown, field: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Invalid "${field}": expected number.`);
    }

    return value;
}

function readObject(value: unknown, field: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`Invalid "${field}": expected object.`);
    }

    return value;
}

function readProfileId(source: Record<string, unknown>): string {
    return readString(source.profileId, 'profileId');
}

function readProviderId(value: unknown, field: string): RuntimeProviderId {
    return readEnumValue(value, field, providerIds);
}

function readProviderAuthMethod(value: unknown, field: string): ProviderAuthMethod {
    return readEnumValue(value, field, providerAuthMethods);
}

export function parseProfileInput(input: unknown): ProfileInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
    };
}

export function parseSessionCreateInput(input: unknown): SessionCreateInput {
    const source = readObject(input, 'input');

    const scope = readEnumValue(source.scope, 'scope', conversationScopes);
    const kind = readEnumValue(source.kind, 'kind', sessionKinds);
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    if (scope === 'workspace' && !workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": required when scope is "workspace".');
    }

    if (scope !== 'workspace' && workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": allowed only when scope is "workspace".');
    }

    return {
        scope,
        kind,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parseSessionByIdInput(input: unknown): SessionByIdInput {
    const source = readObject(input, 'input');

    return {
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
    };
}

export function parseSessionPromptInput(input: unknown): SessionPromptInput {
    const source = readObject(input, 'input');

    return {
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        prompt: readString(source.prompt, 'prompt'),
    };
}

export function parseProviderSetDefaultInput(input: unknown): ProviderSetDefaultInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        modelId: readString(source.modelId, 'modelId'),
    };
}

export function parseProviderListProvidersInput(input: unknown): ProviderListProvidersInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
    };
}

export function parseProviderByIdInput(input: unknown): ProviderByIdInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
    };
}

export function parseProviderListModelsInput(input: unknown): ProviderListModelsInput {
    return parseProviderByIdInput(input);
}

export function parseProviderSetApiKeyInput(input: unknown): ProviderSetApiKeyInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        apiKey: readString(source.apiKey, 'apiKey'),
    };
}

export function parseProviderClearAuthInput(input: unknown): ProviderClearAuthInput {
    return parseProviderByIdInput(input);
}

export function parseProviderSyncCatalogInput(input: unknown): ProviderSyncCatalogInput {
    const source = readObject(input, 'input');
    const force = readOptionalBoolean(source.force, 'force');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        ...(force !== undefined ? { force } : {}),
    };
}

export function parseProviderListAuthMethodsInput(input: unknown): ProviderListAuthMethodsInput {
    return parseProfileInput(input);
}

export function parseProviderStartAuthInput(input: unknown): ProviderStartAuthInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        method: readProviderAuthMethod(source.method, 'method'),
    };
}

export function parseProviderFlowInput(input: unknown): ProviderFlowInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        flowId: readString(source.flowId, 'flowId'),
    };
}

export function parseProviderPollAuthInput(input: unknown): ProviderPollAuthInput {
    return parseProviderFlowInput(input);
}

export function parseProviderCompleteAuthInput(input: unknown): ProviderCompleteAuthInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        flowId: readString(source.flowId, 'flowId'),
        ...(source.code !== undefined ? { code: readString(source.code, 'code') } : {}),
    };
}

export function parseProviderCancelAuthInput(input: unknown): ProviderCancelAuthInput {
    return parseProviderFlowInput(input);
}

export function parseProviderRefreshAuthInput(input: unknown): ProviderRefreshAuthInput {
    return parseProviderByIdInput(input);
}

export function parseProviderGetAccountContextInput(input: unknown): ProviderGetAccountContextInput {
    return parseProviderByIdInput(input);
}

export function parseProviderSetOrganizationInput(input: unknown): ProviderSetOrganizationInput {
    const source = readObject(input, 'input');
    const providerId = readProviderId(source.providerId, 'providerId');
    if (providerId !== 'kilo') {
        throw new Error('Invalid "providerId": organization selection is supported only for "kilo".');
    }

    const organizationId =
        source.organizationId === null ? null : readOptionalString(source.organizationId, 'organizationId');

    return {
        profileId: readProfileId(source),
        providerId,
        ...(organizationId !== undefined ? { organizationId } : {}),
    };
}

export function parsePermissionRequestInput(input: unknown): PermissionRequestInput {
    const source = readObject(input, 'input');
    const rationale = readOptionalString(source.rationale, 'rationale');

    return {
        policy: readEnumValue(source.policy, 'policy', permissionPolicies),
        resource: readString(source.resource, 'resource'),
        ...(rationale ? { rationale } : {}),
    };
}

export function parsePermissionDecisionInput(input: unknown): PermissionDecisionInput {
    const source = readObject(input, 'input');

    return {
        requestId: readEntityId(source.requestId, 'requestId', 'perm'),
    };
}

export function parseToolInvokeInput(input: unknown): ToolInvokeInput {
    const source = readObject(input, 'input');
    const args = source.args;

    return {
        toolId: readString(source.toolId, 'toolId'),
        ...(args !== undefined ? { args: readObject(args, 'args') } : {}),
    };
}

export function parseMcpByServerInput(input: unknown): McpByServerInput {
    const source = readObject(input, 'input');

    return {
        serverId: readString(source.serverId, 'serverId'),
    };
}

export function parseRuntimeEventsSubscriptionInput(input: unknown): RuntimeEventsSubscriptionInput {
    if (input === undefined) {
        return {};
    }

    const source = readObject(input, 'input');
    const afterSequence = readOptionalNumber(source.afterSequence, 'afterSequence');

    if (afterSequence !== undefined && (!Number.isInteger(afterSequence) || afterSequence < 0)) {
        throw new Error('Invalid "afterSequence": expected non-negative integer.');
    }

    return {
        ...(afterSequence !== undefined ? { afterSequence } : {}),
    };
}

export function parseRuntimeResetInput(input: unknown): RuntimeResetInput {
    const source = readObject(input, 'input');

    const target = readEnumValue(source.target, 'target', runtimeResetTargets);
    const profileId = readOptionalString(source.profileId, 'profileId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const dryRun = readOptionalBoolean(source.dryRun, 'dryRun') ?? false;
    const confirm = readOptionalBoolean(source.confirm, 'confirm');

    if (target === 'workspace' && !workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": required when target is "workspace".');
    }

    if ((target === 'profile_settings' || target === 'full') && !profileId) {
        throw new Error('Invalid "profileId": required when target is "profile_settings" or "full".');
    }

    if (!dryRun && confirm !== true) {
        throw new Error('Invalid "confirm": expected true when dryRun is false.');
    }

    return {
        target,
        ...(profileId ? { profileId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(dryRun ? { dryRun } : {}),
        ...(confirm !== undefined ? { confirm } : {}),
    };
}

export function parseContextBudgetInput(input: unknown): ContextBudgetInput {
    const source = readObject(input, 'input');
    return {
        contextBudget: readEnumValue(source.contextBudget, 'contextBudget', contextBudgets),
    };
}

export const profileInputSchema = createParser(parseProfileInput);
export const sessionCreateInputSchema = createParser(parseSessionCreateInput);
export const sessionByIdInputSchema = createParser(parseSessionByIdInput);
export const sessionPromptInputSchema = createParser(parseSessionPromptInput);
export const providerSetDefaultInputSchema = createParser(parseProviderSetDefaultInput);
export const providerListProvidersInputSchema = createParser(parseProviderListProvidersInput);
export const providerListModelsInputSchema = createParser(parseProviderListModelsInput);
export const providerByIdInputSchema = createParser(parseProviderByIdInput);
export const providerSetApiKeyInputSchema = createParser(parseProviderSetApiKeyInput);
export const providerClearAuthInputSchema = createParser(parseProviderClearAuthInput);
export const providerSyncCatalogInputSchema = createParser(parseProviderSyncCatalogInput);
export const providerListAuthMethodsInputSchema = createParser(parseProviderListAuthMethodsInput);
export const providerStartAuthInputSchema = createParser(parseProviderStartAuthInput);
export const providerPollAuthInputSchema = createParser(parseProviderPollAuthInput);
export const providerCompleteAuthInputSchema = createParser(parseProviderCompleteAuthInput);
export const providerCancelAuthInputSchema = createParser(parseProviderCancelAuthInput);
export const providerRefreshAuthInputSchema = createParser(parseProviderRefreshAuthInput);
export const providerGetAccountContextInputSchema = createParser(parseProviderGetAccountContextInput);
export const providerSetOrganizationInputSchema = createParser(parseProviderSetOrganizationInput);
export const permissionRequestInputSchema = createParser(parsePermissionRequestInput);
export const permissionDecisionInputSchema = createParser(parsePermissionDecisionInput);
export const toolInvokeInputSchema = createParser(parseToolInvokeInput);
export const mcpByServerInputSchema = createParser(parseMcpByServerInput);
export const runtimeEventsSubscriptionInputSchema = createParser(parseRuntimeEventsSubscriptionInput);
export const runtimeResetInputSchema = createParser(parseRuntimeResetInput);
export const contextBudgetInputSchema = createParser(parseContextBudgetInput);

import type {
    PermissionPolicy,
    PermissionResolution,
    PermissionScopeKind,
    TopLevelTab,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface PermissionRequestSummary {
    title: string;
    detail: string;
}

export interface PermissionApprovalCandidate {
    label: string;
    resource: string;
    detail?: string;
}

export interface PermissionRequestInput extends ProfileInput {
    policy: PermissionPolicy;
    resource: string;
    toolId: string;
    scopeKind: PermissionScopeKind;
    summary: PermissionRequestSummary;
    workspaceFingerprint?: string;
    commandText?: string;
    approvalCandidates?: PermissionApprovalCandidate[];
    rationale?: string;
}

export interface PermissionResolveInput extends ProfileInput {
    requestId: EntityId<'perm'>;
    resolution: PermissionResolution;
    selectedApprovalResource?: string;
}

export interface PermissionGetEffectivePolicyInput extends ProfileInput {
    resource: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
}

export interface PermissionSetProfileOverrideInput extends ProfileInput {
    resource: string;
    policy: PermissionPolicy;
}

export interface PermissionSetWorkspaceOverrideInput extends ProfileInput {
    workspaceFingerprint: string;
    resource: string;
    policy: PermissionPolicy;
}

export interface ToolInvokeInput extends ProfileInput {
    toolId: string;
    args?: Record<string, unknown>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
}

export interface ToolInvocationObservabilityContext {
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    providerId: string;
    modelId: string;
    toolCallId: string;
    toolName: string;
    argumentsText: string;
}

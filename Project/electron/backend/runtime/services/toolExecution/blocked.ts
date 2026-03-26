import { permissionStore } from '@/app/backend/persistence/stores';
import type { ToolDecision } from '@/app/backend/runtime/services/toolExecution/decision';
import {
    emitPermissionRequestedEvent,
    emitToolBlockedEvent,
} from '@/app/backend/runtime/services/toolExecution/events';
import type {
    ToolBlockedInvocationOutcome,
    ToolExecutionPolicy,
} from '@/app/backend/runtime/services/toolExecution/types';

export async function buildBlockedToolOutcome(input: {
    decision: Exclude<ToolDecision, { kind: 'allow' }>;
    profileId: string;
    toolId: string;
    args: Record<string, unknown>;
    at: string;
    workspaceFingerprint?: string;
}): Promise<ToolBlockedInvocationOutcome> {
    if (input.decision.kind === 'ask') {
        const request = await permissionStore.create({
            profileId: input.profileId,
            policy: 'ask',
            resource: input.decision.resource,
            toolId: input.toolId,
            scopeKind: input.decision.scopeKind,
            summary: input.decision.summary,
            ...(input.decision.commandText ? { commandText: input.decision.commandText } : {}),
            ...(input.decision.approvalCandidates ? { approvalCandidates: input.decision.approvalCandidates } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            rationale: input.decision.message,
        });

        await emitPermissionRequestedEvent({
            request,
            toolId: input.toolId,
        });
        await emitToolBlockedEvent({
            toolId: input.toolId,
            profileId: input.profileId,
            resource: input.decision.resource,
            policy: 'ask',
            source: input.decision.policy.source,
            reason: 'permission_required',
            requestId: request.id,
        });

        return {
            kind: 'approval_required',
            toolId: input.toolId,
            message: input.decision.message,
            args: input.args,
            at: input.at,
            requestId: request.id,
            policy: input.decision.policy,
        };
    }

    await emitToolBlockedEvent({
        toolId: input.toolId,
        profileId: input.profileId,
        resource: input.decision.resource,
        policy: 'deny',
        source: input.decision.policy.source,
        reason: input.decision.reason,
    });

    return {
        kind: 'denied',
        toolId: input.toolId,
        message: input.decision.message,
        args: input.args,
        at: input.at,
        policy: input.decision.policy,
        reason: input.decision.reason,
    };
}

export async function buildDeniedToolOutcome(input: {
    profileId: string;
    toolId: string;
    resource: string;
    policy: ToolExecutionPolicy;
    reason: 'policy_denied' | 'detached_scope' | 'workspace_unresolved' | 'outside_workspace' | 'ignored_path';
    message: string;
    args: Record<string, unknown>;
    at: string;
}): Promise<ToolBlockedInvocationOutcome> {
    await emitToolBlockedEvent({
        toolId: input.toolId,
        profileId: input.profileId,
        resource: input.resource,
        policy: 'deny',
        source: input.policy.source,
        reason: input.reason,
    });

    return {
        kind: 'denied',
        toolId: input.toolId,
        message: input.message,
        args: input.args,
        at: input.at,
        policy: input.policy,
        reason: input.reason,
    };
}

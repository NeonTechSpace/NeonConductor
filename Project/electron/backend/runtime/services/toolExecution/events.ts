import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

export async function emitToolBlockedEvent(input: {
    toolId: string;
    profileId: string;
    resource: string;
    policy: 'ask' | 'allow' | 'deny';
    source: string;
    reason:
        | 'policy_denied'
        | 'permission_required'
        | 'detached_scope'
        | 'outside_workspace'
        | 'ignored_path'
        | 'workspace_unresolved';
    requestId?: string;
}) {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'tool',
            domain: 'tool',
            entityId: input.toolId,
            eventType: 'tool.invocation.blocked',
            payload: {
                profileId: input.profileId,
                toolId: input.toolId,
                resource: input.resource,
                policy: input.policy,
                source: input.source,
                reason: input.reason,
                ...(input.requestId ? { requestId: input.requestId } : {}),
            },
        })
    );
}

export async function emitPermissionRequestedEvent(input: {
    request: {
        id: string;
        policy: string;
        resource: string;
        decision: string;
        createdAt: string;
        updatedAt: string;
        rationale?: string;
    };
    toolId: string;
}) {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'permission',
            domain: 'permission',
            entityId: input.request.id,
            eventType: 'permission.requested',
            payload: {
                request: input.request,
                source: 'tool.invoke',
                toolId: input.toolId,
            },
        })
    );
}

export async function emitToolCompletedEvent(input: {
    toolId: string;
    profileId: string;
    resource: string;
    policy: 'ask' | 'allow' | 'deny';
    source: string;
}) {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'tool',
            domain: 'tool',
            entityId: input.toolId,
            eventType: 'tool.invocation.completed',
            payload: {
                profileId: input.profileId,
                toolId: input.toolId,
                resource: input.resource,
                policy: input.policy,
                source: input.source,
            },
        })
    );
}

export async function emitToolFailedEvent(input: {
    toolId: string;
    profileId: string;
    resource: string;
    policy: 'ask' | 'allow' | 'deny';
    source: string;
    error: string;
}) {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'tool',
            domain: 'tool',
            entityId: input.toolId,
            eventType: 'tool.invocation.failed',
            payload: {
                profileId: input.profileId,
                toolId: input.toolId,
                resource: input.resource,
                policy: input.policy,
                source: input.source,
                error: input.error,
            },
        })
    );
}

import { permissionStore } from '@/app/backend/persistence/stores';
import type { ToolRecord } from '@/app/backend/persistence/types';
import type { TopLevelTab } from '@/app/backend/runtime/contracts';
import { resolveEffectivePermissionPolicy } from '@/app/backend/runtime/services/permissions/policyResolver';

export type ToolDecision =
    | {
          kind: 'allow';
          policy: { effective: 'allow'; source: string };
          resource: string;
      }
    | {
          kind: 'deny';
          policy: { effective: 'deny'; source: string };
          resource: string;
          reason: 'policy_denied' | 'detached_scope' | 'workspace_unresolved' | 'outside_workspace' | 'ignored_path';
          message: string;
      }
    | {
          kind: 'ask';
          policy: { effective: 'ask'; source: string };
          resource: string;
          scopeKind: 'tool' | 'boundary';
          summary: {
              title: string;
              detail: string;
          };
          approvalCandidates?: NonNullable<Awaited<ReturnType<typeof permissionStore.create>>['approvalCandidates']>;
          commandText?: string;
          message: string;
      };

export function boundaryResource(
    toolId: string,
    boundary: 'workspace_required' | 'outside_workspace' | 'ignored_path'
): string {
    return `tool:${toolId}:boundary:${boundary}`;
}

export function boundaryDefaultPolicy(executionPreset: 'privacy' | 'standard' | 'yolo'): 'ask' | 'deny' {
    if (executionPreset === 'yolo') {
        return 'deny';
    }

    return 'ask';
}

export async function resolveToolDecision(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    executionPreset: 'privacy' | 'standard' | 'yolo';
    capabilities: ToolRecord['capabilities'];
    toolDefaultPolicy: 'ask' | 'allow' | 'deny';
    workspaceFingerprint?: string;
    resource: string;
    resourceCandidates?: string[];
    onceResource?: string;
    scopeKind: 'tool' | 'boundary';
    summary: {
        title: string;
        detail: string;
    };
    approvalCandidates?: NonNullable<Awaited<ReturnType<typeof permissionStore.create>>['approvalCandidates']>;
    commandText?: string;
    denyMessage: string;
    askMessage: string;
    denyReason?: 'policy_denied' | 'outside_workspace' | 'ignored_path';
}): Promise<ToolDecision> {
    const resolvedPolicy = await resolveEffectivePermissionPolicy({
        profileId: input.profileId,
        resource: input.resource,
        ...(input.resourceCandidates ? { resourceCandidates: input.resourceCandidates } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        executionPreset: input.executionPreset,
        capabilities: input.capabilities,
        toolDefaultPolicy: input.toolDefaultPolicy,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });

    if (resolvedPolicy.policy === 'ask') {
        const onceApproval = await permissionStore.consumeGrantedOnce({
            profileId: input.profileId,
            resource: input.onceResource ?? input.resource,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        if (onceApproval) {
            return {
                kind: 'allow',
                policy: {
                    effective: 'allow',
                    source: 'one_time_approval',
                },
                resource: input.onceResource ?? input.resource,
            };
        }

        return {
            kind: 'ask',
            policy: {
                effective: 'ask',
                source: resolvedPolicy.source,
            },
            resource: input.onceResource ?? input.resource,
            scopeKind: input.scopeKind,
            summary: input.summary,
            ...(input.approvalCandidates ? { approvalCandidates: input.approvalCandidates } : {}),
            ...(input.commandText ? { commandText: input.commandText } : {}),
            message: input.askMessage,
        };
    }

    if (resolvedPolicy.policy === 'deny') {
        return {
            kind: 'deny',
            policy: {
                effective: 'deny',
                source: resolvedPolicy.source,
            },
            resource: resolvedPolicy.resource,
            reason: input.denyReason ?? 'policy_denied',
            message: input.denyMessage,
        };
    }

    return {
        kind: 'allow',
        policy: {
            effective: 'allow',
            source: resolvedPolicy.source,
        },
        resource: resolvedPolicy.resource,
    };
}

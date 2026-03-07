import { permissionPolicyOverrideStore, permissionStore, toolStore } from '@/app/backend/persistence/stores';
import {
    permissionGetEffectivePolicyInputSchema,
    permissionRequestInputSchema,
    permissionResolveInputSchema,
    permissionSetProfileOverrideInputSchema,
    permissionSetWorkspaceOverrideInputSchema,
} from '@/app/backend/runtime/contracts';
import { resolveEffectivePermissionPolicy } from '@/app/backend/runtime/services/permissions/policyResolver';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { runtimeStatusEvent, runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const permissionRouter = router({
    request: publicProcedure.input(permissionRequestInputSchema).mutation(async ({ input }) => {
        const record = await permissionStore.create(input);
        await runtimeEventLogService.append(
            runtimeStatusEvent({
            entityType: 'permission',
            domain: 'permission',
            entityId: record.id,
            eventType: 'permission.requested',
            payload: {
                request: record,
            },
            })
        );

        return { request: record };
    }),
    listPending: publicProcedure.query(async () => {
        return { requests: await permissionStore.listPending() };
    }),
    getEffectivePolicy: publicProcedure.input(permissionGetEffectivePolicyInputSchema).query(async ({ input }) => {
        const tools = await toolStore.list();
        const toolId = input.resource.startsWith('tool:') ? input.resource.slice('tool:'.length).split(':', 1)[0] : null;
        const tool = toolId ? tools.find((item) => item.id === toolId) : null;
        const defaultPolicy = tool?.permissionPolicy ?? 'deny';

        const resolved = await resolveEffectivePermissionPolicy({
            profileId: input.profileId,
            resource: input.resource,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            executionPreset: await getExecutionPreset(input.profileId),
            capabilities: tool?.capabilities ?? [],
            toolDefaultPolicy: defaultPolicy,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });

        return {
            resource: input.resource,
            policy: resolved.policy,
            source: resolved.source,
            defaultPolicy,
        };
    }),
    setProfileOverride: publicProcedure.input(permissionSetProfileOverrideInputSchema).mutation(async ({ input }) => {
        const override = await permissionPolicyOverrideStore.upsert(
            input.profileId,
            permissionPolicyOverrideStore.toProfileScopeKey(),
            input.resource,
            input.policy
        );
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
            entityType: 'permission',
            domain: 'permission',
            entityId: input.resource,
            eventType: 'permission.override.profile.set',
            payload: {
                profileId: input.profileId,
                resource: input.resource,
                policy: input.policy,
            },
            })
        );

        return {
            override,
        };
    }),
    setWorkspaceOverride: publicProcedure
        .input(permissionSetWorkspaceOverrideInputSchema)
        .mutation(async ({ input }) => {
            const override = await permissionPolicyOverrideStore.upsert(
                input.profileId,
                permissionPolicyOverrideStore.toWorkspaceScopeKey(input.workspaceFingerprint),
                input.resource,
                input.policy
            );
            await runtimeEventLogService.append(
                runtimeUpsertEvent({
                entityType: 'permission',
                domain: 'permission',
                entityId: input.resource,
                eventType: 'permission.override.workspace.set',
                payload: {
                    profileId: input.profileId,
                    workspaceFingerprint: input.workspaceFingerprint,
                    resource: input.resource,
                    policy: input.policy,
                },
                })
            );

            return {
            override,
        };
    }),
    resolve: publicProcedure.input(permissionResolveInputSchema).mutation(async ({ input }) => {
        const record = await permissionStore.getById(input.requestId);
        if (!record) {
            return { updated: false as const, reason: 'not_found' as const };
        }
        if (record.profileId !== input.profileId) {
            return { updated: false as const, reason: 'not_found' as const };
        }
        if (record.decision !== 'pending') {
            return { updated: false as const, reason: 'already_resolved' as const, request: record };
        }

        if (input.resolution === 'allow_workspace' && !record.workspaceFingerprint) {
            return { updated: false as const, reason: 'workspace_scope_missing' as const, request: record };
        }

        const selectedApprovalResource =
            record.approvalCandidates && record.approvalCandidates.length > 0
                ? input.selectedApprovalResource
                : undefined;
        if (
            (input.resolution === 'allow_profile' || input.resolution === 'allow_workspace') &&
            record.approvalCandidates &&
            record.approvalCandidates.length > 0
        ) {
            if (!selectedApprovalResource) {
                return { updated: false as const, reason: 'approval_resource_missing' as const, request: record };
            }

            const isValidSelection = record.approvalCandidates.some(
                (candidate) => candidate.resource === selectedApprovalResource
            );
            if (!isValidSelection) {
                return { updated: false as const, reason: 'approval_resource_invalid' as const, request: record };
            }
        }

        const updatedRecord = await permissionStore.resolve(
            input.requestId,
            input.resolution,
            selectedApprovalResource
        );
        if (!updatedRecord) {
            return { updated: false as const, reason: 'not_found' as const };
        }

        if (input.resolution === 'allow_profile') {
            await permissionPolicyOverrideStore.upsert(
                input.profileId,
                permissionPolicyOverrideStore.toProfileScopeKey(),
                selectedApprovalResource ?? record.resource,
                'allow'
            );
        }
        if (input.resolution === 'allow_workspace' && record.workspaceFingerprint) {
            await permissionPolicyOverrideStore.upsert(
                input.profileId,
                permissionPolicyOverrideStore.toWorkspaceScopeKey(record.workspaceFingerprint),
                selectedApprovalResource ?? record.resource,
                'allow'
            );
        }

        await runtimeEventLogService.append(
            runtimeStatusEvent({
            entityType: 'permission',
            domain: 'permission',
            entityId: updatedRecord.id,
            eventType: 'permission.resolved',
            payload: {
                request: updatedRecord,
                resolution: input.resolution,
            },
            })
        );

        return { updated: true as const, reason: null, request: updatedRecord };
    }),
});

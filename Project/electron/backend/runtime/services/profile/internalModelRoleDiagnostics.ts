import type {
    InternalModelRoleDiagnosticRecord,
    InternalModelRoleDiagnostics,
    PlannerTargetDiagnosticRecord,
} from '@/app/backend/runtime/contracts';
import { resolvePlanningWorkflowRoutingRunTarget } from '@/app/backend/runtime/services/plan/workflowRoutingTarget';
import { modelRoleDefaultService } from '@/app/backend/runtime/services/profile/modelRoleDefaults';

import { getWorkflowRoutingTargetLabel } from '@/shared/workflowRouting';

export class InternalModelRoleDiagnosticsService {
    async getDiagnostics(profileId: string): Promise<InternalModelRoleDiagnostics> {
        const roleDefaults = await modelRoleDefaultService.listRoleDefaults(profileId);
        const roles: InternalModelRoleDiagnosticRecord[] = roleDefaults.map((roleDefault) => ({
            role: roleDefault.role,
            label: roleDefault.role
                .split('_')
                .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
                .join(' '),
            status: roleDefault.status,
            ...(roleDefault.providerId ? { providerId: roleDefault.providerId } : {}),
            ...(roleDefault.modelId ? { modelId: roleDefault.modelId } : {}),
            sourceLabel: roleDefault.sourceLabel,
            ...(roleDefault.detail ? { detail: roleDefault.detail } : {}),
        }));

        const [simplePlannerTarget, advancedPlannerTarget] = await Promise.all([
            resolvePlanningWorkflowRoutingRunTarget({
                profileId,
                planningDepth: 'simple',
            }),
            resolvePlanningWorkflowRoutingRunTarget({
                profileId,
                planningDepth: 'advanced',
            }),
        ]);

        const plannerTargets: PlannerTargetDiagnosticRecord[] = [
            {
                targetKey: 'planning',
                label: getWorkflowRoutingTargetLabel('planning'),
                status: simplePlannerTarget ? 'configured' : 'unconfigured',
                ...(simplePlannerTarget?.providerId ? { providerId: simplePlannerTarget.providerId } : {}),
                ...(simplePlannerTarget?.modelId ? { modelId: simplePlannerTarget.modelId } : {}),
                sourceLabel: simplePlannerTarget
                    ? simplePlannerTarget.source === 'workflow_routing'
                        ? 'Saved workflow routing'
                        : simplePlannerTarget.source === 'workspace_preference'
                          ? 'Workspace preference fallback'
                          : simplePlannerTarget.source === 'shared_defaults'
                            ? 'Shared default fallback'
                            : 'Compatibility fallback'
                    : 'No planning target resolved',
                resolvedTargetKey: simplePlannerTarget?.resolvedTargetKey ?? 'planning',
                fellBackToPlanning: simplePlannerTarget?.fellBackToPlanning ?? false,
            },
            {
                targetKey: 'planning_advanced',
                label: getWorkflowRoutingTargetLabel('planning_advanced'),
                status: advancedPlannerTarget ? 'configured' : 'unconfigured',
                ...(advancedPlannerTarget?.providerId ? { providerId: advancedPlannerTarget.providerId } : {}),
                ...(advancedPlannerTarget?.modelId ? { modelId: advancedPlannerTarget.modelId } : {}),
                sourceLabel: advancedPlannerTarget
                    ? advancedPlannerTarget.fellBackToPlanning
                        ? 'Saved advanced routing fell back to planning'
                        : advancedPlannerTarget.source === 'workflow_routing'
                          ? 'Saved workflow routing'
                          : advancedPlannerTarget.source === 'workspace_preference'
                            ? 'Workspace preference fallback'
                            : advancedPlannerTarget.source === 'shared_defaults'
                              ? 'Shared default fallback'
                              : 'Compatibility fallback'
                    : 'No advanced planning target resolved',
                resolvedTargetKey: advancedPlannerTarget?.resolvedTargetKey ?? 'planning_advanced',
                fellBackToPlanning: advancedPlannerTarget?.fellBackToPlanning ?? false,
            },
        ];

        return {
            roles,
            plannerTargets,
            updatedAt: new Date().toISOString(),
        };
    }
}

export const internalModelRoleDiagnosticsService = new InternalModelRoleDiagnosticsService();

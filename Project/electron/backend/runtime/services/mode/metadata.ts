import type {
    BehaviorFlag,
    ModeDefinition,
    ModeExecutionPolicy,
    RuntimeRequirementProfile,
    WorkflowCapability,
} from '@/app/backend/runtime/contracts';

function uniqueValues<T extends string>(values: readonly T[] | undefined): T[] {
    if (!values || values.length === 0) {
        return [];
    }

    return Array.from(new Set(values));
}

export function getModeWorkflowCapabilities(policy: ModeExecutionPolicy): WorkflowCapability[] {
    return uniqueValues(policy.workflowCapabilities);
}

export function modeHasWorkflowCapability(
    mode: Pick<ModeDefinition, 'executionPolicy'>,
    workflowCapability: WorkflowCapability
): boolean {
    return getModeWorkflowCapabilities(mode.executionPolicy).includes(workflowCapability);
}

export function getModeBehaviorFlags(policy: ModeExecutionPolicy): BehaviorFlag[] {
    return uniqueValues(policy.behaviorFlags);
}

export function modeHasBehaviorFlag(mode: Pick<ModeDefinition, 'executionPolicy'>, behaviorFlag: BehaviorFlag): boolean {
    return getModeBehaviorFlags(mode.executionPolicy).includes(behaviorFlag);
}

export function getModeRuntimeProfile(policy: ModeExecutionPolicy): RuntimeRequirementProfile | undefined {
    return policy.runtimeProfile;
}

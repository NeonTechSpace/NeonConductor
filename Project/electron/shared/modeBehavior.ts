import type {
    BehaviorFlag,
    ModeDefinition,
    ModeExecutionPolicy,
    RuntimeRequirementProfile,
    ToolCapability,
    WorkflowCapability,
} from '@/shared/contracts';

type ModePolicyLike = Pick<
    ModeExecutionPolicy,
    'planningOnly' | 'toolCapabilities' | 'workflowCapabilities' | 'behaviorFlags' | 'runtimeProfile'
>;

type ModeLike = Pick<ModeDefinition, 'executionPolicy'>;
type ModePolicySource = ModePolicyLike | ModeLike | undefined;

function uniqueValues<T extends string>(values: readonly T[] | undefined): T[] {
    if (!values || values.length === 0) {
        return [];
    }

    return Array.from(new Set(values));
}

function resolveModePolicy(source: ModePolicySource): ModePolicyLike {
    if (!source) {
        return {};
    }

    return 'executionPolicy' in source ? source.executionPolicy : source;
}

export function getModeToolCapabilities(policy: ModePolicySource): ToolCapability[] {
    const resolvedPolicy = resolveModePolicy(policy);
    return uniqueValues(resolvedPolicy.toolCapabilities);
}

export function getModeWorkflowCapabilities(policy: ModePolicySource): WorkflowCapability[] {
    const resolvedPolicy = resolveModePolicy(policy);
    const workflowCapabilities = uniqueValues(resolvedPolicy.workflowCapabilities);
    if (resolvedPolicy.planningOnly && !workflowCapabilities.includes('planning')) {
        workflowCapabilities.push('planning');
    }

    return workflowCapabilities;
}

export function modeHasWorkflowCapability(
    mode: ModeLike | undefined,
    workflowCapability: WorkflowCapability
): boolean {
    return mode ? getModeWorkflowCapabilities(mode.executionPolicy).includes(workflowCapability) : false;
}

export function modeSupportsPlanningWorkflow(mode: ModeLike | undefined): boolean {
    return modeHasWorkflowCapability(mode, 'planning');
}

export function modeSupportsOrchestrationWorkflow(mode: ModeLike | undefined): boolean {
    return modeHasWorkflowCapability(mode, 'orchestration');
}

export function modeCanExecuteRuns(mode: ModeLike | undefined): boolean {
    return !modeSupportsPlanningWorkflow(mode);
}

export function getModeBehaviorFlags(policy: ModePolicySource): BehaviorFlag[] {
    const resolvedPolicy = resolveModePolicy(policy);
    const behaviorFlags = uniqueValues(resolvedPolicy.behaviorFlags);
    if (resolvedPolicy.planningOnly && !behaviorFlags.includes('read_only_execution')) {
        behaviorFlags.push('read_only_execution');
    }

    return behaviorFlags;
}

export function modeHasBehaviorFlag(mode: ModeLike | undefined, behaviorFlag: BehaviorFlag): boolean {
    return mode ? getModeBehaviorFlags(mode.executionPolicy).includes(behaviorFlag) : false;
}

export function modeUsesReadOnlyExecution(mode: ModeLike | undefined): boolean {
    return modeHasBehaviorFlag(mode, 'read_only_execution');
}

export function modeIsCheckpointEligible(mode: ModeLike | undefined): boolean {
    return modeHasBehaviorFlag(mode, 'checkpoint_eligible');
}

export function modeMutatesWorkspace(mode: ModeLike | undefined): boolean {
    return modeHasBehaviorFlag(mode, 'workspace_mutating');
}

export function modeShowsPlanArtifactSurface(mode: ModeLike | undefined): boolean {
    return modeSupportsPlanningWorkflow(mode) || modeSupportsOrchestrationWorkflow(mode);
}

export function modeRequiresNativeTools(mode: ModeLike | undefined): boolean {
    if (!mode || !modeCanExecuteRuns(mode)) {
        return false;
    }

    return getModeToolCapabilities(mode.executionPolicy).length > 0;
}

export function modeAllowsToolCapabilities(
    mode: ModeLike | undefined,
    requiredCapabilities: readonly ToolCapability[]
): boolean {
    const allowedCapabilities = new Set(mode ? getModeToolCapabilities(mode.executionPolicy) : []);
    return requiredCapabilities.every((capability) => allowedCapabilities.has(capability));
}

export function getModeRuntimeProfile(policy: ModePolicySource): RuntimeRequirementProfile | undefined {
    return resolveModePolicy(policy).runtimeProfile;
}

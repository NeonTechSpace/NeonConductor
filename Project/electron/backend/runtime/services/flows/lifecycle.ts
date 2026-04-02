import type {
    FlowApprovalGateStepDefinition,
    FlowDefinitionRecord,
    FlowInstanceRecord,
    FlowInstanceStatus,
    FlowLegacyCommandStepDefinition,
    FlowModeRunStepDefinition,
    FlowStepDefinition,
    FlowWorkflowStepDefinition,
} from '@/app/backend/runtime/contracts';

import {
    createFlowApprovalRequiredLifecycleEvent,
    createFlowCancelledLifecycleEvent,
    createFlowCompletedLifecycleEvent,
    createFlowFailedLifecycleEvent,
    createFlowStartedLifecycleEvent,
    createFlowStepCompletedLifecycleEvent,
    createFlowStepStartedLifecycleEvent,
    type FlowLifecycleEvent,
} from '@/shared/flowLifecycle';

function normalizeStep(step: FlowStepDefinition): FlowStepDefinition {
    if (step.kind === 'legacy_command') {
        const normalizedStep: FlowLegacyCommandStepDefinition = {
            ...step,
            id: step.id.trim(),
            label: step.label.trim(),
            command: step.command.trim(),
        };
        return normalizedStep;
    }

    if (step.kind === 'mode_run') {
        const normalizedStep: FlowModeRunStepDefinition = {
            ...step,
            id: step.id.trim(),
            label: step.label.trim(),
            modeKey: step.modeKey.trim(),
        };
        return normalizedStep;
    }

    if (step.kind === 'workflow') {
        const normalizedStep: FlowWorkflowStepDefinition = {
            ...step,
            id: step.id.trim(),
            label: step.label.trim(),
        };
        return normalizedStep;
    }

    const normalizedStep: FlowApprovalGateStepDefinition = {
        ...step,
        id: step.id.trim(),
        label: step.label.trim(),
    };
    return normalizedStep;
}

function cloneSteps(steps: FlowDefinitionRecord['steps']): FlowDefinitionRecord['steps'] {
    return steps.map((step) => normalizeStep(step));
}

export function normalizeFlowDefinition(definition: FlowDefinitionRecord): FlowDefinitionRecord {
    return {
        ...definition,
        id: definition.id.trim(),
        label: definition.label.trim(),
        ...(definition.description ? { description: definition.description.trim() } : {}),
        steps: cloneSteps(definition.steps),
    };
}

export function createFlowInstanceProjection(input: {
    flowDefinition: FlowDefinitionRecord;
    id?: string;
}): FlowInstanceRecord {
    return {
        id: input.id ?? `flow_instance_${input.flowDefinition.id}`,
        flowDefinitionId: input.flowDefinition.id,
        status: 'queued',
        currentStepIndex: 0,
    };
}

export function advanceFlowInstanceProjection(input: {
    flowInstance: FlowInstanceRecord;
    status: FlowInstanceStatus;
    currentStepIndex?: number;
    startedAt?: string;
    finishedAt?: string;
}): FlowInstanceRecord {
    const now = new Date().toISOString();

    return {
        ...input.flowInstance,
        status: input.status,
        currentStepIndex: input.currentStepIndex ?? input.flowInstance.currentStepIndex,
        ...(input.status === 'running' || input.status === 'approval_required'
            ? {
                  startedAt: input.startedAt ?? input.flowInstance.startedAt ?? now,
              }
            : {}),
        ...(['failed', 'completed', 'cancelled'].includes(input.status)
            ? {
                  startedAt: input.flowInstance.startedAt ?? input.startedAt ?? now,
                  finishedAt: input.finishedAt ?? now,
              }
            : {}),
    };
}

export function buildFlowLifecycleEvents(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
}): {
    started: FlowLifecycleEvent;
    stepStarted?: FlowLifecycleEvent;
    stepCompleted?: FlowLifecycleEvent;
    approvalRequired?: FlowLifecycleEvent;
    failed?: FlowLifecycleEvent;
    cancelled?: FlowLifecycleEvent;
    completed?: FlowLifecycleEvent;
} {
    const firstStep = input.flowDefinition.steps[0];
    const stepCount = input.flowDefinition.steps.length;

    const started = createFlowStartedLifecycleEvent({
        flowDefinitionId: input.flowDefinition.id,
        flowInstanceId: input.flowInstance.id,
        triggerKind: input.flowDefinition.triggerKind,
        stepCount,
    });

    const stepStarted =
        firstStep && input.flowInstance.currentStepIndex === 0
            ? createFlowStepStartedLifecycleEvent({
                  flowDefinitionId: input.flowDefinition.id,
                  flowInstanceId: input.flowInstance.id,
                  stepIndex: 0,
                  stepId: firstStep.id,
                  stepKind: firstStep.kind,
              })
            : undefined;

    const stepCompleted =
        firstStep && input.flowInstance.status !== 'queued'
            ? createFlowStepCompletedLifecycleEvent({
                  flowDefinitionId: input.flowDefinition.id,
                  flowInstanceId: input.flowInstance.id,
                  stepIndex: 0,
                  stepId: firstStep.id,
                  stepKind: firstStep.kind,
              })
            : undefined;

    const approvalRequired =
        firstStep && input.flowInstance.status === 'approval_required'
            ? createFlowApprovalRequiredLifecycleEvent({
                  flowDefinitionId: input.flowDefinition.id,
                  flowInstanceId: input.flowInstance.id,
                  stepIndex: 0,
                  stepId: firstStep.id,
                  stepKind: firstStep.kind,
                  reason: 'Flow requires explicit approval before continuing.',
              })
            : undefined;

    const failed =
        input.flowInstance.status === 'failed'
            ? createFlowFailedLifecycleEvent({
                  flowDefinitionId: input.flowDefinition.id,
                  flowInstanceId: input.flowInstance.id,
                  errorMessage: 'Flow execution failed.',
              })
            : undefined;

    const cancelled =
        input.flowInstance.status === 'cancelled'
            ? createFlowCancelledLifecycleEvent({
                  flowDefinitionId: input.flowDefinition.id,
                  flowInstanceId: input.flowInstance.id,
                  reason: 'Flow execution was cancelled.',
              })
            : undefined;

    const completed =
        input.flowInstance.status === 'completed'
            ? createFlowCompletedLifecycleEvent({
                  flowDefinitionId: input.flowDefinition.id,
                  flowInstanceId: input.flowInstance.id,
                  completedStepCount: stepCount,
              })
            : undefined;

    return {
        started,
        ...(stepStarted ? { stepStarted } : {}),
        ...(stepCompleted ? { stepCompleted } : {}),
        ...(approvalRequired ? { approvalRequired } : {}),
        ...(failed ? { failed } : {}),
        ...(cancelled ? { cancelled } : {}),
        ...(completed ? { completed } : {}),
    };
}

import { randomUUID } from 'node:crypto';

import type {
    FlowDefinitionRecord,
    FlowInstanceRecord,
    FlowLifecycleEvent,
    FlowStepDefinition,
} from '@/app/backend/runtime/contracts/types/flow';

function cloneFlowStep(step: FlowStepDefinition): FlowStepDefinition {
    if (step.kind === 'legacy_command') {
        return { ...step };
    }
    if (step.kind === 'mode_run') {
        return { ...step };
    }
    if (step.kind === 'workflow') {
        return { ...step };
    }

    return { ...step };
}

export function normalizeFlowDefinition(flowDefinition: FlowDefinitionRecord): FlowDefinitionRecord {
    const description = flowDefinition.description?.trim();

    return {
        ...flowDefinition,
        id: flowDefinition.id.trim(),
        label: flowDefinition.label.trim(),
        ...(description ? { description } : {}),
        ...(description ? {} : { description: undefined }),
        steps: flowDefinition.steps.map(cloneFlowStep),
    };
}

export function createFlowInstanceRecord(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstanceId?: string;
    now?: string;
}): FlowInstanceRecord {
    return {
        id: input.flowInstanceId ?? `flow_instance_${randomUUID()}`,
        flowDefinitionId: input.flowDefinition.id,
        status: 'queued',
        currentStepIndex: 0,
        ...(input.now ? { startedAt: input.now } : {}),
    };
}

export function startFlowInstance(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
    now?: string;
}): { flowInstance: FlowInstanceRecord; event: FlowLifecycleEvent } {
    const at = input.now ?? new Date().toISOString();

    return {
        flowInstance: {
            ...input.flowInstance,
            status: 'running',
            startedAt: at,
        },
        event: {
            eventType: 'flow.started',
            flowDefinitionId: input.flowDefinition.id,
            flowInstanceId: input.flowInstance.id,
            at,
        },
    };
}

export function startFlowStep(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
    stepIndex: number;
    now?: string;
}): FlowLifecycleEvent {
    const step = readFlowStep(input.flowDefinition, input.stepIndex);

    return {
        eventType: 'flow.step_started',
        flowDefinitionId: input.flowDefinition.id,
        flowInstanceId: input.flowInstance.id,
        stepId: step.id,
        stepIndex: input.stepIndex,
        stepKind: step.kind,
        at: input.now ?? new Date().toISOString(),
    };
}

export function completeFlowStep(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
    stepIndex: number;
    now?: string;
}): FlowLifecycleEvent {
    const step = readFlowStep(input.flowDefinition, input.stepIndex);

    return {
        eventType: 'flow.step_completed',
        flowDefinitionId: input.flowDefinition.id,
        flowInstanceId: input.flowInstance.id,
        stepId: step.id,
        stepIndex: input.stepIndex,
        stepKind: step.kind,
        at: input.now ?? new Date().toISOString(),
    };
}

export function requireFlowApproval(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
    stepIndex: number;
    now?: string;
}): { flowInstance: FlowInstanceRecord; event: FlowLifecycleEvent } {
    const step = readFlowStep(input.flowDefinition, input.stepIndex);
    const at = input.now ?? new Date().toISOString();

    return {
        flowInstance: {
            ...input.flowInstance,
            status: 'approval_required',
            currentStepIndex: input.stepIndex,
        },
        event: {
            eventType: 'flow.approval_required',
            flowDefinitionId: input.flowDefinition.id,
            flowInstanceId: input.flowInstance.id,
            stepId: step.id,
            stepIndex: input.stepIndex,
            at,
        },
    };
}

export function failFlowInstance(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
    message: string;
    stepIndex?: number;
    now?: string;
}): { flowInstance: FlowInstanceRecord; event: FlowLifecycleEvent } {
    const at = input.now ?? new Date().toISOString();
    const step = input.stepIndex === undefined ? undefined : readFlowStep(input.flowDefinition, input.stepIndex);

    return {
        flowInstance: {
            ...input.flowInstance,
            status: 'failed',
            ...(at ? { finishedAt: at } : {}),
            ...(input.stepIndex !== undefined ? { currentStepIndex: input.stepIndex } : {}),
        },
        event: {
            eventType: 'flow.failed',
            flowDefinitionId: input.flowDefinition.id,
            flowInstanceId: input.flowInstance.id,
            message: input.message,
            at,
            ...(step ? { stepId: step.id, stepIndex: input.stepIndex } : {}),
        },
    };
}

export function cancelFlowInstance(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
    now?: string;
}): { flowInstance: FlowInstanceRecord; event: FlowLifecycleEvent } {
    const at = input.now ?? new Date().toISOString();

    return {
        flowInstance: {
            ...input.flowInstance,
            status: 'cancelled',
            finishedAt: at,
        },
        event: {
            eventType: 'flow.cancelled',
            flowDefinitionId: input.flowDefinition.id,
            flowInstanceId: input.flowInstance.id,
            at,
        },
    };
}

export function completeFlowInstance(input: {
    flowDefinition: FlowDefinitionRecord;
    flowInstance: FlowInstanceRecord;
    now?: string;
}): { flowInstance: FlowInstanceRecord; event: FlowLifecycleEvent } {
    const at = input.now ?? new Date().toISOString();

    return {
        flowInstance: {
            ...input.flowInstance,
            status: 'completed',
            currentStepIndex: input.flowDefinition.steps.length,
            finishedAt: at,
        },
        event: {
            eventType: 'flow.completed',
            flowDefinitionId: input.flowDefinition.id,
            flowInstanceId: input.flowInstance.id,
            at,
        },
    };
}

function readFlowStep(flowDefinition: FlowDefinitionRecord, stepIndex: number): FlowStepDefinition {
    const step = flowDefinition.steps[stepIndex];
    if (!step) {
        throw new Error(`Flow "${flowDefinition.id}" does not have a step at index ${String(stepIndex)}.`);
    }

    return step;
}

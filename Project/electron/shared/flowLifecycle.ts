import { randomUUID } from 'node:crypto';

import type {
    EntityId,
    FlowApprovalKind,
    FlowInstanceStatus,
    FlowStepKind,
    FlowTriggerKind,
    PlanStatus,
} from '@/shared/contracts';

export const flowLifecycleEventKinds = [
    'flow.started',
    'flow.step_started',
    'flow.step_completed',
    'flow.approval_required',
    'flow.failed',
    'flow.cancelled',
    'flow.completed',
] as const;
export type FlowLifecycleEventKind = (typeof flowLifecycleEventKinds)[number];

export interface FlowLifecycleEventBase<TKind extends FlowLifecycleEventKind, TPayload> {
    id: string;
    kind: TKind;
    eventType?: TKind;
    flowDefinitionId: string;
    flowInstanceId: string;
    at: string;
    payload: TPayload;
}

export interface FlowStartedLifecycleEventPayload {
    triggerKind: FlowTriggerKind;
    stepCount: number;
    status: Extract<FlowInstanceStatus, 'queued'>;
    retrySourceFlowInstanceId?: string;
}

export interface FlowStepLifecycleProvenancePayload {
    currentRunId?: EntityId<'run'>;
    currentChildThreadId?: EntityId<'thr'>;
    currentChildSessionId?: EntityId<'sess'>;
    currentPlanId?: EntityId<'plan'>;
    currentPlanRevisionId?: EntityId<'prev'>;
    currentPlanPhaseId?: string;
    currentPlanPhaseRevisionId?: string;
}

export interface FlowStepStartedLifecycleEventPayload extends FlowStepLifecycleProvenancePayload {
    stepIndex: number;
    stepId: string;
    stepKind: FlowStepKind;
    status: Extract<FlowInstanceStatus, 'running'>;
}

export interface FlowStepCompletedLifecycleEventPayload extends FlowStepLifecycleProvenancePayload {
    stepIndex: number;
    stepId: string;
    stepKind: FlowStepKind;
    status: Extract<FlowInstanceStatus, 'running'>;
}

export interface FlowApprovalRequiredLifecycleEventPayload {
    stepIndex: number;
    stepId: string;
    stepKind: FlowStepKind;
    reason: string;
    approvalKind: FlowApprovalKind;
    permissionRequestId?: EntityId<'perm'>;
    planId?: EntityId<'plan'>;
    planRevisionId?: EntityId<'prev'>;
    requiredPlanStatus?: Extract<PlanStatus, 'draft' | 'approved'>;
    status: Extract<FlowInstanceStatus, 'approval_required'>;
}

export interface FlowFailedLifecycleEventPayload extends FlowStepLifecycleProvenancePayload {
    stepIndex?: number;
    stepId?: string;
    stepKind?: FlowStepKind;
    errorMessage: string;
    status: Extract<FlowInstanceStatus, 'failed'>;
}

export interface FlowCancelledLifecycleEventPayload extends FlowStepLifecycleProvenancePayload {
    stepIndex?: number;
    stepId?: string;
    stepKind?: FlowStepKind;
    reason?: string;
    status: Extract<FlowInstanceStatus, 'cancelled'>;
}

export interface FlowCompletedLifecycleEventPayload {
    completedStepCount: number;
    status: Extract<FlowInstanceStatus, 'completed'>;
}

export type FlowLifecycleEvent =
    | FlowLifecycleEventBase<'flow.started', FlowStartedLifecycleEventPayload>
    | FlowLifecycleEventBase<'flow.step_started', FlowStepStartedLifecycleEventPayload>
    | FlowLifecycleEventBase<'flow.step_completed', FlowStepCompletedLifecycleEventPayload>
    | FlowLifecycleEventBase<'flow.approval_required', FlowApprovalRequiredLifecycleEventPayload>
    | FlowLifecycleEventBase<'flow.failed', FlowFailedLifecycleEventPayload>
    | FlowLifecycleEventBase<'flow.cancelled', FlowCancelledLifecycleEventPayload>
    | FlowLifecycleEventBase<'flow.completed', FlowCompletedLifecycleEventPayload>;

function buildFlowLifecycleEvent<TKind extends FlowLifecycleEventKind, TPayload>(input: {
    kind: TKind;
    flowDefinitionId: string;
    flowInstanceId: string;
    payload: TPayload;
    at?: string | undefined;
    id?: string | undefined;
}): FlowLifecycleEventBase<TKind, TPayload> {
    return {
        id: input.id ?? `flow_event_${randomUUID()}`,
        kind: input.kind,
        eventType: input.kind,
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at ?? new Date().toISOString(),
        payload: input.payload,
    };
}

export function createFlowStartedLifecycleEvent(input: {
    flowDefinitionId: string;
    flowInstanceId: string;
    triggerKind: FlowTriggerKind;
    stepCount: number;
    retrySourceFlowInstanceId?: string;
    at?: string;
    id?: string;
}): FlowLifecycleEventBase<'flow.started', FlowStartedLifecycleEventPayload> {
    return buildFlowLifecycleEvent({
        kind: 'flow.started',
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at,
        id: input.id,
        payload: {
            triggerKind: input.triggerKind,
            stepCount: input.stepCount,
            status: 'queued',
            ...(input.retrySourceFlowInstanceId
                ? { retrySourceFlowInstanceId: input.retrySourceFlowInstanceId }
                : {}),
        },
    });
}

export function createFlowStepStartedLifecycleEvent(input: {
    flowDefinitionId: string;
    flowInstanceId: string;
    stepIndex: number;
    stepId: string;
    stepKind: FlowStepKind;
    currentRunId?: EntityId<'run'>;
    currentChildThreadId?: EntityId<'thr'>;
    currentChildSessionId?: EntityId<'sess'>;
    currentPlanId?: EntityId<'plan'>;
    currentPlanRevisionId?: EntityId<'prev'>;
    currentPlanPhaseId?: string;
    currentPlanPhaseRevisionId?: string;
    at?: string;
    id?: string;
}): FlowLifecycleEventBase<'flow.step_started', FlowStepStartedLifecycleEventPayload> {
    return buildFlowLifecycleEvent({
        kind: 'flow.step_started',
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at,
        id: input.id,
        payload: {
            stepIndex: input.stepIndex,
            stepId: input.stepId,
            stepKind: input.stepKind,
            status: 'running',
            ...(input.currentRunId ? { currentRunId: input.currentRunId } : {}),
            ...(input.currentChildThreadId ? { currentChildThreadId: input.currentChildThreadId } : {}),
            ...(input.currentChildSessionId ? { currentChildSessionId: input.currentChildSessionId } : {}),
            ...(input.currentPlanId ? { currentPlanId: input.currentPlanId } : {}),
            ...(input.currentPlanRevisionId ? { currentPlanRevisionId: input.currentPlanRevisionId } : {}),
            ...(input.currentPlanPhaseId ? { currentPlanPhaseId: input.currentPlanPhaseId } : {}),
            ...(input.currentPlanPhaseRevisionId
                ? { currentPlanPhaseRevisionId: input.currentPlanPhaseRevisionId }
                : {}),
        },
    });
}

export function createFlowStepCompletedLifecycleEvent(input: {
    flowDefinitionId: string;
    flowInstanceId: string;
    stepIndex: number;
    stepId: string;
    stepKind: FlowStepKind;
    currentRunId?: EntityId<'run'>;
    currentChildThreadId?: EntityId<'thr'>;
    currentChildSessionId?: EntityId<'sess'>;
    currentPlanId?: EntityId<'plan'>;
    currentPlanRevisionId?: EntityId<'prev'>;
    currentPlanPhaseId?: string;
    currentPlanPhaseRevisionId?: string;
    at?: string;
    id?: string;
}): FlowLifecycleEventBase<'flow.step_completed', FlowStepCompletedLifecycleEventPayload> {
    return buildFlowLifecycleEvent({
        kind: 'flow.step_completed',
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at,
        id: input.id,
        payload: {
            stepIndex: input.stepIndex,
            stepId: input.stepId,
            stepKind: input.stepKind,
            status: 'running',
            ...(input.currentRunId ? { currentRunId: input.currentRunId } : {}),
            ...(input.currentChildThreadId ? { currentChildThreadId: input.currentChildThreadId } : {}),
            ...(input.currentChildSessionId ? { currentChildSessionId: input.currentChildSessionId } : {}),
            ...(input.currentPlanId ? { currentPlanId: input.currentPlanId } : {}),
            ...(input.currentPlanRevisionId ? { currentPlanRevisionId: input.currentPlanRevisionId } : {}),
            ...(input.currentPlanPhaseId ? { currentPlanPhaseId: input.currentPlanPhaseId } : {}),
            ...(input.currentPlanPhaseRevisionId
                ? { currentPlanPhaseRevisionId: input.currentPlanPhaseRevisionId }
                : {}),
        },
    });
}

export function createFlowApprovalRequiredLifecycleEvent(input: {
    flowDefinitionId: string;
    flowInstanceId: string;
    stepIndex: number;
    stepId: string;
    stepKind: FlowStepKind;
    reason: string;
    approvalKind: FlowApprovalKind;
    permissionRequestId?: EntityId<'perm'>;
    planId?: EntityId<'plan'>;
    planRevisionId?: EntityId<'prev'>;
    requiredPlanStatus?: Extract<PlanStatus, 'draft' | 'approved'>;
    at?: string;
    id?: string;
}): FlowLifecycleEventBase<'flow.approval_required', FlowApprovalRequiredLifecycleEventPayload> {
    return buildFlowLifecycleEvent({
        kind: 'flow.approval_required',
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at,
        id: input.id,
        payload: {
            stepIndex: input.stepIndex,
            stepId: input.stepId,
            stepKind: input.stepKind,
            reason: input.reason,
            approvalKind: input.approvalKind,
            ...(input.permissionRequestId ? { permissionRequestId: input.permissionRequestId } : {}),
            ...(input.planId ? { planId: input.planId } : {}),
            ...(input.planRevisionId ? { planRevisionId: input.planRevisionId } : {}),
            ...(input.requiredPlanStatus ? { requiredPlanStatus: input.requiredPlanStatus } : {}),
            status: 'approval_required',
        },
    });
}

export function createFlowFailedLifecycleEvent(input: {
    flowDefinitionId: string;
    flowInstanceId: string;
    errorMessage: string;
    stepIndex?: number;
    stepId?: string;
    stepKind?: FlowStepKind;
    currentRunId?: EntityId<'run'>;
    currentChildThreadId?: EntityId<'thr'>;
    currentChildSessionId?: EntityId<'sess'>;
    currentPlanId?: EntityId<'plan'>;
    currentPlanRevisionId?: EntityId<'prev'>;
    currentPlanPhaseId?: string;
    currentPlanPhaseRevisionId?: string;
    at?: string;
    id?: string;
}): FlowLifecycleEventBase<'flow.failed', FlowFailedLifecycleEventPayload> {
    return buildFlowLifecycleEvent({
        kind: 'flow.failed',
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at,
        id: input.id,
        payload: {
            errorMessage: input.errorMessage,
            status: 'failed',
            ...(input.stepIndex !== undefined ? { stepIndex: input.stepIndex } : {}),
            ...(input.stepId ? { stepId: input.stepId } : {}),
            ...(input.stepKind ? { stepKind: input.stepKind } : {}),
            ...(input.currentRunId ? { currentRunId: input.currentRunId } : {}),
            ...(input.currentChildThreadId ? { currentChildThreadId: input.currentChildThreadId } : {}),
            ...(input.currentChildSessionId ? { currentChildSessionId: input.currentChildSessionId } : {}),
            ...(input.currentPlanId ? { currentPlanId: input.currentPlanId } : {}),
            ...(input.currentPlanRevisionId ? { currentPlanRevisionId: input.currentPlanRevisionId } : {}),
            ...(input.currentPlanPhaseId ? { currentPlanPhaseId: input.currentPlanPhaseId } : {}),
            ...(input.currentPlanPhaseRevisionId
                ? { currentPlanPhaseRevisionId: input.currentPlanPhaseRevisionId }
                : {}),
        },
    });
}

export function createFlowCancelledLifecycleEvent(input: {
    flowDefinitionId: string;
    flowInstanceId: string;
    reason?: string;
    stepIndex?: number;
    stepId?: string;
    stepKind?: FlowStepKind;
    currentRunId?: EntityId<'run'>;
    currentChildThreadId?: EntityId<'thr'>;
    currentChildSessionId?: EntityId<'sess'>;
    currentPlanId?: EntityId<'plan'>;
    currentPlanRevisionId?: EntityId<'prev'>;
    currentPlanPhaseId?: string;
    currentPlanPhaseRevisionId?: string;
    at?: string;
    id?: string;
}): FlowLifecycleEventBase<'flow.cancelled', FlowCancelledLifecycleEventPayload> {
    return buildFlowLifecycleEvent({
        kind: 'flow.cancelled',
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at,
        id: input.id,
        payload: {
            status: 'cancelled',
            ...(input.reason ? { reason: input.reason } : {}),
            ...(input.stepIndex !== undefined ? { stepIndex: input.stepIndex } : {}),
            ...(input.stepId ? { stepId: input.stepId } : {}),
            ...(input.stepKind ? { stepKind: input.stepKind } : {}),
            ...(input.currentRunId ? { currentRunId: input.currentRunId } : {}),
            ...(input.currentChildThreadId ? { currentChildThreadId: input.currentChildThreadId } : {}),
            ...(input.currentChildSessionId ? { currentChildSessionId: input.currentChildSessionId } : {}),
            ...(input.currentPlanId ? { currentPlanId: input.currentPlanId } : {}),
            ...(input.currentPlanRevisionId ? { currentPlanRevisionId: input.currentPlanRevisionId } : {}),
            ...(input.currentPlanPhaseId ? { currentPlanPhaseId: input.currentPlanPhaseId } : {}),
            ...(input.currentPlanPhaseRevisionId
                ? { currentPlanPhaseRevisionId: input.currentPlanPhaseRevisionId }
                : {}),
        },
    });
}

export function createFlowCompletedLifecycleEvent(input: {
    flowDefinitionId: string;
    flowInstanceId: string;
    completedStepCount: number;
    at?: string;
    id?: string;
}): FlowLifecycleEventBase<'flow.completed', FlowCompletedLifecycleEventPayload> {
    return buildFlowLifecycleEvent({
        kind: 'flow.completed',
        flowDefinitionId: input.flowDefinitionId,
        flowInstanceId: input.flowInstanceId,
        at: input.at,
        id: input.id,
        payload: {
            completedStepCount: input.completedStepCount,
            status: 'completed',
        },
    });
}

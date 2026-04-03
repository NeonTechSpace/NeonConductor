import type {
    FlowApprovalKind,
    FlowDefinitionOriginKind,
    FlowInstanceStatus,
    FlowTriggerKind,
    TopLevelTab,
    WorkflowCapability,
} from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { PlanPlanningDepth } from '@/app/backend/runtime/contracts/types/plan';

import type { EntityId } from '@/shared/contracts';
import type { FlowLifecycleEvent as SharedFlowLifecycleEvent } from '@/shared/flowLifecycle';

export interface FlowLegacyCommandStepDefinition {
    kind: 'legacy_command';
    id: string;
    label: string;
    command: string;
}

export interface FlowModeRunStepDefinition {
    kind: 'mode_run';
    id: string;
    label: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    promptMarkdown: string;
}

export interface FlowWorkflowStepDefinition {
    kind: 'workflow';
    id: string;
    label: string;
    workflowCapability: WorkflowCapability;
    promptMarkdown: string;
    planningDepth?: PlanPlanningDepth;
    requireApprovedPlan?: boolean;
    reuseExistingPlan?: boolean;
}

export interface FlowApprovalGateStepDefinition {
    kind: 'approval_gate';
    id: string;
    label: string;
}

export type FlowStepDefinition =
    | FlowLegacyCommandStepDefinition
    | FlowModeRunStepDefinition
    | FlowWorkflowStepDefinition
    | FlowApprovalGateStepDefinition;

export interface FlowDefinitionRecord {
    id: string;
    label: string;
    description?: string | undefined;
    enabled: boolean;
    triggerKind: FlowTriggerKind;
    steps: FlowStepDefinition[];
    createdAt: string;
    updatedAt: string;
}

export interface FlowInstanceRecord {
    id: string;
    flowDefinitionId: string;
    status: FlowInstanceStatus;
    currentStepIndex: number;
    executionContext?: FlowExecutionContext;
    currentRunId?: EntityId<'run'>;
    currentChildThreadId?: EntityId<'thr'>;
    currentChildSessionId?: EntityId<'sess'>;
    currentPlanId?: EntityId<'plan'>;
    currentPlanRevisionId?: EntityId<'prev'>;
    currentPlanPhaseId?: string;
    currentPlanPhaseRevisionId?: string;
    awaitingApprovalKind?: FlowApprovalKind;
    awaitingApprovalStepIndex?: number;
    awaitingApprovalStepId?: string;
    awaitingPermissionRequestId?: EntityId<'perm'>;
    awaitingPlanId?: EntityId<'plan'>;
    awaitingPlanRevisionId?: EntityId<'prev'>;
    awaitingRequiredPlanStatus?: 'draft' | 'approved';
    lastErrorMessage?: string;
    retrySourceFlowInstanceId?: string;
    startedAt?: string;
    finishedAt?: string;
}

export type FlowLifecycleEvent = SharedFlowLifecycleEvent;

export interface FlowExecutionContext {
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    sessionId?: EntityId<'sess'>;
}

export interface FlowCurrentStepView {
    stepIndex: number;
    step: FlowStepDefinition;
}

export interface FlowAwaitingApprovalView {
    kind: FlowApprovalKind;
    stepIndex: number;
    stepId: string;
    reason: string;
    permissionRequestId?: EntityId<'perm'>;
    planId?: EntityId<'plan'>;
    planRevisionId?: EntityId<'prev'>;
    requiredPlanStatus?: 'draft' | 'approved';
}

export interface FlowInstanceAvailableActions {
    canResume: boolean;
    canCancel: boolean;
    canRetry: boolean;
}

export interface FlowDefinitionView {
    definition: FlowDefinitionRecord;
    originKind: FlowDefinitionOriginKind;
    workspaceFingerprint?: string;
    sourceBranchWorkflowId?: string;
}

export interface FlowInstanceView {
    instance: FlowInstanceRecord;
    definitionSnapshot: FlowDefinitionRecord;
    lifecycleEvents: FlowLifecycleEvent[];
    executionContext?: FlowExecutionContext;
    currentRunId?: EntityId<'run'>;
    currentChildThreadId?: EntityId<'thr'>;
    currentChildSessionId?: EntityId<'sess'>;
    currentPlanId?: EntityId<'plan'>;
    currentPlanRevisionId?: EntityId<'prev'>;
    currentPlanPhaseId?: string;
    currentPlanPhaseRevisionId?: string;
    currentStep?: FlowCurrentStepView;
    awaitingApproval?: FlowAwaitingApprovalView;
    availableActions: FlowInstanceAvailableActions;
    lastErrorMessage?: string;
    retrySourceFlowInstanceId?: string;
    originKind: FlowDefinitionOriginKind;
    workspaceFingerprint?: string;
    sourceBranchWorkflowId?: string;
}

export type FlowDefinitionListInput = ProfileInput;

export interface FlowDefinitionGetInput extends ProfileInput {
    flowDefinitionId: string;
}

export interface FlowDefinitionCreateInput extends ProfileInput {
    label: string;
    description?: string;
    enabled: boolean;
    triggerKind: FlowTriggerKind;
    steps: FlowStepDefinition[];
}

export interface FlowDefinitionUpdateInput extends ProfileInput {
    flowDefinitionId: string;
    label: string;
    description?: string;
    enabled: boolean;
    triggerKind: FlowTriggerKind;
    steps: FlowStepDefinition[];
}

export interface FlowDefinitionDeleteInput extends ProfileInput {
    flowDefinitionId: string;
    confirm: boolean;
}

export type FlowInstanceListInput = ProfileInput;

export interface FlowInstanceGetInput extends ProfileInput {
    flowInstanceId: string;
}

export interface FlowStartInput extends ProfileInput {
    flowDefinitionId: string;
    executionContext?: FlowExecutionContext;
}

export interface FlowResumeInput extends ProfileInput {
    flowInstanceId: string;
    expectedStepIndex: number;
    expectedStepId: string;
    expectedPlanId?: EntityId<'plan'>;
}

export interface FlowCancelInput extends ProfileInput {
    flowInstanceId: string;
}

export interface FlowRetryInput extends ProfileInput {
    flowInstanceId: string;
}

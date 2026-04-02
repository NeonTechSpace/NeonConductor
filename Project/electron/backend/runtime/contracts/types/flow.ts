import type {
    FlowInstanceStatus,
    FlowTriggerKind,
    TopLevelTab,
    WorkflowCapability,
} from '@/app/backend/runtime/contracts/enums';

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
}

export interface FlowWorkflowStepDefinition {
    kind: 'workflow';
    id: string;
    label: string;
    workflowCapability: WorkflowCapability;
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
    startedAt?: string;
    finishedAt?: string;
}

export type FlowLifecycleEvent =
    | {
          eventType: 'flow.started';
          flowDefinitionId: string;
          flowInstanceId: string;
          at: string;
      }
    | {
          eventType: 'flow.step_started';
          flowDefinitionId: string;
          flowInstanceId: string;
          stepId: string;
          stepIndex: number;
          stepKind: FlowStepDefinition['kind'];
          at: string;
      }
    | {
          eventType: 'flow.step_completed';
          flowDefinitionId: string;
          flowInstanceId: string;
          stepId: string;
          stepIndex: number;
          stepKind: FlowStepDefinition['kind'];
          at: string;
      }
    | {
          eventType: 'flow.approval_required';
          flowDefinitionId: string;
          flowInstanceId: string;
          stepId: string;
          stepIndex: number;
          at: string;
      }
    | {
          eventType: 'flow.failed';
          flowDefinitionId: string;
          flowInstanceId: string;
          message: string;
          stepId?: string;
          stepIndex?: number;
          at: string;
      }
    | {
          eventType: 'flow.cancelled';
          flowDefinitionId: string;
          flowInstanceId: string;
          at: string;
      }
    | {
          eventType: 'flow.completed';
          flowDefinitionId: string;
          flowInstanceId: string;
          at: string;
      };

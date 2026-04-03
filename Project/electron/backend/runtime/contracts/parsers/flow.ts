import {
    flowApprovalKinds,
    flowDefinitionOriginKinds,
    flowInstanceStatuses,
    flowStepKinds,
    flowTriggerKinds,
    topLevelTabs,
    workflowCapabilities,
} from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readArray,
    readBoolean,
    readEntityId,
    readProfileId,
    readEnumValue,
    readObject,
    readOptionalBoolean,
    readOptionalString,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    FlowCancelInput,
    FlowDefinitionCreateInput,
    FlowDefinitionDeleteInput,
    FlowDefinitionGetInput,
    FlowDefinitionListInput,
    FlowDefinitionRecord,
    FlowDefinitionUpdateInput,
    FlowDefinitionView,
    FlowExecutionContext,
    FlowInstanceGetInput,
    FlowInstanceRecord,
    FlowInstanceListInput,
    FlowResumeInput,
    FlowRetryInput,
    FlowStartInput,
    FlowInstanceView,
    FlowStepDefinition,
} from '@/app/backend/runtime/contracts/types/flow';

import type { EntityId } from '@/shared/contracts';
import {
    flowLifecycleEventKinds,
    type FlowApprovalRequiredLifecycleEventPayload,
    type FlowCancelledLifecycleEventPayload,
    type FlowCompletedLifecycleEventPayload,
    type FlowFailedLifecycleEventPayload,
    type FlowLifecycleEvent,
    type FlowStartedLifecycleEventPayload,
    type FlowStepCompletedLifecycleEventPayload,
    type FlowStepStartedLifecycleEventPayload,
} from '@/shared/flowLifecycle';

function readNonNegativeInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid "${field}": expected non-negative integer.`);
    }

    return value;
}

function parseFlowStepDefinition(input: unknown, field: string): FlowStepDefinition {
    const source = readObject(input, field);
    const kind = readEnumValue(source.kind, `${field}.kind`, flowStepKinds);

    if (kind === 'legacy_command') {
        return {
            kind,
            id: readString(source.id, `${field}.id`),
            label: readString(source.label, `${field}.label`),
            command: readString(source.command, `${field}.command`),
        };
    }

    if (kind === 'mode_run') {
        const modeKey = readString(source.modeKey, `${field}.modeKey`);
        const promptMarkdown = readString(source.promptMarkdown, `${field}.promptMarkdown`);

        return {
            kind,
            id: readString(source.id, `${field}.id`),
            label: readString(source.label, `${field}.label`),
            topLevelTab: readEnumValue(source.topLevelTab, `${field}.topLevelTab`, topLevelTabs),
            modeKey: modeKey.trim(),
            promptMarkdown: promptMarkdown.trim(),
        };
    }

    if (kind === 'workflow') {
        const workflowCapability = readEnumValue(
            source.workflowCapability,
            `${field}.workflowCapability`,
            workflowCapabilities
        );
        const promptMarkdown = readString(source.promptMarkdown, `${field}.promptMarkdown`);
        const planningDepth =
            source.planningDepth !== undefined
                ? readEnumValue(source.planningDepth, `${field}.planningDepth`, ['simple', 'advanced'] as const)
                : undefined;
        const requireApprovedPlan = readOptionalBoolean(source.requireApprovedPlan, `${field}.requireApprovedPlan`);
        const reuseExistingPlan = readOptionalBoolean(source.reuseExistingPlan, `${field}.reuseExistingPlan`);

        return {
            kind,
            id: readString(source.id, `${field}.id`),
            label: readString(source.label, `${field}.label`),
            workflowCapability,
            promptMarkdown: promptMarkdown.trim(),
            ...(planningDepth ? { planningDepth } : workflowCapability === 'planning' ? { planningDepth: 'simple' } : {}),
            ...(requireApprovedPlan !== undefined
                ? { requireApprovedPlan }
                : workflowCapability === 'planning'
                  ? { requireApprovedPlan: true }
                  : {}),
            ...(reuseExistingPlan !== undefined
                ? { reuseExistingPlan }
                : workflowCapability === 'planning'
                  ? { reuseExistingPlan: true }
                  : {}),
        };
    }

    return {
        kind,
        id: readString(source.id, `${field}.id`),
        label: readString(source.label, `${field}.label`),
    };
}

function parseFlowExecutionContext(input: unknown, field: string): FlowExecutionContext {
    const source = readObject(input, field);
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, `${field}.workspaceFingerprint`);
    const sandboxId =
        source.sandboxId !== undefined ? readEntityId(source.sandboxId, `${field}.sandboxId`, 'sb') : undefined;
    const sessionId =
        source.sessionId !== undefined ? readEntityId(source.sessionId, `${field}.sessionId`, 'sess') : undefined;

    return {
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        ...(sessionId ? { sessionId } : {}),
    };
}

function readOptionalEntityId<P extends 'run' | 'thr' | 'sess' | 'plan' | 'prev'>(
    source: Record<string, unknown>,
    field: string,
    key: string,
    prefix: P
): EntityId<P> | undefined {
    const value = source[key];
    if (value === undefined) {
        return undefined;
    }

    return readEntityId(value, `${field}.${key}`, prefix);
}

function readOptionalPhaseId(source: Record<string, unknown>, field: string, key: string): string | undefined {
    const value = source[key];
    if (value === undefined) {
        return undefined;
    }

    return readOptionalString(value, `${field}.${key}`);
}

const awaitingApprovalPermissionRequestIdField = 'awaitingApproval.' + 'permissionRequestId';
const currentPlanPhaseRevisionIdField = 'currentPlanPhaseRevisionId';

export function parseFlowDefinitionRecord(input: unknown): FlowDefinitionRecord {
    const source = readObject(input, 'input');
    const description = readOptionalString(source.description, 'description');

    return {
        id: readString(source.id, 'id'),
        label: readString(source.label, 'label'),
        ...(description ? { description } : {}),
        enabled: readBoolean(source.enabled, 'enabled'),
        triggerKind: readEnumValue(source.triggerKind, 'triggerKind', flowTriggerKinds),
        steps: readArray(source.steps, 'steps').map((step, index) =>
            parseFlowStepDefinition(step, `steps[${String(index)}]`)
        ),
        createdAt: readString(source.createdAt, 'createdAt'),
        updatedAt: readString(source.updatedAt, 'updatedAt'),
    };
}

export function parseFlowInstanceRecord(input: unknown): FlowInstanceRecord {
    const source = readObject(input, 'input');
    const startedAt = readOptionalString(source.startedAt, 'startedAt');
    const finishedAt = readOptionalString(source.finishedAt, 'finishedAt');
    const currentRunId = readOptionalEntityId(source, 'input', 'currentRunId', 'run');
    const currentChildThreadId = readOptionalEntityId(source, 'input', 'currentChildThreadId', 'thr');
    const currentChildSessionId = readOptionalEntityId(source, 'input', 'currentChildSessionId', 'sess');
    const currentPlanId = readOptionalEntityId(source, 'input', 'currentPlanId', 'plan');
    const currentPlanRevisionId = readOptionalEntityId(source, 'input', 'currentPlanRevisionId', 'prev');
    const currentPlanPhaseId = readOptionalPhaseId(source, 'input', 'currentPlanPhaseId');
    const currentPlanPhaseRevisionId = readOptionalPhaseId(source, 'input', currentPlanPhaseRevisionIdField);
    const awaitingApprovalStepId = readOptionalString(source.awaitingApprovalStepId, 'awaitingApprovalStepId');
    const awaitingPermissionRequestId =
        source.awaitingPermissionRequestId !== undefined
            ? readEntityId(source.awaitingPermissionRequestId, 'awaitingPermissionRequestId', 'perm')
            : undefined;
    const awaitingPlanId = readOptionalEntityId(source, 'input', 'awaitingPlanId', 'plan');
    const awaitingPlanRevisionId = readOptionalEntityId(source, 'input', 'awaitingPlanRevisionId', 'prev');
    const awaitingRequiredPlanStatus = source.awaitingRequiredPlanStatus
        ? readEnumValue(source.awaitingRequiredPlanStatus, 'awaitingRequiredPlanStatus', ['draft', 'approved'] as const)
        : undefined;
    const lastErrorMessage = readOptionalString(source.lastErrorMessage, 'lastErrorMessage');
    const retrySourceFlowInstanceId = readOptionalString(source.retrySourceFlowInstanceId, 'retrySourceFlowInstanceId');

    return {
        id: readString(source.id, 'id'),
        flowDefinitionId: readString(source.flowDefinitionId, 'flowDefinitionId'),
        status: readEnumValue(source.status, 'status', flowInstanceStatuses),
        currentStepIndex: readNonNegativeInteger(source.currentStepIndex, 'currentStepIndex'),
        ...(source.executionContext
            ? { executionContext: parseFlowExecutionContext(source.executionContext, 'executionContext') }
            : {}),
        ...(currentRunId ? { currentRunId } : {}),
        ...(currentChildThreadId ? { currentChildThreadId } : {}),
        ...(currentChildSessionId ? { currentChildSessionId } : {}),
        ...(currentPlanId ? { currentPlanId } : {}),
        ...(currentPlanRevisionId ? { currentPlanRevisionId } : {}),
        ...(currentPlanPhaseId ? { currentPlanPhaseId } : {}),
        ...(currentPlanPhaseRevisionId ? { currentPlanPhaseRevisionId } : {}),
        ...(source.awaitingApprovalKind
            ? {
                  awaitingApprovalKind: readEnumValue(
                      source.awaitingApprovalKind,
                      'awaitingApprovalKind',
                      flowApprovalKinds
                  ),
              }
            : {}),
        ...(source.awaitingApprovalStepIndex !== undefined
            ? {
                  awaitingApprovalStepIndex: readNonNegativeInteger(
                      source.awaitingApprovalStepIndex,
                      'awaitingApprovalStepIndex'
                  ),
              }
            : {}),
        ...(awaitingApprovalStepId ? { awaitingApprovalStepId } : {}),
        ...(awaitingPermissionRequestId ? { awaitingPermissionRequestId } : {}),
        ...(awaitingPlanId ? { awaitingPlanId } : {}),
        ...(awaitingPlanRevisionId ? { awaitingPlanRevisionId } : {}),
        ...(awaitingRequiredPlanStatus ? { awaitingRequiredPlanStatus } : {}),
        ...(lastErrorMessage ? { lastErrorMessage } : {}),
        ...(retrySourceFlowInstanceId ? { retrySourceFlowInstanceId } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(finishedAt ? { finishedAt } : {}),
    };
}

export function parseFlowDefinitionListInput(input: unknown): FlowDefinitionListInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
    };
}

export function parseFlowDefinitionGetInput(input: unknown): FlowDefinitionGetInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        flowDefinitionId: readString(source.flowDefinitionId, 'flowDefinitionId'),
    };
}

export function parseFlowDefinitionCreateInput(input: unknown): FlowDefinitionCreateInput {
    const source = readObject(input, 'input');
    const description = readOptionalString(source.description, 'description');

    return {
        profileId: readProfileId(source),
        label: readString(source.label, 'label'),
        ...(description ? { description } : {}),
        enabled: readBoolean(source.enabled, 'enabled'),
        triggerKind: readEnumValue(source.triggerKind, 'triggerKind', flowTriggerKinds),
        steps: readArray(source.steps, 'steps').map((step, index) =>
            parseFlowStepDefinition(step, `steps[${String(index)}]`)
        ),
    };
}

export function parseFlowDefinitionUpdateInput(input: unknown): FlowDefinitionUpdateInput {
    const source = readObject(input, 'input');
    const description = readOptionalString(source.description, 'description');

    return {
        profileId: readProfileId(source),
        flowDefinitionId: readString(source.flowDefinitionId, 'flowDefinitionId'),
        label: readString(source.label, 'label'),
        ...(description ? { description } : {}),
        enabled: readBoolean(source.enabled, 'enabled'),
        triggerKind: readEnumValue(source.triggerKind, 'triggerKind', flowTriggerKinds),
        steps: readArray(source.steps, 'steps').map((step, index) =>
            parseFlowStepDefinition(step, `steps[${String(index)}]`)
        ),
    };
}

export function parseFlowDefinitionDeleteInput(input: unknown): FlowDefinitionDeleteInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        flowDefinitionId: readString(source.flowDefinitionId, 'flowDefinitionId'),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export function parseFlowInstanceListInput(input: unknown): FlowInstanceListInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
    };
}

export function parseFlowInstanceGetInput(input: unknown): FlowInstanceGetInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        flowInstanceId: readString(source.flowInstanceId, 'flowInstanceId'),
    };
}

export function parseFlowStartInput(input: unknown): FlowStartInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        flowDefinitionId: readString(source.flowDefinitionId, 'flowDefinitionId'),
        ...(source.executionContext
            ? { executionContext: parseFlowExecutionContext(source.executionContext, 'executionContext') }
            : {}),
    };
}

export function parseFlowResumeInput(input: unknown): FlowResumeInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        flowInstanceId: readString(source.flowInstanceId, 'flowInstanceId'),
        expectedStepIndex: readNonNegativeInteger(source.expectedStepIndex, 'expectedStepIndex'),
        expectedStepId: readString(source.expectedStepId, 'expectedStepId'),
        ...(source.expectedPlanId ? { expectedPlanId: readEntityId(source.expectedPlanId, 'expectedPlanId', 'plan') } : {}),
    };
}

export function parseFlowCancelInput(input: unknown): FlowCancelInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        flowInstanceId: readString(source.flowInstanceId, 'flowInstanceId'),
    };
}

export function parseFlowRetryInput(input: unknown): FlowRetryInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        flowInstanceId: readString(source.flowInstanceId, 'flowInstanceId'),
    };
}

export function parseFlowDefinitionView(input: unknown): FlowDefinitionView {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sourceBranchWorkflowId = readOptionalString(source.sourceBranchWorkflowId, 'sourceBranchWorkflowId');

    return {
        definition: parseFlowDefinitionRecord(source.definition),
        originKind: readEnumValue(source.originKind, 'originKind', flowDefinitionOriginKinds),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sourceBranchWorkflowId ? { sourceBranchWorkflowId } : {}),
    };
}

export function parseFlowInstanceView(input: unknown): FlowInstanceView {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sourceBranchWorkflowId = readOptionalString(source.sourceBranchWorkflowId, 'sourceBranchWorkflowId');
    const currentRunId = readOptionalEntityId(source, 'input', 'currentRunId', 'run');
    const currentChildThreadId = readOptionalEntityId(source, 'input', 'currentChildThreadId', 'thr');
    const currentChildSessionId = readOptionalEntityId(source, 'input', 'currentChildSessionId', 'sess');
    const currentPlanId = readOptionalEntityId(source, 'input', 'currentPlanId', 'plan');
    const currentPlanRevisionId = readOptionalEntityId(source, 'input', 'currentPlanRevisionId', 'prev');
    const currentPlanPhaseId = readOptionalPhaseId(source, 'input', 'currentPlanPhaseId');
    const currentPlanPhaseRevisionId = readOptionalPhaseId(source, 'input', currentPlanPhaseRevisionIdField);
    const lastErrorMessage = readOptionalString(source.lastErrorMessage, 'lastErrorMessage');
    const retrySourceFlowInstanceId = readOptionalString(source.retrySourceFlowInstanceId, 'retrySourceFlowInstanceId');
    const currentStepSource = source.currentStep ? readObject(source.currentStep, 'currentStep') : undefined;
    const awaitingApprovalSource = source.awaitingApproval
        ? readObject(source.awaitingApproval, 'awaitingApproval')
        : undefined;
    const availableActionsSource = readObject(source.availableActions, 'availableActions');
    const awaitingApprovalPermissionRequestId =
        awaitingApprovalSource?.permissionRequestId !== undefined
            ? readEntityId(awaitingApprovalSource.permissionRequestId, awaitingApprovalPermissionRequestIdField, 'perm')
            : undefined;

    return {
        instance: parseFlowInstanceRecord(source.instance),
        definitionSnapshot: parseFlowDefinitionRecord(source.definitionSnapshot),
        lifecycleEvents: readArray(source.lifecycleEvents, 'lifecycleEvents').map((event, index) =>
            parseFlowLifecycleEvent(event, `lifecycleEvents[${String(index)}]`)
        ),
        ...(source.executionContext
            ? { executionContext: parseFlowExecutionContext(source.executionContext, 'executionContext') }
            : {}),
        ...(currentRunId ? { currentRunId } : {}),
        ...(currentChildThreadId ? { currentChildThreadId } : {}),
        ...(currentChildSessionId ? { currentChildSessionId } : {}),
        ...(currentPlanId ? { currentPlanId } : {}),
        ...(currentPlanRevisionId ? { currentPlanRevisionId } : {}),
        ...(currentPlanPhaseId ? { currentPlanPhaseId } : {}),
        ...(currentPlanPhaseRevisionId ? { currentPlanPhaseRevisionId } : {}),
        ...(currentStepSource
            ? {
                  currentStep: {
                      stepIndex: readNonNegativeInteger(currentStepSource.stepIndex, 'currentStep.stepIndex'),
                      step: parseFlowStepDefinition(currentStepSource.step, 'currentStep.step'),
                  },
              }
            : {}),
        ...(awaitingApprovalSource
            ? {
                  awaitingApproval: {
                      kind: readEnumValue(awaitingApprovalSource.kind, 'awaitingApproval.kind', flowApprovalKinds),
                      stepIndex: readNonNegativeInteger(
                          awaitingApprovalSource.stepIndex,
                          'awaitingApproval.stepIndex'
                      ),
                      stepId: readString(awaitingApprovalSource.stepId, 'awaitingApproval.stepId'),
                      reason: readString(awaitingApprovalSource.reason, 'awaitingApproval.reason'),
                      ...(awaitingApprovalPermissionRequestId
                          ? { permissionRequestId: awaitingApprovalPermissionRequestId }
                          : {}),
                      ...(awaitingApprovalSource.planId
                          ? { planId: readEntityId(awaitingApprovalSource.planId, 'awaitingApproval.planId', 'plan') }
                          : {}),
                      ...(awaitingApprovalSource.planRevisionId
                          ? {
                                planRevisionId: readEntityId(
                                    awaitingApprovalSource.planRevisionId,
                                    'awaitingApproval.planRevisionId',
                                    'prev'
                                ),
                            }
                          : {}),
                      ...(awaitingApprovalSource.requiredPlanStatus
                          ? {
                                requiredPlanStatus: readEnumValue(
                                    awaitingApprovalSource.requiredPlanStatus,
                                    'awaitingApproval.requiredPlanStatus',
                                    ['draft', 'approved'] as const
                                ),
                            }
                          : {}),
                  },
              }
            : {}),
        availableActions: {
            canResume: readBoolean(availableActionsSource.canResume, 'availableActions.canResume'),
            canCancel: readBoolean(availableActionsSource.canCancel, 'availableActions.canCancel'),
            canRetry: readBoolean(availableActionsSource.canRetry, 'availableActions.canRetry'),
        },
        ...(lastErrorMessage ? { lastErrorMessage } : {}),
        ...(retrySourceFlowInstanceId ? { retrySourceFlowInstanceId } : {}),
        originKind: readEnumValue(source.originKind, 'originKind', flowDefinitionOriginKinds),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sourceBranchWorkflowId ? { sourceBranchWorkflowId } : {}),
    };
}

export function parseFlowLifecycleEvent(input: unknown, field = 'input'): FlowLifecycleEvent {
    const source = readObject(input, field);
    const kind = readEnumValue(source.kind, 'kind', flowLifecycleEventKinds);
    const flowDefinitionId = readString(source.flowDefinitionId, 'flowDefinitionId');
    const flowInstanceId = readString(source.flowInstanceId, 'flowInstanceId');
    const at = readString(source.at, 'at');
    const id = readString(source.id, 'id');
    const payload = readObject(source.payload, 'payload');

    if (kind === 'flow.started') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                triggerKind: readEnumValue(payload.triggerKind, 'payload.triggerKind', flowTriggerKinds),
                stepCount: readNonNegativeInteger(payload.stepCount, 'payload.stepCount'),
                status: 'queued',
                ...(payload.retrySourceFlowInstanceId
                    ? {
                          retrySourceFlowInstanceId: readString(
                              payload.retrySourceFlowInstanceId,
                              'payload.retrySourceFlowInstanceId'
                          ),
                      }
                    : {}),
            } satisfies FlowStartedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.step_started') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex'),
                stepId: readString(payload.stepId, 'payload.stepId'),
                stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds),
                status: 'running',
                ...(payload.currentRunId
                    ? { currentRunId: readEntityId(payload.currentRunId, 'payload.currentRunId', 'run') }
                    : {}),
                ...(payload.currentChildThreadId
                    ? {
                          currentChildThreadId: readEntityId(
                              payload.currentChildThreadId,
                              'payload.currentChildThreadId',
                              'thr'
                          ),
                      }
                    : {}),
                ...(payload.currentChildSessionId
                    ? {
                          currentChildSessionId: readEntityId(
                              payload.currentChildSessionId,
                              'payload.currentChildSessionId',
                              'sess'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanId
                    ? { currentPlanId: readEntityId(payload.currentPlanId, 'payload.currentPlanId', 'plan') }
                    : {}),
                ...(payload.currentPlanRevisionId
                    ? {
                          currentPlanRevisionId: readEntityId(
                              payload.currentPlanRevisionId,
                              'payload.currentPlanRevisionId',
                              'prev'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanPhaseId
                    ? { currentPlanPhaseId: readString(payload.currentPlanPhaseId, 'payload.currentPlanPhaseId') }
                    : {}),
                    ...(payload.currentPlanPhaseRevisionId
                        ? {
                              currentPlanPhaseRevisionId: readString(
                                  payload.currentPlanPhaseRevisionId,
                                  'payload.' + currentPlanPhaseRevisionIdField
                              ),
                          }
                        : {}),
            } satisfies FlowStepStartedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.step_completed') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex'),
                stepId: readString(payload.stepId, 'payload.stepId'),
                stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds),
                status: 'running',
                ...(payload.currentRunId
                    ? { currentRunId: readEntityId(payload.currentRunId, 'payload.currentRunId', 'run') }
                    : {}),
                ...(payload.currentChildThreadId
                    ? {
                          currentChildThreadId: readEntityId(
                              payload.currentChildThreadId,
                              'payload.currentChildThreadId',
                              'thr'
                          ),
                      }
                    : {}),
                ...(payload.currentChildSessionId
                    ? {
                          currentChildSessionId: readEntityId(
                              payload.currentChildSessionId,
                              'payload.currentChildSessionId',
                              'sess'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanId
                    ? { currentPlanId: readEntityId(payload.currentPlanId, 'payload.currentPlanId', 'plan') }
                    : {}),
                ...(payload.currentPlanRevisionId
                    ? {
                          currentPlanRevisionId: readEntityId(
                              payload.currentPlanRevisionId,
                              'payload.currentPlanRevisionId',
                              'prev'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanPhaseId
                    ? { currentPlanPhaseId: readString(payload.currentPlanPhaseId, 'payload.currentPlanPhaseId') }
                    : {}),
                    ...(payload.currentPlanPhaseRevisionId
                        ? {
                              currentPlanPhaseRevisionId: readString(
                                  payload.currentPlanPhaseRevisionId,
                                  'payload.' + currentPlanPhaseRevisionIdField
                              ),
                          }
                        : {}),
            } satisfies FlowStepCompletedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.approval_required') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex'),
                stepId: readString(payload.stepId, 'payload.stepId'),
                stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds),
                reason: readString(payload.reason, 'payload.reason'),
                approvalKind: readEnumValue(payload.approvalKind, 'payload.approvalKind', flowApprovalKinds),
                ...(payload.permissionRequestId
                    ? {
                          permissionRequestId: readEntityId(
                              payload.permissionRequestId,
                              'payload.permissionRequestId',
                              'perm'
                          ),
                      }
                    : {}),
                ...(payload.planId ? { planId: readEntityId(payload.planId, 'payload.planId', 'plan') } : {}),
                ...(payload.planRevisionId
                    ? { planRevisionId: readEntityId(payload.planRevisionId, 'payload.planRevisionId', 'prev') }
                    : {}),
                ...(payload.requiredPlanStatus
                    ? {
                          requiredPlanStatus: readEnumValue(
                              payload.requiredPlanStatus,
                              'payload.requiredPlanStatus',
                              ['draft', 'approved'] as const
                          ),
                      }
                    : {}),
                status: 'approval_required',
            } satisfies FlowApprovalRequiredLifecycleEventPayload,
        };
    }

    if (kind === 'flow.failed') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                errorMessage: readString(payload.errorMessage, 'payload.errorMessage'),
                status: 'failed',
                ...(payload.stepIndex !== undefined
                    ? { stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex') }
                    : {}),
                ...(payload.stepId ? { stepId: readString(payload.stepId, 'payload.stepId') } : {}),
                ...(payload.stepKind ? { stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds) } : {}),
                ...(payload.currentRunId
                    ? { currentRunId: readEntityId(payload.currentRunId, 'payload.currentRunId', 'run') }
                    : {}),
                ...(payload.currentChildThreadId
                    ? {
                          currentChildThreadId: readEntityId(
                              payload.currentChildThreadId,
                              'payload.currentChildThreadId',
                              'thr'
                          ),
                      }
                    : {}),
                ...(payload.currentChildSessionId
                    ? {
                          currentChildSessionId: readEntityId(
                              payload.currentChildSessionId,
                              'payload.currentChildSessionId',
                              'sess'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanId
                    ? { currentPlanId: readEntityId(payload.currentPlanId, 'payload.currentPlanId', 'plan') }
                    : {}),
                ...(payload.currentPlanRevisionId
                    ? {
                          currentPlanRevisionId: readEntityId(
                              payload.currentPlanRevisionId,
                              'payload.currentPlanRevisionId',
                              'prev'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanPhaseId
                    ? { currentPlanPhaseId: readString(payload.currentPlanPhaseId, 'payload.currentPlanPhaseId') }
                    : {}),
                    ...(payload.currentPlanPhaseRevisionId
                        ? {
                              currentPlanPhaseRevisionId: readString(
                                  payload.currentPlanPhaseRevisionId,
                                  'payload.' + currentPlanPhaseRevisionIdField
                              ),
                          }
                        : {}),
            } satisfies FlowFailedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.cancelled') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                status: 'cancelled',
                ...(payload.reason ? { reason: readString(payload.reason, 'payload.reason') } : {}),
                ...(payload.stepIndex !== undefined
                    ? { stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex') }
                    : {}),
                ...(payload.stepId ? { stepId: readString(payload.stepId, 'payload.stepId') } : {}),
                ...(payload.stepKind ? { stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds) } : {}),
                ...(payload.currentRunId
                    ? { currentRunId: readEntityId(payload.currentRunId, 'payload.currentRunId', 'run') }
                    : {}),
                ...(payload.currentChildThreadId
                    ? {
                          currentChildThreadId: readEntityId(
                              payload.currentChildThreadId,
                              'payload.currentChildThreadId',
                              'thr'
                          ),
                      }
                    : {}),
                ...(payload.currentChildSessionId
                    ? {
                          currentChildSessionId: readEntityId(
                              payload.currentChildSessionId,
                              'payload.currentChildSessionId',
                              'sess'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanId
                    ? { currentPlanId: readEntityId(payload.currentPlanId, 'payload.currentPlanId', 'plan') }
                    : {}),
                ...(payload.currentPlanRevisionId
                    ? {
                          currentPlanRevisionId: readEntityId(
                              payload.currentPlanRevisionId,
                              'payload.currentPlanRevisionId',
                              'prev'
                          ),
                      }
                    : {}),
                ...(payload.currentPlanPhaseId
                    ? { currentPlanPhaseId: readString(payload.currentPlanPhaseId, 'payload.currentPlanPhaseId') }
                    : {}),
                    ...(payload.currentPlanPhaseRevisionId
                        ? {
                              currentPlanPhaseRevisionId: readString(
                                  payload.currentPlanPhaseRevisionId,
                                  'payload.' + currentPlanPhaseRevisionIdField
                              ),
                          }
                        : {}),
            } satisfies FlowCancelledLifecycleEventPayload,
        };
    }

    return {
        id,
        kind,
        flowDefinitionId,
        flowInstanceId,
        at,
        payload: {
            completedStepCount: readNonNegativeInteger(payload.completedStepCount, 'payload.completedStepCount'),
            status: 'completed',
        } satisfies FlowCompletedLifecycleEventPayload,
    };
}

export const flowDefinitionRecordSchema = createParser(parseFlowDefinitionRecord);
export const flowInstanceRecordSchema = createParser(parseFlowInstanceRecord);
export const flowLifecycleEventSchema = createParser(parseFlowLifecycleEvent);
export const flowDefinitionListInputSchema = createParser(parseFlowDefinitionListInput);
export const flowDefinitionGetInputSchema = createParser(parseFlowDefinitionGetInput);
export const flowDefinitionCreateInputSchema = createParser(parseFlowDefinitionCreateInput);
export const flowDefinitionUpdateInputSchema = createParser(parseFlowDefinitionUpdateInput);
export const flowDefinitionDeleteInputSchema = createParser(parseFlowDefinitionDeleteInput);
export const flowInstanceListInputSchema = createParser(parseFlowInstanceListInput);
export const flowInstanceGetInputSchema = createParser(parseFlowInstanceGetInput);
export const flowStartInputSchema = createParser(parseFlowStartInput);
export const flowResumeInputSchema = createParser(parseFlowResumeInput);
export const flowCancelInputSchema = createParser(parseFlowCancelInput);
export const flowRetryInputSchema = createParser(parseFlowRetryInput);
export const flowDefinitionViewSchema = createParser(parseFlowDefinitionView);
export const flowInstanceViewSchema = createParser(parseFlowInstanceView);

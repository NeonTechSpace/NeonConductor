import { flowStore } from '@/app/backend/persistence/stores';
import type { FlowInstancePersistenceRecord, PermissionRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
    FlowApprovalKind,
    FlowCancelInput,
    FlowDefinitionView,
    FlowExecutionContext,
    FlowInstanceRecord,
    FlowInstanceView,
    FlowModeRunStepDefinition,
    FlowResumeInput,
    FlowRetryInput,
    FlowStartInput,
    FlowStepDefinition,
    FlowWorkflowStepDefinition,
    PlanRecordView,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { activeFlowExecutionRegistry } from '@/app/backend/runtime/services/flows/activeExecutionRegistry';
import { appendFlowLifecycleEvent } from '@/app/backend/runtime/services/flows/events';
import type {
    FlowStepProvenance,
    StepExecutionResult,
} from '@/app/backend/runtime/services/flows/execution/flowExecutionTypes';
import { executeModeRunStep } from '@/app/backend/runtime/services/flows/execution/flowModeRunStepExecutor';
import {
    executePlanningWorkflowStep,
    resolvePlanningArtifact,
} from '@/app/backend/runtime/services/flows/execution/flowPlanningWorkflowExecutor';
import type { RequiredPlanCheckpointStatus } from '@/app/backend/runtime/services/flows/execution/flowStepHelpers';
import { executeFlowLegacyCommandStep } from '@/app/backend/runtime/services/flows/legacyCommandExecutor';

import {
    createFlowApprovalRequiredLifecycleEvent,
    createFlowCancelledLifecycleEvent,
    createFlowCompletedLifecycleEvent,
    createFlowFailedLifecycleEvent,
    createFlowStartedLifecycleEvent,
    createFlowStepCompletedLifecycleEvent,
    createFlowStepStartedLifecycleEvent,
} from '@/shared/flowLifecycle';

function readCurrentStep(record: FlowInstancePersistenceRecord): FlowStepDefinition | undefined {
    return record.definitionSnapshot.steps[record.instance.currentStepIndex];
}

function readCurrentStepProvenance(instance: FlowInstanceRecord): FlowStepProvenance {
    return {
        ...(instance.currentRunId ? { currentRunId: instance.currentRunId } : {}),
        ...(instance.currentChildThreadId ? { currentChildThreadId: instance.currentChildThreadId } : {}),
        ...(instance.currentChildSessionId ? { currentChildSessionId: instance.currentChildSessionId } : {}),
        ...(instance.currentPlanId ? { currentPlanId: instance.currentPlanId } : {}),
        ...(instance.currentPlanRevisionId ? { currentPlanRevisionId: instance.currentPlanRevisionId } : {}),
        ...(instance.currentPlanPhaseId ? { currentPlanPhaseId: instance.currentPlanPhaseId } : {}),
        ...(instance.currentPlanPhaseRevisionId
            ? { currentPlanPhaseRevisionId: instance.currentPlanPhaseRevisionId }
            : {}),
    };
}

function clearCurrentStepProvenance(instance: FlowInstanceRecord): FlowInstanceRecord {
    const nextInstance = { ...instance };
    delete nextInstance.currentRunId;
    delete nextInstance.currentChildThreadId;
    delete nextInstance.currentChildSessionId;
    delete nextInstance.currentPlanId;
    delete nextInstance.currentPlanRevisionId;
    delete nextInstance.currentPlanPhaseId;
    delete nextInstance.currentPlanPhaseRevisionId;
    return nextInstance;
}

function applyCurrentStepProvenance(instance: FlowInstanceRecord, provenance?: FlowStepProvenance): FlowInstanceRecord {
    const nextInstance = clearCurrentStepProvenance(instance);
    if (!provenance) {
        return nextInstance;
    }

    return {
        ...nextInstance,
        ...provenance,
    };
}

function resolveExecutionContext(input: {
    flowDefinition: FlowDefinitionView;
    executionContext?: FlowExecutionContext;
}): FlowExecutionContext | undefined {
    const workspaceFingerprint =
        input.executionContext?.workspaceFingerprint ?? input.flowDefinition.workspaceFingerprint ?? undefined;
    const sandboxId = input.executionContext?.sandboxId;
    const sessionId = input.executionContext?.sessionId;

    if (!workspaceFingerprint && !sandboxId && !sessionId) {
        return undefined;
    }

    return {
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        ...(sessionId ? { sessionId } : {}),
    };
}

function clearAwaitingApprovalState(instance: FlowInstanceRecord): FlowInstanceRecord {
    const nextInstance = { ...instance };
    delete nextInstance.awaitingApprovalKind;
    delete nextInstance.awaitingApprovalStepIndex;
    delete nextInstance.awaitingApprovalStepId;
    delete nextInstance.awaitingPermissionRequestId;
    delete nextInstance.awaitingPlanId;
    delete nextInstance.awaitingPlanRevisionId;
    delete nextInstance.awaitingRequiredPlanStatus;
    return nextInstance;
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class FlowExecutionService {
    async startInstance(
        input: FlowStartInput
    ): Promise<OperationalResult<{ found: false } | { found: true; flowInstance: FlowInstanceView }>> {
        const flowDefinition = await flowStore.getCanonicalDefinitionById(input.profileId, input.flowDefinitionId);
        if (!flowDefinition) {
            return okOp({ found: false });
        }
        if (!flowDefinition.definition.enabled) {
            return errOp('invalid_input', 'Disabled flows cannot be executed.');
        }

        const flowInstance = await this.startPersistedDefinition({
            profileId: input.profileId,
            flowDefinition: {
                definition: flowDefinition.definition,
                originKind: flowDefinition.originKind,
                ...(flowDefinition.workspaceFingerprint
                    ? { workspaceFingerprint: flowDefinition.workspaceFingerprint }
                    : {}),
                ...(flowDefinition.sourceBranchWorkflowId
                    ? { sourceBranchWorkflowId: flowDefinition.sourceBranchWorkflowId }
                    : {}),
            },
            ...(input.executionContext ? { executionContext: input.executionContext } : {}),
        });

        return flowInstance.match(
            (value) =>
                okOp({
                    found: true,
                    flowInstance: value,
                }),
            (error) => errOp(error.code, error.message)
        );
    }

    async startPersistedDefinition(input: {
        profileId: string;
        flowDefinition: FlowDefinitionView;
        executionContext?: FlowExecutionContext;
        retrySourceFlowInstanceId?: string;
    }): Promise<OperationalResult<FlowInstanceView>> {
        const resolvedExecutionContext = resolveExecutionContext(input);
        const persistedInstance = await flowStore.createFlowInstance({
            profileId: input.profileId,
            flowDefinitionId: input.flowDefinition.definition.id,
            definitionSnapshot: input.flowDefinition.definition,
            ...(resolvedExecutionContext ? { executionContext: resolvedExecutionContext } : {}),
            ...(input.retrySourceFlowInstanceId ? { retrySourceFlowInstanceId: input.retrySourceFlowInstanceId } : {}),
        });
        if (!persistedInstance) {
            return errOp('flow_not_found', `Flow definition "${input.flowDefinition.definition.id}" was not found.`);
        }

        return this.executePersistedInstance({
            profileId: input.profileId,
            record: persistedInstance,
        });
    }

    async resumeInstance(
        input: FlowResumeInput
    ): Promise<OperationalResult<{ found: false } | { found: true; flowInstance: FlowInstanceView }>> {
        const record = await flowStore.getFlowInstanceById(input.profileId, input.flowInstanceId);
        if (!record) {
            return okOp({ found: false });
        }
        if (
            record.instance.status !== 'approval_required' ||
            record.instance.awaitingApprovalStepIndex !== input.expectedStepIndex ||
            record.instance.awaitingApprovalStepId !== input.expectedStepId
        ) {
            return errOp('invalid_input', 'Flow instance is not waiting on the requested approval state.');
        }

        if (record.instance.awaitingApprovalKind === 'tool_permission') {
            return errOp(
                'invalid_input',
                'Tool-permission approvals resume automatically and cannot be resumed manually.'
            );
        }

        if (record.instance.awaitingApprovalKind === 'plan_checkpoint') {
            if (input.expectedPlanId && record.instance.awaitingPlanId !== input.expectedPlanId) {
                return errOp('invalid_input', 'Flow instance is not waiting on the requested linked plan.');
            }

            const flowInstance = await this.executePersistedInstance({
                profileId: input.profileId,
                record,
                resumePlanCheckpoint: true,
                ...(input.expectedPlanId ? { expectedPlanId: input.expectedPlanId } : {}),
            });

            return flowInstance.match(
                (value) =>
                    okOp({
                        found: true,
                        flowInstance: value,
                    }),
                (error) => errOp(error.code, error.message)
            );
        }

        if (record.instance.awaitingApprovalKind !== 'flow_gate') {
            return errOp('invalid_input', 'Flow instance is not waiting on a resumable approval state.');
        }

        const flowInstance = await this.executePersistedInstance({
            profileId: input.profileId,
            record,
            resumeFlowGate: true,
        });

        return flowInstance.match(
            (value) =>
                okOp({
                    found: true,
                    flowInstance: value,
                }),
            (error) => errOp(error.code, error.message)
        );
    }

    async cancelInstance(
        input: FlowCancelInput
    ): Promise<OperationalResult<{ found: false } | { found: true; flowInstance: FlowInstanceView }>> {
        const record = await flowStore.getFlowInstanceById(input.profileId, input.flowInstanceId);
        if (!record) {
            return okOp({ found: false });
        }
        if (!['queued', 'running', 'approval_required'].includes(record.instance.status)) {
            return errOp(
                'invalid_input',
                'Only queued, running, or approval-required flow instances can be cancelled.'
            );
        }

        const activeExecution = activeFlowExecutionRegistry.cancel(record.instance.id);
        if (activeExecution) {
            return okOp({
                found: true,
                flowInstance: await this.waitForCancelledView(input.profileId, record.instance.id),
            });
        }

        const currentStep = readCurrentStep(record);
        const cancelled = await this.markCancelled({
            profileId: input.profileId,
            record,
            reason: 'Flow execution was cancelled.',
            ...(currentStep ? { step: currentStep, stepIndex: record.instance.currentStepIndex } : {}),
        });

        return okOp({
            found: true,
            flowInstance: cancelled,
        });
    }

    async retryInstance(
        input: FlowRetryInput
    ): Promise<OperationalResult<{ found: false } | { found: true; flowInstance: FlowInstanceView }>> {
        const record = await flowStore.getFlowInstanceById(input.profileId, input.flowInstanceId);
        if (!record) {
            return okOp({ found: false });
        }
        if (!['failed', 'cancelled'].includes(record.instance.status)) {
            return errOp('invalid_input', 'Only failed or cancelled flow instances can be retried.');
        }

        const flowInstance = await this.startPersistedDefinition({
            profileId: input.profileId,
            flowDefinition: {
                definition: record.definitionSnapshot,
                originKind: record.originKind,
                ...(record.workspaceFingerprint ? { workspaceFingerprint: record.workspaceFingerprint } : {}),
                ...(record.sourceBranchWorkflowId ? { sourceBranchWorkflowId: record.sourceBranchWorkflowId } : {}),
            },
            ...(record.instance.executionContext ? { executionContext: record.instance.executionContext } : {}),
            retrySourceFlowInstanceId: record.instance.id,
        });

        return flowInstance.match(
            (value) =>
                okOp({
                    found: true,
                    flowInstance: value,
                }),
            (error) => errOp(error.code, error.message)
        );
    }

    async handlePermissionResolution(input: { profileId: string; request: PermissionRecord }): Promise<void> {
        if (!input.request.flowInstanceId) {
            return;
        }

        const record = await flowStore.getFlowInstanceById(input.profileId, input.request.flowInstanceId);
        if (
            !record ||
            record.instance.status !== 'approval_required' ||
            record.instance.awaitingApprovalKind !== 'tool_permission' ||
            record.instance.awaitingPermissionRequestId !== input.request.id
        ) {
            return;
        }

        if (input.request.decision === 'granted') {
            const resumed = await this.executePersistedInstance({
                profileId: input.profileId,
                record,
            });
            resumed.match(
                () => undefined,
                (error) => {
                    throw new Error(
                        `Permission-approved flow instance "${record.instance.id}" could not resume: ${error.message}`
                    );
                }
            );
            return;
        }

        if (input.request.decision === 'denied') {
            const currentStep = readCurrentStep(record);
            if (!currentStep) {
                return;
            }
            const commandText = input.request.commandText ? ` "${input.request.commandText}"` : '';
            await this.markFailed({
                profileId: input.profileId,
                record,
                message: `Flow command approval was denied for${commandText}.`,
                step: currentStep,
                stepIndex: record.instance.currentStepIndex,
            });
        }
    }

    private async executePersistedInstance(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        resumeFlowGate?: boolean;
        resumePlanCheckpoint?: boolean;
        expectedPlanId?: EntityId<'plan'>;
    }): Promise<OperationalResult<FlowInstanceView>> {
        const controller = activeFlowExecutionRegistry.begin(input.record.instance.id);
        if (!controller) {
            return errOp('invalid_input', 'Flow instance is already executing.');
        }

        let record = input.record;

        try {
            if (record.instance.status === 'queued') {
                record = await this.writeStarted(input.profileId, record);
            }

            while (record.instance.currentStepIndex < record.definitionSnapshot.steps.length) {
                if (controller.signal.aborted) {
                    return okOp(
                        await this.markCancelled({
                            profileId: input.profileId,
                            record,
                            reason: 'Flow execution was cancelled.',
                            ...(readCurrentStep(record)
                                ? {
                                      step: readCurrentStep(record) as FlowStepDefinition,
                                      stepIndex: record.instance.currentStepIndex,
                                  }
                                : {}),
                        })
                    );
                }

                const stepIndex = record.instance.currentStepIndex;
                const step = record.definitionSnapshot.steps[stepIndex];
                if (!step) {
                    break;
                }

                const isResumingApprovalStep =
                    record.instance.status === 'approval_required' &&
                    record.instance.awaitingApprovalStepIndex === stepIndex &&
                    record.instance.awaitingApprovalStepId === step.id;

                if (step.kind === 'approval_gate') {
                    if (!isResumingApprovalStep) {
                        record = await this.writeStepStarted(input.profileId, record, stepIndex, step);
                    }

                    if (isResumingApprovalStep) {
                        if (record.instance.awaitingApprovalKind !== 'flow_gate' || !input.resumeFlowGate) {
                            return errOp(
                                'invalid_input',
                                'Flow instance is waiting on explicit flow-gate approval and must be resumed directly.'
                            );
                        }

                        record = await this.writeStepCompleted({
                            profileId: input.profileId,
                            record,
                            stepIndex,
                            step,
                            nextStepIndex: stepIndex + 1,
                        });
                        continue;
                    }

                    return okOp(
                        await this.writeApprovalRequired({
                            profileId: input.profileId,
                            record,
                            stepIndex,
                            step,
                            approvalKind: 'flow_gate',
                            reason: 'Flow requires explicit approval before continuing.',
                        })
                    );
                }

                if (step.kind === 'legacy_command') {
                    if (!isResumingApprovalStep) {
                        record = await this.writeStepStarted(input.profileId, record, stepIndex, step);
                    } else if (record.instance.awaitingApprovalKind !== 'tool_permission') {
                        return errOp(
                            'invalid_input',
                            'Flow instance is blocked on a different approval kind than the current legacy-command step.'
                        );
                    }

                    const execution = await executeFlowLegacyCommandStep({
                        profileId: input.profileId,
                        flowInstanceId: record.instance.id,
                        stepIndex,
                        step,
                        ...(record.instance.executionContext
                            ? { executionContext: record.instance.executionContext }
                            : {}),
                        signal: controller.signal,
                    });

                    if (execution.kind === 'approval_required') {
                        return okOp(
                            await this.writeApprovalRequired({
                                profileId: input.profileId,
                                record,
                                stepIndex,
                                step,
                                approvalKind: 'tool_permission',
                                reason: execution.message,
                                permissionRequestId: execution.request.id,
                            })
                        );
                    }

                    if (execution.kind === 'cancelled') {
                        return okOp(
                            await this.markCancelled({
                                profileId: input.profileId,
                                record,
                                reason: execution.reason,
                                step,
                                stepIndex,
                            })
                        );
                    }

                    if (execution.kind === 'failed') {
                        return okOp(
                            await this.markFailed({
                                profileId: input.profileId,
                                record,
                                message: execution.message,
                                step,
                                stepIndex,
                            })
                        );
                    }

                    record = await this.writeStepCompleted({
                        profileId: input.profileId,
                        record,
                        stepIndex,
                        step,
                        nextStepIndex: stepIndex + 1,
                    });
                    continue;
                }

                if (step.kind === 'mode_run') {
                    if (isResumingApprovalStep) {
                        return errOp(
                            'invalid_input',
                            'Mode-run flow steps cannot be resumed from an approval boundary.'
                        );
                    }

                    const modeRunResult = await this.executeModeRunStep({
                        profileId: input.profileId,
                        record,
                        stepIndex,
                        step,
                        signal: controller.signal,
                    });
                    if (modeRunResult.kind === 'terminal') {
                        return okOp(modeRunResult.view);
                    }

                    record = modeRunResult.record;
                    continue;
                }

                if (isResumingApprovalStep && record.instance.awaitingApprovalKind !== 'plan_checkpoint') {
                    return errOp(
                        'invalid_input',
                        'Flow instance is blocked on a different approval kind than the current planning workflow step.'
                    );
                }

                const workflowResult = await this.executePlanningWorkflowStep({
                    profileId: input.profileId,
                    record,
                    stepIndex,
                    step,
                    resumePlanCheckpoint: isResumingApprovalStep && input.resumePlanCheckpoint === true,
                    ...(input.expectedPlanId ? { expectedPlanId: input.expectedPlanId } : {}),
                });
                if (workflowResult.isErr()) {
                    return errOp(workflowResult.error.code, workflowResult.error.message);
                }
                if (workflowResult.value.kind === 'terminal') {
                    return okOp(workflowResult.value.view);
                }

                record = workflowResult.value.record;
                continue;
            }

            return okOp(await this.writeCompleted(input.profileId, record));
        } finally {
            activeFlowExecutionRegistry.finish(input.record.instance.id);
        }
    }

    private async executeModeRunStep(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        stepIndex: number;
        step: FlowModeRunStepDefinition;
        signal: AbortSignal;
    }): Promise<StepExecutionResult> {
        return executeModeRunStep(this, input);
    }

    private async executePlanningWorkflowStep(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        stepIndex: number;
        step: FlowWorkflowStepDefinition;
        resumePlanCheckpoint: boolean;
        expectedPlanId?: EntityId<'plan'>;
    }): Promise<OperationalResult<StepExecutionResult>> {
        return executePlanningWorkflowStep(this, input);
    }

    resolvePlanningArtifact(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        step: FlowWorkflowStepDefinition;
    }): Promise<OperationalResult<PlanRecordView>> {
        return resolvePlanningArtifact(this, input);
    }

    private async writeStarted(
        profileId: string,
        record: FlowInstancePersistenceRecord
    ): Promise<FlowInstancePersistenceRecord> {
        const event = createFlowStartedLifecycleEvent({
            flowDefinitionId: record.definitionSnapshot.id,
            flowInstanceId: record.instance.id,
            triggerKind: record.definitionSnapshot.triggerKind,
            stepCount: record.definitionSnapshot.steps.length,
            ...(record.instance.retrySourceFlowInstanceId
                ? { retrySourceFlowInstanceId: record.instance.retrySourceFlowInstanceId }
                : {}),
        });

        return this.persistInstanceSnapshot(
            profileId,
            record,
            {
                ...record.instance,
                status: 'running',
                startedAt: event.at,
            },
            event
        );
    }

    async writeStepStarted(
        profileId: string,
        record: FlowInstancePersistenceRecord,
        stepIndex: number,
        step: FlowStepDefinition,
        provenance?: FlowStepProvenance
    ): Promise<FlowInstancePersistenceRecord> {
        const event = createFlowStepStartedLifecycleEvent({
            flowDefinitionId: record.definitionSnapshot.id,
            flowInstanceId: record.instance.id,
            stepIndex,
            stepId: step.id,
            stepKind: step.kind,
            ...provenance,
        });

        return this.persistInstanceSnapshot(
            profileId,
            record,
            {
                ...applyCurrentStepProvenance(clearAwaitingApprovalState(record.instance), provenance),
                status: 'running',
                currentStepIndex: stepIndex,
                startedAt: record.instance.startedAt ?? event.at,
            },
            event
        );
    }

    async writeStepCompleted(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        stepIndex: number;
        step: FlowStepDefinition;
        nextStepIndex: number;
        provenance?: FlowStepProvenance;
    }): Promise<FlowInstancePersistenceRecord> {
        const effectiveProvenance = input.provenance ?? readCurrentStepProvenance(input.record.instance);
        const event = createFlowStepCompletedLifecycleEvent({
            flowDefinitionId: input.record.definitionSnapshot.id,
            flowInstanceId: input.record.instance.id,
            stepIndex: input.stepIndex,
            stepId: input.step.id,
            stepKind: input.step.kind,
            ...effectiveProvenance,
        });

        return this.persistInstanceSnapshot(
            input.profileId,
            input.record,
            {
                ...applyCurrentStepProvenance(clearAwaitingApprovalState(input.record.instance), effectiveProvenance),
                status: 'running',
                currentStepIndex: input.nextStepIndex,
            },
            event
        );
    }

    async writeApprovalRequired(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        stepIndex: number;
        step: FlowStepDefinition;
        approvalKind: FlowApprovalKind;
        reason: string;
        permissionRequestId?: PermissionRecord['id'];
        planId?: EntityId<'plan'>;
        planRevisionId?: EntityId<'prev'>;
        requiredPlanStatus?: RequiredPlanCheckpointStatus;
        provenance?: FlowStepProvenance;
    }): Promise<FlowInstanceView> {
        const effectiveProvenance = input.provenance ?? readCurrentStepProvenance(input.record.instance);
        const event = createFlowApprovalRequiredLifecycleEvent({
            flowDefinitionId: input.record.definitionSnapshot.id,
            flowInstanceId: input.record.instance.id,
            stepIndex: input.stepIndex,
            stepId: input.step.id,
            stepKind: input.step.kind,
            reason: input.reason,
            approvalKind: input.approvalKind,
            ...(input.permissionRequestId ? { permissionRequestId: input.permissionRequestId } : {}),
            ...(input.planId ? { planId: input.planId } : {}),
            ...(input.planRevisionId ? { planRevisionId: input.planRevisionId } : {}),
            ...(input.requiredPlanStatus ? { requiredPlanStatus: input.requiredPlanStatus } : {}),
        });

        await this.persistInstanceSnapshot(
            input.profileId,
            input.record,
            {
                ...applyCurrentStepProvenance(clearAwaitingApprovalState(input.record.instance), effectiveProvenance),
                status: 'approval_required',
                currentStepIndex: input.stepIndex,
                awaitingApprovalKind: input.approvalKind,
                awaitingApprovalStepIndex: input.stepIndex,
                awaitingApprovalStepId: input.step.id,
                ...(input.approvalKind === 'tool_permission' && input.permissionRequestId
                    ? { awaitingPermissionRequestId: input.permissionRequestId }
                    : {}),
                ...(input.approvalKind === 'plan_checkpoint' && input.planId
                    ? {
                          awaitingPlanId: input.planId,
                          ...(input.planRevisionId ? { awaitingPlanRevisionId: input.planRevisionId } : {}),
                          ...(input.requiredPlanStatus ? { awaitingRequiredPlanStatus: input.requiredPlanStatus } : {}),
                      }
                    : {}),
                startedAt: input.record.instance.startedAt ?? event.at,
            },
            event
        );

        return this.requireFlowInstanceView(input.profileId, input.record.instance.id);
    }

    private async writeCompleted(profileId: string, record: FlowInstancePersistenceRecord): Promise<FlowInstanceView> {
        const event = createFlowCompletedLifecycleEvent({
            flowDefinitionId: record.definitionSnapshot.id,
            flowInstanceId: record.instance.id,
            completedStepCount: record.definitionSnapshot.steps.length,
        });

        await this.persistInstanceSnapshot(
            profileId,
            record,
            {
                ...clearAwaitingApprovalState(record.instance),
                status: 'completed',
                currentStepIndex: record.definitionSnapshot.steps.length,
                finishedAt: event.at,
            },
            event
        );

        return this.requireFlowInstanceView(profileId, record.instance.id);
    }

    async markFailed(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        message: string;
        step: FlowStepDefinition;
        stepIndex: number;
        provenance?: FlowStepProvenance;
    }): Promise<FlowInstanceView> {
        const effectiveProvenance = input.provenance ?? readCurrentStepProvenance(input.record.instance);
        const event = createFlowFailedLifecycleEvent({
            flowDefinitionId: input.record.definitionSnapshot.id,
            flowInstanceId: input.record.instance.id,
            errorMessage: input.message,
            stepIndex: input.stepIndex,
            stepId: input.step.id,
            stepKind: input.step.kind,
            ...effectiveProvenance,
        });

        await this.persistInstanceSnapshot(
            input.profileId,
            input.record,
            {
                ...applyCurrentStepProvenance(clearAwaitingApprovalState(input.record.instance), effectiveProvenance),
                status: 'failed',
                currentStepIndex: input.stepIndex,
                lastErrorMessage: input.message,
                finishedAt: event.at,
            },
            event
        );

        return this.requireFlowInstanceView(input.profileId, input.record.instance.id);
    }

    async markCancelled(input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        reason: string;
        step?: FlowStepDefinition;
        stepIndex?: number;
        provenance?: FlowStepProvenance;
    }): Promise<FlowInstanceView> {
        const effectiveProvenance = input.provenance ?? readCurrentStepProvenance(input.record.instance);
        const event = createFlowCancelledLifecycleEvent({
            flowDefinitionId: input.record.definitionSnapshot.id,
            flowInstanceId: input.record.instance.id,
            reason: input.reason,
            ...(input.step ? { stepId: input.step.id, stepKind: input.step.kind } : {}),
            ...(input.stepIndex !== undefined ? { stepIndex: input.stepIndex } : {}),
            ...effectiveProvenance,
        });

        await this.persistInstanceSnapshot(
            input.profileId,
            input.record,
            {
                ...applyCurrentStepProvenance(clearAwaitingApprovalState(input.record.instance), effectiveProvenance),
                status: 'cancelled',
                ...(input.stepIndex !== undefined ? { currentStepIndex: input.stepIndex } : {}),
                finishedAt: event.at,
            },
            event
        );

        return this.requireFlowInstanceView(input.profileId, input.record.instance.id);
    }

    private async persistInstanceSnapshot(
        profileId: string,
        record: FlowInstancePersistenceRecord,
        nextInstance: FlowInstanceRecord,
        event:
            | ReturnType<typeof createFlowStartedLifecycleEvent>
            | ReturnType<typeof createFlowStepStartedLifecycleEvent>
            | ReturnType<typeof createFlowStepCompletedLifecycleEvent>
            | ReturnType<typeof createFlowApprovalRequiredLifecycleEvent>
            | ReturnType<typeof createFlowFailedLifecycleEvent>
            | ReturnType<typeof createFlowCancelledLifecycleEvent>
            | ReturnType<typeof createFlowCompletedLifecycleEvent>
    ): Promise<FlowInstancePersistenceRecord> {
        await appendFlowLifecycleEvent(event);

        const updated = await flowStore.updateFlowInstance({
            profileId,
            flowInstanceId: record.instance.id,
            status: nextInstance.status,
            currentStepIndex: nextInstance.currentStepIndex,
            ...(nextInstance.executionContext ? { executionContext: nextInstance.executionContext } : {}),
            currentRunId: nextInstance.currentRunId ?? null,
            currentChildThreadId: nextInstance.currentChildThreadId ?? null,
            currentChildSessionId: nextInstance.currentChildSessionId ?? null,
            currentPlanId: nextInstance.currentPlanId ?? null,
            currentPlanRevisionId: nextInstance.currentPlanRevisionId ?? null,
            currentPlanPhaseId: nextInstance.currentPlanPhaseId ?? null,
            currentPlanPhaseRevisionId: nextInstance.currentPlanPhaseRevisionId ?? null,
            awaitingApprovalKind: nextInstance.awaitingApprovalKind ?? null,
            awaitingApprovalStepIndex: nextInstance.awaitingApprovalStepIndex ?? null,
            awaitingApprovalStepId: nextInstance.awaitingApprovalStepId ?? null,
            awaitingPermissionRequestId: nextInstance.awaitingPermissionRequestId ?? null,
            awaitingPlanId: nextInstance.awaitingPlanId ?? null,
            awaitingPlanRevisionId: nextInstance.awaitingPlanRevisionId ?? null,
            awaitingRequiredPlanStatus: nextInstance.awaitingRequiredPlanStatus ?? null,
            lastErrorMessage: nextInstance.lastErrorMessage ?? null,
            retrySourceFlowInstanceId: nextInstance.retrySourceFlowInstanceId ?? null,
            ...(nextInstance.startedAt ? { startedAt: nextInstance.startedAt } : {}),
            ...(nextInstance.finishedAt ? { finishedAt: nextInstance.finishedAt } : {}),
        });
        if (!updated) {
            throw new Error(`Persisted flow instance "${record.instance.id}" was not found.`);
        }

        return updated;
    }

    private async requireFlowInstanceView(profileId: string, flowInstanceId: string): Promise<FlowInstanceView> {
        const flowInstance = await flowStore.getFlowInstanceViewById(profileId, flowInstanceId);
        if (!flowInstance) {
            throw new Error(`Persisted flow instance "${flowInstanceId}" was not found.`);
        }

        return flowInstance;
    }

    private async waitForCancelledView(profileId: string, flowInstanceId: string): Promise<FlowInstanceView> {
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const flowInstance = await flowStore.getFlowInstanceViewById(profileId, flowInstanceId);
            if (flowInstance?.instance.status === 'cancelled') {
                return flowInstance;
            }
            await delay(25);
        }

        throw new Error(`Timed out while waiting for flow instance "${flowInstanceId}" to cancel.`);
    }
}

export const flowExecutionService = new FlowExecutionService();

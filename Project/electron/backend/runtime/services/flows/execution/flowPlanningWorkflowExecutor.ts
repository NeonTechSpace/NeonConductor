import { flowStore, planStore, threadStore } from '@/app/backend/persistence/stores';
import type { FlowInstancePersistenceRecord } from '@/app/backend/persistence/types';
import type { EntityId, FlowWorkflowStepDefinition, PlanRecordView } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import type {
    FlowStepProvenance,
    StepExecutionResult,
} from '@/app/backend/runtime/services/flows/execution/flowExecutionTypes';
import {
    isPlanCheckpointSatisfied,
    mapPlanErrorCodeToOperational,
    readInvalidPlanCheckpointMessage,
    readPlanCheckpointReason,
    readPlanCheckpointStatus,
    readPlanTerminalFailureMessage,
} from '@/app/backend/runtime/services/flows/execution/flowStepHelpers';
import type { FlowExecutionService } from '@/app/backend/runtime/services/flows/executionService';
import { resolvePlanningCapableModeForTab } from '@/app/backend/runtime/services/flows/planningModeResolution';
import { enterAdvancedPlanning } from '@/app/backend/runtime/services/plan/enterAdvancedPlanning';
import { startPlanFlow } from '@/app/backend/runtime/services/plan/start';
import { refreshPlanViewById } from '@/app/backend/runtime/services/plan/status';

export async function executePlanningWorkflowStep(
    host: FlowExecutionService,
    input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        stepIndex: number;
        step: FlowWorkflowStepDefinition;
        resumePlanCheckpoint: boolean;
        expectedPlanId?: EntityId<'plan'>;
    }
): Promise<OperationalResult<StepExecutionResult>> {
    if (input.step.workflowCapability !== 'planning') {
        return okOp({
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record: input.record,
                message: `Workflow capability "${input.step.workflowCapability}" is not executable in Execute Flow Slice 4.`,
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        });
    }

    const requiredPlanStatus = readPlanCheckpointStatus(input.step);
    if (
        input.record.instance.status === 'approval_required' &&
        input.record.instance.awaitingApprovalKind === 'plan_checkpoint'
    ) {
        if (!input.resumePlanCheckpoint) {
            return errOp('invalid_input', 'Planning checkpoints require an explicit flow resume request.');
        }
        if (input.expectedPlanId && input.record.instance.awaitingPlanId !== input.expectedPlanId) {
            return errOp('invalid_input', 'Flow instance is not waiting on the requested linked plan.');
        }

        const linkedPlanId = input.record.instance.awaitingPlanId ?? input.record.instance.currentPlanId;
        if (!linkedPlanId) {
            return errOp('invalid_input', 'Flow instance is missing the linked plan checkpoint state.');
        }

        const refreshedPlan = await refreshPlanViewById({
            profileId: input.profileId,
            planId: linkedPlanId,
        });
        if (!refreshedPlan.found) {
            return errOp('not_found', 'Linked plan could not be found for this flow checkpoint.');
        }

        const terminalPlanMessage = readPlanTerminalFailureMessage(refreshedPlan.plan.status);
        const provenance: FlowStepProvenance = {
            currentPlanId: refreshedPlan.plan.id,
            currentPlanRevisionId: refreshedPlan.plan.currentRevisionId,
        };

        if (terminalPlanMessage) {
            return okOp({
                kind: 'terminal',
                view: await host.markFailed({
                    profileId: input.profileId,
                    record: input.record,
                    message: terminalPlanMessage,
                    step: input.step,
                    stepIndex: input.stepIndex,
                    provenance,
                }),
            });
        }

        if (!isPlanCheckpointSatisfied(refreshedPlan.plan.status, requiredPlanStatus)) {
            return errOp('invalid_input', readInvalidPlanCheckpointMessage(requiredPlanStatus));
        }

        const resumedRecord = await flowStore.getFlowInstanceById(input.profileId, input.record.instance.id);
        if (!resumedRecord) {
            throw new Error(`Persisted flow instance "${input.record.instance.id}" was not found.`);
        }

        return okOp({
            kind: 'continue',
            record: await host.writeStepCompleted({
                profileId: input.profileId,
                record: resumedRecord,
                stepIndex: input.stepIndex,
                step: input.step,
                nextStepIndex: input.stepIndex + 1,
                provenance,
            }),
        });
    }

    const planResult = await host.resolvePlanningArtifact({
        profileId: input.profileId,
        record: input.record,
        step: input.step,
    });
    if (planResult.isErr()) {
        return okOp({
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record: input.record,
                message: planResult.error.message,
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        });
    }

    const plan = planResult.value;
    const provenance: FlowStepProvenance = {
        currentPlanId: plan.id,
        currentPlanRevisionId: plan.currentRevisionId,
    };
    const startedRecord = await host.writeStepStarted(
        input.profileId,
        input.record,
        input.stepIndex,
        input.step,
        provenance
    );

    const terminalPlanMessage = readPlanTerminalFailureMessage(plan.status);
    if (terminalPlanMessage) {
        return okOp({
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record: startedRecord,
                message: terminalPlanMessage,
                step: input.step,
                stepIndex: input.stepIndex,
                provenance,
            }),
        });
    }

    if (!isPlanCheckpointSatisfied(plan.status, requiredPlanStatus)) {
        return okOp({
            kind: 'terminal',
            view: await host.writeApprovalRequired({
                profileId: input.profileId,
                record: startedRecord,
                stepIndex: input.stepIndex,
                step: input.step,
                approvalKind: 'plan_checkpoint',
                reason: readPlanCheckpointReason(requiredPlanStatus),
                planId: plan.id,
                planRevisionId: plan.currentRevisionId,
                requiredPlanStatus,
                provenance,
            }),
        });
    }

    return okOp({
        kind: 'continue',
        record: await host.writeStepCompleted({
            profileId: input.profileId,
            record: startedRecord,
            stepIndex: input.stepIndex,
            step: input.step,
            nextStepIndex: input.stepIndex + 1,
            provenance,
        }),
    });
}

export async function resolvePlanningArtifact(
    _host: FlowExecutionService,
    input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        step: FlowWorkflowStepDefinition;
    }
): Promise<OperationalResult<PlanRecordView>> {
    const sessionId = input.record.instance.executionContext?.sessionId;
    if (!sessionId) {
        return errOp('invalid_input', 'Planning workflow steps require a session-bound execution context.');
    }

    const sessionThread = await threadStore.getBySessionId(input.profileId, sessionId);
    if (!sessionThread) {
        return errOp('not_found', 'Planning workflow step could not find the owning session thread.');
    }
    if (sessionThread.thread.topLevelTab === 'chat') {
        return errOp('invalid_input', 'Planning workflow steps require an agent or orchestrator session.');
    }

    const topLevelTab = sessionThread.thread.topLevelTab;
    const planningDepth = input.step.planningDepth ?? 'simple';
    const latestPlanRecord = await planStore.getLatestBySession(input.profileId, sessionId, topLevelTab);

    if (input.step.reuseExistingPlan !== false && latestPlanRecord) {
        const refreshed = await refreshPlanViewById({
            profileId: input.profileId,
            planId: latestPlanRecord.id,
        });
        if (!refreshed.found) {
            return errOp('not_found', 'Planning workflow step could not refresh the active plan.');
        }

        if (refreshed.plan.status === 'implementing') {
            return errOp('invalid_input', 'Planning workflow step cannot reuse a plan while implementation is active.');
        }

        if (!['implemented', 'failed', 'cancelled'].includes(refreshed.plan.status)) {
            if (planningDepth === 'advanced' && (refreshed.plan.planningDepth ?? 'simple') === 'simple') {
                const upgraded = await enterAdvancedPlanning({
                    profileId: input.profileId,
                    planId: refreshed.plan.id,
                });
                if (upgraded.isErr()) {
                    return errOp(mapPlanErrorCodeToOperational(upgraded.error.code), upgraded.error.message);
                }
                if (!upgraded.value.found) {
                    return errOp('not_found', 'Planning workflow step could not upgrade the active plan.');
                }

                return okOp(upgraded.value.plan);
            }

            return okOp(refreshed.plan);
        }
    }

    if (input.step.reuseExistingPlan === false && latestPlanRecord) {
        const refreshed = await refreshPlanViewById({
            profileId: input.profileId,
            planId: latestPlanRecord.id,
        });
        if (refreshed.found && refreshed.plan.status === 'implementing') {
            return errOp(
                'invalid_input',
                'Planning workflow step cannot start a fresh plan while implementation is active on the current plan.'
            );
        }
    }

    const planningMode = await resolvePlanningCapableModeForTab({
        profileId: input.profileId,
        topLevelTab,
        ...(input.record.instance.executionContext?.workspaceFingerprint
            ? { workspaceFingerprint: input.record.instance.executionContext.workspaceFingerprint }
            : {}),
    });
    if (!planningMode) {
        return errOp(
            'invalid_mode',
            `Planning workflow step could not resolve a planning-capable mode for "${topLevelTab}".`
        );
    }

    const startedPlan = await startPlanFlow({
        profileId: input.profileId,
        sessionId,
        topLevelTab,
        modeKey: planningMode.modeKey,
        prompt: input.step.promptMarkdown,
        planningDepth,
        ...(input.record.instance.executionContext?.workspaceFingerprint
            ? { workspaceFingerprint: input.record.instance.executionContext.workspaceFingerprint }
            : {}),
    });
    if (startedPlan.isErr()) {
        return errOp(mapPlanErrorCodeToOperational(startedPlan.error.code), startedPlan.error.message);
    }

    return okOp(startedPlan.value.plan);
}

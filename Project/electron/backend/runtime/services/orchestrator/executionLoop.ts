import type { OrchestratorStepRecord, PlanItemRecord, PlanRecord } from '@/app/backend/persistence/types';
import type { EntityId, OrchestratorStartInput } from '@/app/backend/runtime/contracts';
import { ActiveOrchestratorRunRegistry } from '@/app/backend/runtime/services/orchestrator/activeRunRegistry';
import {
    markOrchestratorCompleted,
    markOrchestratorStopped,
    markStepAborted,
    markStepCompleted,
    markStepFailed,
    markStepRunning,
    markStepStarted,
} from '@/app/backend/runtime/services/orchestrator/stepLifecycle';
import {
    abortDelegatedChildRun,
    resolveOrchestratorRootExecutionContext,
    startDelegatedChildRun,
    waitForRunTerminal,
} from '@/app/backend/runtime/services/orchestrator/stepRun';
import type { ApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';

interface StartedChildStep {
    step: OrchestratorStepRecord;
    childThreadId: EntityId<'thr'>;
    childSessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
}

function isRunCancelled(activeRuns: ActiveOrchestratorRunRegistry, orchestratorRunId: EntityId<'orch'>): boolean {
    const active = activeRuns.get(orchestratorRunId);
    return !active || active.cancelled;
}

async function abortSiblingChildren(input: {
    profileId: string;
    orchestratorRunId: EntityId<'orch'>;
    activeRuns: ActiveOrchestratorRunRegistry;
    children: StartedChildStep[];
    excludeSessionId?: EntityId<'sess'>;
}): Promise<void> {
    await Promise.all(
        input.children
            .filter((child) => child.childSessionId !== input.excludeSessionId)
            .map(async (child) => {
                input.activeRuns.unregisterChildSession(input.orchestratorRunId, child.childSessionId);
                await abortDelegatedChildRun(input.profileId, child.childSessionId);
            })
    );
}

async function startStepChild(input: {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    planItems: PlanItemRecord[];
    orchestratorRunId: EntityId<'orch'>;
    step: OrchestratorStepRecord;
    startInput: OrchestratorStartInput;
    activeRuns: ActiveOrchestratorRunRegistry;
}): Promise<{ ok: true; child: StartedChildStep } | { ok: false; reason: string }> {
    await markStepStarted({
        orchestratorRunId: input.orchestratorRunId,
        step: input.step,
    });

    const rootContext = await resolveOrchestratorRootExecutionContext({
        profileId: input.startInput.profileId,
        sessionId: input.plan.sessionId,
    });
    if (!rootContext) {
        return {
            ok: false,
            reason: 'The root orchestrator session could not be resolved.',
        };
    }

    const started = await startDelegatedChildRun({
        profileId: input.startInput.profileId,
        orchestratorRunId: input.orchestratorRunId,
        rootContext,
        plan: input.plan,
        approvedArtifact: input.approvedArtifact,
        step: input.step,
        startInput: input.startInput,
    });
    if (!started.accepted) {
        return {
            ok: false,
            reason: started.reason,
        };
    }

    input.activeRuns.registerChildSession(input.orchestratorRunId, started.started.childSessionId);
    await markStepRunning({
        orchestratorRunId: input.orchestratorRunId,
        step: input.step,
        planItems: input.planItems,
        childThreadId: started.started.childThreadId,
        childSessionId: started.started.childSessionId,
        runId: started.started.runId,
    });

    return {
        ok: true,
        child: {
            step: input.step,
            childThreadId: started.started.childThreadId,
            childSessionId: started.started.childSessionId,
            runId: started.started.runId,
        },
    };
}

async function executeDelegateStrategy(input: {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    planItems: PlanItemRecord[];
    orchestratorRunId: EntityId<'orch'>;
    steps: OrchestratorStepRecord[];
    startInput: OrchestratorStartInput;
    activeRuns: ActiveOrchestratorRunRegistry;
}): Promise<void> {
    for (const step of input.steps) {
        if (isRunCancelled(input.activeRuns, input.orchestratorRunId)) {
            await markOrchestratorStopped({
                orchestratorRunId: input.orchestratorRunId,
            });
            return;
        }

        const started = await startStepChild({
            ...input,
            step,
        });

        if (!started.ok) {
            await markStepFailed({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                errorMessage: started.reason,
                planId: input.plan.id,
            });
            return;
        }

        const terminalStatus = await waitForRunTerminal(started.child.runId);
        input.activeRuns.unregisterChildSession(input.orchestratorRunId, started.child.childSessionId);

        if (isRunCancelled(input.activeRuns, input.orchestratorRunId)) {
            return;
        }

        if (terminalStatus === 'completed') {
            await markStepCompleted({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                runId: started.child.runId,
            });
            continue;
        }

        if (terminalStatus === 'aborted') {
            await markStepAborted({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                runId: started.child.runId,
            });
            return;
        }

        await markStepFailed({
            orchestratorRunId: input.orchestratorRunId,
            step,
            planItems: input.planItems,
            runId: started.child.runId,
            errorMessage: 'Delegated child worker run ended with error.',
            planId: input.plan.id,
        });
        return;
    }

    await markOrchestratorCompleted({
        orchestratorRunId: input.orchestratorRunId,
        planId: input.plan.id,
        stepCount: input.steps.length,
    });
}

async function executeParallelStrategy(input: {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    planItems: PlanItemRecord[];
    orchestratorRunId: EntityId<'orch'>;
    steps: OrchestratorStepRecord[];
    startInput: OrchestratorStartInput;
    activeRuns: ActiveOrchestratorRunRegistry;
}): Promise<void> {
    const startedChildren: StartedChildStep[] = [];

    for (const step of input.steps) {
        if (isRunCancelled(input.activeRuns, input.orchestratorRunId)) {
            await markOrchestratorStopped({
                orchestratorRunId: input.orchestratorRunId,
            });
            return;
        }

        const started = await startStepChild({
            ...input,
            step,
        });

        if (!started.ok) {
            await abortSiblingChildren({
                profileId: input.startInput.profileId,
                orchestratorRunId: input.orchestratorRunId,
                activeRuns: input.activeRuns,
                children: startedChildren,
            });
            await markStepFailed({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                errorMessage: started.reason,
                planId: input.plan.id,
            });
            return;
        }

        startedChildren.push(started.child);
    }

    let firstTerminalFailure:
        | {
              step: OrchestratorStepRecord;
              runId: EntityId<'run'>;
              status: 'aborted' | 'error';
          }
        | undefined;

    await Promise.all(
        startedChildren.map(async (child) => {
            const terminalStatus = await waitForRunTerminal(child.runId);
            input.activeRuns.unregisterChildSession(input.orchestratorRunId, child.childSessionId);

            if (isRunCancelled(input.activeRuns, input.orchestratorRunId)) {
                return;
            }

            if (terminalStatus === 'completed') {
                await markStepCompleted({
                    orchestratorRunId: input.orchestratorRunId,
                    step: child.step,
                    planItems: input.planItems,
                    runId: child.runId,
                });
                return;
            }

            const isFirstFailure = firstTerminalFailure === undefined;
            if (isFirstFailure) {
                firstTerminalFailure = {
                    step: child.step,
                    runId: child.runId,
                    status: terminalStatus,
                };
                await abortSiblingChildren({
                    profileId: input.startInput.profileId,
                    orchestratorRunId: input.orchestratorRunId,
                    activeRuns: input.activeRuns,
                    children: startedChildren,
                    excludeSessionId: child.childSessionId,
                });
            }

            if (terminalStatus === 'aborted') {
                await markStepAborted({
                    orchestratorRunId: input.orchestratorRunId,
                    step: child.step,
                    planItems: input.planItems,
                    runId: child.runId,
                    updateOrchestratorRun: isFirstFailure,
                });
                return;
            }

            await markStepFailed({
                orchestratorRunId: input.orchestratorRunId,
                step: child.step,
                planItems: input.planItems,
                runId: child.runId,
                errorMessage: 'Delegated child worker run ended with error.',
                planId: input.plan.id,
                updateOrchestratorRun: isFirstFailure,
                markPlanFailed: isFirstFailure,
            });
        })
    );

    if (firstTerminalFailure) {
        return;
    }

    await markOrchestratorCompleted({
        orchestratorRunId: input.orchestratorRunId,
        planId: input.plan.id,
        stepCount: input.steps.length,
    });
}

export async function executeOrchestratorSteps(input: {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    planItems: PlanItemRecord[];
    orchestratorRunId: EntityId<'orch'>;
    steps: OrchestratorStepRecord[];
    startInput: OrchestratorStartInput;
    activeRuns: ActiveOrchestratorRunRegistry;
    executionStrategy: 'delegate' | 'parallel';
}): Promise<void> {
    if (input.executionStrategy === 'parallel') {
        await executeParallelStrategy(input);
        return;
    }

    await executeDelegateStrategy(input);
}

import {
    messageStore,
    orchestratorLazyStore,
    orchestratorStore,
    orchestratorSwarmStore,
    planStore,
} from '@/app/backend/persistence/stores';
import type {
    OrchestratorStepRecord,
    OrchestratorSwarmLaneRecord,
    PlanItemRecord,
    PlanRecord,
} from '@/app/backend/persistence/types';
import type { EntityId, OrchestratorStartInput, OrchestratorSwarmRole } from '@/app/backend/runtime/contracts';
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
    buildSwarmChildThreadTitle,
    buildSwarmStepPrompt,
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

function readTextPayload(payload: Record<string, unknown>): string {
    const text = payload['text'];
    return typeof text === 'string' ? text : '';
}

async function readRunAssistantSummary(input: {
    profileId: string;
    childSessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
}): Promise<string> {
    const [messages, parts] = await Promise.all([
        messageStore.listMessagesBySession(input.profileId, input.childSessionId, input.runId),
        messageStore.listPartsBySession(input.profileId, input.childSessionId, input.runId),
    ]);
    const assistantMessageIds = new Set(
        messages.filter((message) => message.role === 'assistant').map((message) => message.id)
    );
    const text = parts
        .filter((part) => assistantMessageIds.has(part.messageId) && part.partType === 'text')
        .map((part) => readTextPayload(part.payload))
        .join('\n')
        .trim();

    return text.length > 0 ? text : 'The child lane completed without a persisted assistant text summary.';
}

function formatSharedContext(entries: Array<{ entryKind: string; contentMarkdown: string }>): string {
    return entries
        .map((entry, index) => [`### Context ${String(index + 1)}: ${entry.entryKind}`, entry.contentMarkdown].join('\n\n'))
        .join('\n\n');
}

async function readSharedSwarmContext(orchestratorRunId: EntityId<'orch'>): Promise<string> {
    return formatSharedContext(await orchestratorSwarmStore.listContextEntries(orchestratorRunId));
}

async function createAndStartSwarmLane(input: {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    orchestratorRunId: EntityId<'orch'>;
    step?: OrchestratorStepRecord;
    role: OrchestratorSwarmRole;
    sequence: number;
    startInput: OrchestratorStartInput;
    activeRuns: ActiveOrchestratorRunRegistry;
}): Promise<{ ok: true; lane: OrchestratorSwarmLaneRecord } | { ok: false; lane: OrchestratorSwarmLaneRecord; reason: string }> {
    const sharedContextMarkdown = await readSharedSwarmContext(input.orchestratorRunId);
    const prompt = buildSwarmStepPrompt({
        approvedArtifact: input.approvedArtifact,
        ...(input.step ? { step: input.step } : {}),
        role: input.role,
        sharedContextMarkdown,
    });
    const lane = await orchestratorSwarmStore.createLane({
        orchestratorRunId: input.orchestratorRunId,
        ...(input.step ? { stepId: input.step.id } : {}),
        sequence: input.sequence,
        role: input.role,
        promptMarkdown: prompt,
    });

    const rootContext = await resolveOrchestratorRootExecutionContext({
        profileId: input.startInput.profileId,
        sessionId: input.plan.sessionId,
    });
    if (!rootContext) {
        const failedLane = await orchestratorSwarmStore.updateLane(lane.id, {
            status: 'failed',
            errorMessage: 'The root orchestrator session could not be resolved.',
        });
        return { ok: false, lane: failedLane, reason: 'The root orchestrator session could not be resolved.' };
    }

    const started = await startDelegatedChildRun({
        profileId: input.startInput.profileId,
        orchestratorRunId: input.orchestratorRunId,
        rootContext,
        plan: input.plan,
        approvedArtifact: input.approvedArtifact,
        ...(input.step ? { step: input.step } : {}),
        startInput: input.startInput,
        prompt,
        childTitle: buildSwarmChildThreadTitle({ ...(input.step ? { step: input.step } : {}), role: input.role }),
        role: input.role,
    });
    if (!started.accepted) {
        const failedLane = await orchestratorSwarmStore.updateLane(lane.id, {
            status: 'failed',
            errorMessage: started.reason,
        });
        return { ok: false, lane: failedLane, reason: started.reason };
    }

    input.activeRuns.registerChildSession(input.orchestratorRunId, started.started.childSessionId);
    const runningLane = await orchestratorSwarmStore.updateLane(lane.id, {
        status: 'running',
        childThreadId: started.started.childThreadId,
        childSessionId: started.started.childSessionId,
        activeRunId: started.started.runId,
    });

    return { ok: true, lane: runningLane };
}

async function waitForSwarmLane(input: {
    profileId: string;
    orchestratorRunId: EntityId<'orch'>;
    lane: OrchestratorSwarmLaneRecord;
    activeRuns: ActiveOrchestratorRunRegistry;
}): Promise<{ ok: true; lane: OrchestratorSwarmLaneRecord; summaryMarkdown: string } | { ok: false; lane: OrchestratorSwarmLaneRecord; reason: string; aborted: boolean }> {
    if (!input.lane.activeRunId || !input.lane.childSessionId) {
        const failedLane = await orchestratorSwarmStore.updateLane(input.lane.id, {
            status: 'failed',
            errorMessage: 'Swarm lane has no active child run.',
        });
        return { ok: false, lane: failedLane, reason: 'Swarm lane has no active child run.', aborted: false };
    }

    const terminalStatus = await waitForRunTerminal(input.lane.activeRunId);
    input.activeRuns.unregisterChildSession(input.orchestratorRunId, input.lane.childSessionId);

    if (terminalStatus === 'completed') {
        const summaryMarkdown = await readRunAssistantSummary({
            profileId: input.profileId,
            childSessionId: input.lane.childSessionId,
            runId: input.lane.activeRunId,
        });
        const completedLane = await orchestratorSwarmStore.updateLane(input.lane.id, {
            status: 'completed',
            activeRunId: null,
            runId: input.lane.activeRunId,
            resultSummaryMarkdown: summaryMarkdown,
            errorMessage: null,
        });
        await orchestratorSwarmStore.appendContextEntry({
            orchestratorRunId: input.orchestratorRunId,
            sourceLaneId: completedLane.id,
            entryKind: completedLane.role === 'synthesizer' ? 'synthesis' : 'lane_result',
            contentMarkdown: `## ${completedLane.role} result\n\n${summaryMarkdown}`,
        });
        return { ok: true, lane: completedLane, summaryMarkdown };
    }

    const aborted = terminalStatus === 'aborted';
    const failedLane = await orchestratorSwarmStore.updateLane(input.lane.id, {
        status: aborted ? 'aborted' : 'failed',
        activeRunId: null,
        runId: input.lane.activeRunId,
        errorMessage: aborted ? 'Swarm child lane was aborted.' : 'Swarm child lane ended with error.',
    });

    return {
        ok: false,
        lane: failedLane,
        reason: aborted ? 'Swarm child lane was aborted.' : 'Swarm child lane ended with error.',
        aborted,
    };
}

async function executeSequentialStrategy(input: {
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
            errorMessage: 'Sequential child worker run ended with error.',
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

async function failSwarmStep(input: {
    orchestratorRunId: EntityId<'orch'>;
    step: OrchestratorStepRecord;
    planItems: PlanItemRecord[];
    planId: PlanRecord['id'];
    reason: string;
    runId?: EntityId<'run'>;
    aborted?: boolean;
}): Promise<void> {
    if (input.aborted && input.runId) {
        await markStepAborted({
            orchestratorRunId: input.orchestratorRunId,
            step: input.step,
            planItems: input.planItems,
            runId: input.runId,
        });
        return;
    }

    await markStepFailed({
        orchestratorRunId: input.orchestratorRunId,
        step: input.step,
        planItems: input.planItems,
        ...(input.runId ? { runId: input.runId } : {}),
        errorMessage: input.reason,
        planId: input.planId,
    });
}

async function executeSwarmStrategy(input: {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    planItems: PlanItemRecord[];
    orchestratorRunId: EntityId<'orch'>;
    steps: OrchestratorStepRecord[];
    startInput: OrchestratorStartInput;
    activeRuns: ActiveOrchestratorRunRegistry;
}): Promise<void> {
    let laneSequence = 1;

    for (const step of input.steps) {
        if (isRunCancelled(input.activeRuns, input.orchestratorRunId)) {
            await markOrchestratorStopped({
                orchestratorRunId: input.orchestratorRunId,
            });
            return;
        }

        await markStepStarted({
            orchestratorRunId: input.orchestratorRunId,
            step,
        });

        const explorer = await createAndStartSwarmLane({
            ...input,
            step,
            role: 'explorer',
            sequence: laneSequence,
        });
        laneSequence += 1;
        if (!explorer.ok) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: explorer.reason,
            });
            return;
        }
        if (!explorer.lane.childThreadId || !explorer.lane.childSessionId || !explorer.lane.activeRunId) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: 'Swarm explorer lane started without complete child-run projection.',
            });
            return;
        }
        await markStepRunning({
            orchestratorRunId: input.orchestratorRunId,
            step,
            planItems: input.planItems,
            childThreadId: explorer.lane.childThreadId,
            childSessionId: explorer.lane.childSessionId,
            runId: explorer.lane.activeRunId,
        });

        const explorerTerminal = await waitForSwarmLane({
            profileId: input.startInput.profileId,
            orchestratorRunId: input.orchestratorRunId,
            lane: explorer.lane,
            activeRuns: input.activeRuns,
        });
        if (!explorerTerminal.ok) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: explorerTerminal.reason,
                ...(explorerTerminal.lane.runId ? { runId: explorerTerminal.lane.runId } : {}),
                aborted: explorerTerminal.aborted,
            });
            return;
        }

        const implementer = await createAndStartSwarmLane({
            ...input,
            step,
            role: 'implementer',
            sequence: laneSequence,
        });
        laneSequence += 1;
        if (!implementer.ok) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: implementer.reason,
            });
            return;
        }
        if (!implementer.lane.childThreadId || !implementer.lane.childSessionId || !implementer.lane.activeRunId) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: 'Swarm implementer lane started without complete child-run projection.',
            });
            return;
        }
        await markStepRunning({
            orchestratorRunId: input.orchestratorRunId,
            step,
            planItems: input.planItems,
            childThreadId: implementer.lane.childThreadId,
            childSessionId: implementer.lane.childSessionId,
            runId: implementer.lane.activeRunId,
        });

        const implementerTerminal = await waitForSwarmLane({
            profileId: input.startInput.profileId,
            orchestratorRunId: input.orchestratorRunId,
            lane: implementer.lane,
            activeRuns: input.activeRuns,
        });
        if (!implementerTerminal.ok) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: implementerTerminal.reason,
                ...(implementerTerminal.lane.runId ? { runId: implementerTerminal.lane.runId } : {}),
                aborted: implementerTerminal.aborted,
            });
            return;
        }

        const reviewStart = await Promise.all([
            createAndStartSwarmLane({
                ...input,
                step,
                role: 'reviewer',
                sequence: laneSequence,
            }),
            createAndStartSwarmLane({
                ...input,
                step,
                role: 'verifier',
                sequence: laneSequence + 1,
            }),
        ]);
        laneSequence += 2;
        const failedStart = reviewStart.find((lane) => !lane.ok);
        if (failedStart && !failedStart.ok) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: failedStart.reason,
            });
            return;
        }

        const reviewer = reviewStart[0];
        const verifier = reviewStart[1];
        if (!reviewer.ok || !verifier.ok) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: 'Swarm review lanes failed to start.',
            });
            return;
        }

        const reviewTerminals = [
            await waitForSwarmLane({
                profileId: input.startInput.profileId,
                orchestratorRunId: input.orchestratorRunId,
                lane: reviewer.lane,
                activeRuns: input.activeRuns,
            }),
            await waitForSwarmLane({
                profileId: input.startInput.profileId,
                orchestratorRunId: input.orchestratorRunId,
                lane: verifier.lane,
                activeRuns: input.activeRuns,
            }),
        ];
        const failedReview = reviewTerminals.find((lane) => !lane.ok);
        if (failedReview && !failedReview.ok) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: failedReview.reason,
                ...(failedReview.lane.runId ? { runId: failedReview.lane.runId } : {}),
                aborted: failedReview.aborted,
            });
            return;
        }

        const implementerRunId = implementerTerminal.lane.runId;
        if (!implementerRunId) {
            await failSwarmStep({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                planId: input.plan.id,
                reason: 'Swarm implementer completed without a terminal run id.',
            });
            return;
        }

        await markStepCompleted({
            orchestratorRunId: input.orchestratorRunId,
            step,
            planItems: input.planItems,
            runId: implementerRunId,
        });
    }

    const finalStep = input.steps[input.steps.length - 1];
    if (!finalStep) {
        await markOrchestratorCompleted({
            orchestratorRunId: input.orchestratorRunId,
            planId: input.plan.id,
            stepCount: 0,
        });
        return;
    }

    const synthesizer = await createAndStartSwarmLane({
        ...input,
        role: 'synthesizer',
        sequence: laneSequence,
    });
    if (!synthesizer.ok) {
        await markStepFailed({
            orchestratorRunId: input.orchestratorRunId,
            step: finalStep,
            planItems: input.planItems,
            errorMessage: `Swarm synthesis failed to start: ${synthesizer.reason}`,
            planId: input.plan.id,
        });
        return;
    }

    const synthesisTerminal = await waitForSwarmLane({
        profileId: input.startInput.profileId,
        orchestratorRunId: input.orchestratorRunId,
        lane: synthesizer.lane,
        activeRuns: input.activeRuns,
    });
    if (!synthesisTerminal.ok) {
        await markStepFailed({
            orchestratorRunId: input.orchestratorRunId,
            step: finalStep,
            planItems: input.planItems,
            ...(synthesisTerminal.lane.runId ? { runId: synthesisTerminal.lane.runId } : {}),
            errorMessage: `Swarm synthesis failed: ${synthesisTerminal.reason}`,
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

function lazyTitleFromStep(step: OrchestratorStepRecord): string {
    const compact = step.description
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(' ');
    return compact.length <= 96 ? compact : `${compact.slice(0, 93).trimEnd()}...`;
}

function buildLazyWalkthrough(input: {
    objectiveMarkdown: string;
    tasks: Array<{ title: string; status: string }>;
    synthesisMarkdown: string;
}): string {
    const taskLines = input.tasks.map((task) => `- ${task.title}: ${task.status}`).join('\n');
    return [
        '# Lazy Orchestrator Walkthrough',
        '',
        '## Objective',
        input.objectiveMarkdown,
        '',
        '## Task Tree',
        taskLines.length > 0 ? taskLines : '- No task nodes were created.',
        '',
        '## Final Synthesis',
        input.synthesisMarkdown,
    ].join('\n');
}

async function failLazyRun(input: {
    orchestratorRunId: EntityId<'orch'>;
    planId: PlanRecord['id'];
    phaseId?: EntityId<'lphase'>;
    taskId?: EntityId<'ltask'>;
    reason: string;
    aborted?: boolean;
}): Promise<void> {
    if (input.phaseId) {
        await orchestratorLazyStore.updateExecutionPhase(input.phaseId, {
            status: input.aborted ? 'aborted' : 'failed',
            errorMessage: input.reason,
        });
    }
    if (input.taskId) {
        await orchestratorLazyStore.updateTask(input.taskId, {
            status: input.aborted ? 'aborted' : 'failed',
            errorMessage: input.reason,
        });
    }
    await orchestratorLazyStore.markObjectiveStatus(input.orchestratorRunId, input.aborted ? 'aborted' : 'failed');
    await orchestratorStore.setRunStatus(input.orchestratorRunId, {
        status: input.aborted ? 'aborted' : 'failed',
        errorMessage: input.reason,
    });
    if (!input.aborted) {
        await planStore.markFailed(input.planId);
    }
}

async function executeLazyStrategy(input: {
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    planItems: PlanItemRecord[];
    orchestratorRunId: EntityId<'orch'>;
    steps: OrchestratorStepRecord[];
    startInput: OrchestratorStartInput;
    activeRuns: ActiveOrchestratorRunRegistry;
}): Promise<void> {
    const objective = await orchestratorLazyStore.getObjectiveByRunId(input.orchestratorRunId);
    if (!objective) {
        await failLazyRun({
            orchestratorRunId: input.orchestratorRunId,
            planId: input.plan.id,
            reason: 'Lazy run started without a durable objective packet.',
        });
        return;
    }

    const orientationPhase = await orchestratorLazyStore.createExecutionPhase({
        orchestratorRunId: input.orchestratorRunId,
        sequence: 1,
        phaseKind: 'orientation',
    });
    const orientation = await createAndStartSwarmLane({
        ...input,
        role: 'explorer',
        sequence: 1,
    });
    if (!orientation.ok) {
        await failLazyRun({
            orchestratorRunId: input.orchestratorRunId,
            planId: input.plan.id,
            phaseId: orientationPhase.id,
            reason: orientation.reason,
        });
        return;
    }
    await orchestratorLazyStore.updateExecutionPhase(orientationPhase.id, {
        status: 'running',
        ...(orientation.lane.activeRunId ? { childRunId: orientation.lane.activeRunId } : {}),
    });
    const orientationTerminal = await waitForSwarmLane({
        profileId: input.startInput.profileId,
        orchestratorRunId: input.orchestratorRunId,
        lane: orientation.lane,
        activeRuns: input.activeRuns,
    });
    if (!orientationTerminal.ok) {
        await failLazyRun({
            orchestratorRunId: input.orchestratorRunId,
            planId: input.plan.id,
            phaseId: orientationPhase.id,
            reason: orientationTerminal.reason,
            aborted: orientationTerminal.aborted,
        });
        return;
    }
    await orchestratorLazyStore.updateExecutionPhase(orientationPhase.id, {
        status: 'completed',
        ...(orientationTerminal.lane.runId ? { childRunId: orientationTerminal.lane.runId } : {}),
        summaryMarkdown: orientationTerminal.summaryMarkdown,
    });
    await orchestratorLazyStore.createArtifact({
        orchestratorRunId: input.orchestratorRunId,
        kind: 'orientation_notes',
        title: 'Lazy orientation evidence',
        contentMarkdown: orientationTerminal.summaryMarkdown,
        ...(orientationTerminal.lane.runId ? { sourceRunId: orientationTerminal.lane.runId } : {}),
    });

    const planningPhase = await orchestratorLazyStore.createExecutionPhase({
        orchestratorRunId: input.orchestratorRunId,
        sequence: 2,
        phaseKind: 'planning',
    });
    await orchestratorLazyStore.updateExecutionPhase(planningPhase.id, {
        status: 'running',
    });
    const tasks = [];
    for (const [index, step] of input.steps.entries()) {
        const task = await orchestratorLazyStore.createTask({
            orchestratorRunId: input.orchestratorRunId,
            stepId: step.id,
            sequence: index + 1,
            title: lazyTitleFromStep(step),
            descriptionMarkdown: step.description,
            executionKind: 'sequential',
            verificationMarkdown: 'Verify the delegated child run result and preserve receipts.',
        });
        tasks.push(task);
    }
    await orchestratorLazyStore.createDecision({
        orchestratorRunId: input.orchestratorRunId,
        title: 'Lazy execution route',
        decisionMarkdown: 'Execute the objective through NeonConductor delegated child lanes.',
        rationaleMarkdown:
            'Lazy preserves the existing run pipeline, permission model, sandbox posture, receipts, and child lane ownership.',
    });
    await orchestratorLazyStore.createPackageAssessment({
        orchestratorRunId: input.orchestratorRunId,
        packageName: 'new dependencies',
        assessmentMarkdown:
            objective.packagePolicy === 'avoid_new'
                ? 'Lazy package policy avoids new dependencies unless the operator changes the objective constraints.'
                : 'Lazy package policy requires explicit approval before package installation or dependency mutation.',
        status: objective.packagePolicy === 'avoid_new' ? 'not_needed' : 'needs_approval',
    });
    await orchestratorLazyStore.createArtifact({
        orchestratorRunId: input.orchestratorRunId,
        kind: 'planning_notes',
        title: 'Lazy task tree',
        contentMarkdown: tasks.map((task) => `- ${task.title}`).join('\n'),
    });
    await orchestratorLazyStore.updateExecutionPhase(planningPhase.id, {
        status: 'completed',
        summaryMarkdown: `Created ${String(tasks.length)} Lazy task node(s).`,
    });

    for (const task of tasks) {
        if (isRunCancelled(input.activeRuns, input.orchestratorRunId)) {
            await failLazyRun({
                orchestratorRunId: input.orchestratorRunId,
                planId: input.plan.id,
                taskId: task.id,
                reason: 'Lazy run was aborted.',
                aborted: true,
            });
            return;
        }
        const step = input.steps.find((candidate) => candidate.id === task.stepId);
        if (!step) {
            await failLazyRun({
                orchestratorRunId: input.orchestratorRunId,
                planId: input.plan.id,
                taskId: task.id,
                reason: 'Lazy task did not resolve to an orchestrator step.',
            });
            return;
        }
        const executionPhase = await orchestratorLazyStore.createExecutionPhase({
            orchestratorRunId: input.orchestratorRunId,
            taskId: task.id,
            sequence: task.sequence + 2,
            phaseKind: 'execution',
            executionKind: task.executionKind,
        });
        await orchestratorLazyStore.updateTask(task.id, { status: 'running' });
        await orchestratorLazyStore.updateExecutionPhase(executionPhase.id, { status: 'running' });
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
            await failLazyRun({
                orchestratorRunId: input.orchestratorRunId,
                planId: input.plan.id,
                phaseId: executionPhase.id,
                taskId: task.id,
                reason: started.reason,
            });
            return;
        }
        await orchestratorLazyStore.updateExecutionPhase(executionPhase.id, {
            childRunId: started.child.runId,
        });
        const terminalStatus = await waitForRunTerminal(started.child.runId);
        input.activeRuns.unregisterChildSession(input.orchestratorRunId, started.child.childSessionId);
        if (terminalStatus === 'completed') {
            await markStepCompleted({
                orchestratorRunId: input.orchestratorRunId,
                step,
                planItems: input.planItems,
                runId: started.child.runId,
            });
            await orchestratorLazyStore.updateTask(task.id, { status: 'completed' });
            await orchestratorLazyStore.updateExecutionPhase(executionPhase.id, {
                status: 'completed',
                summaryMarkdown: 'Lazy delegated child lane completed.',
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
            await failLazyRun({
                orchestratorRunId: input.orchestratorRunId,
                planId: input.plan.id,
                phaseId: executionPhase.id,
                taskId: task.id,
                reason: 'Lazy delegated child lane was aborted.',
                aborted: true,
            });
            return;
        }
        await markStepFailed({
            orchestratorRunId: input.orchestratorRunId,
            step,
            planItems: input.planItems,
            runId: started.child.runId,
            errorMessage: 'Lazy delegated child lane ended with error.',
            planId: input.plan.id,
        });
        await failLazyRun({
            orchestratorRunId: input.orchestratorRunId,
            planId: input.plan.id,
            phaseId: executionPhase.id,
            taskId: task.id,
            reason: 'Lazy delegated child lane ended with error.',
        });
        return;
    }

    const synthesisPhase = await orchestratorLazyStore.createExecutionPhase({
        orchestratorRunId: input.orchestratorRunId,
        sequence: tasks.length + 3,
        phaseKind: 'synthesis',
    });
    const synthesizer = await createAndStartSwarmLane({
        ...input,
        role: 'synthesizer',
        sequence: tasks.length + 2,
    });
    if (!synthesizer.ok) {
        await failLazyRun({
            orchestratorRunId: input.orchestratorRunId,
            planId: input.plan.id,
            phaseId: synthesisPhase.id,
            reason: synthesizer.reason,
        });
        return;
    }
    await orchestratorLazyStore.updateExecutionPhase(synthesisPhase.id, {
        status: 'running',
        ...(synthesizer.lane.activeRunId ? { childRunId: synthesizer.lane.activeRunId } : {}),
    });
    const synthesisTerminal = await waitForSwarmLane({
        profileId: input.startInput.profileId,
        orchestratorRunId: input.orchestratorRunId,
        lane: synthesizer.lane,
        activeRuns: input.activeRuns,
    });
    if (!synthesisTerminal.ok) {
        await failLazyRun({
            orchestratorRunId: input.orchestratorRunId,
            planId: input.plan.id,
            phaseId: synthesisPhase.id,
            reason: synthesisTerminal.reason,
            aborted: synthesisTerminal.aborted,
        });
        return;
    }
    await orchestratorLazyStore.updateExecutionPhase(synthesisPhase.id, {
        status: 'completed',
        ...(synthesisTerminal.lane.runId ? { childRunId: synthesisTerminal.lane.runId } : {}),
        summaryMarkdown: synthesisTerminal.summaryMarkdown,
    });
    await orchestratorLazyStore.createWalkthrough({
        orchestratorRunId: input.orchestratorRunId,
        contentMarkdown: buildLazyWalkthrough({
            objectiveMarkdown: objective.objectiveMarkdown,
            tasks: tasks.map((task) => ({ title: task.title, status: 'completed' })),
            synthesisMarkdown: synthesisTerminal.summaryMarkdown,
        }),
        validationSummaryMarkdown: 'Lazy execution completed through delegated child lanes and synthesis.',
        riskMarkdown: 'Review receipts and child lane outputs before relying on the result.',
    });
    await orchestratorLazyStore.markObjectiveStatus(input.orchestratorRunId, 'completed');
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
    executionStrategy: 'sequential' | 'parallel' | 'swarm' | 'lazy';
}): Promise<void> {
    if (input.executionStrategy === 'lazy') {
        await executeLazyStrategy(input);
        return;
    }

    if (input.executionStrategy === 'swarm') {
        await executeSwarmStrategy(input);
        return;
    }

    if (input.executionStrategy === 'parallel') {
        await executeParallelStrategy(input);
        return;
    }

    await executeSequentialStrategy(input);
}

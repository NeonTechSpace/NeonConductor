import { useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { PlanningDepthToggle } from '@/web/components/conversation/panels/modeExecutionPanelAdvancedPlanning';
import { PlanArtifactView, PlanEditView } from '@/web/components/conversation/panels/modeExecutionPanelSections';
import {
    resolveModeExecutionDraftState,
    resolveModeExecutionOrchestratorPanelState,
    resolveModeExecutionPlanArtifactState,
    resolveModeExecutionPlanPhaseState,
    resolveModeExecutionPlanPanelMode,
    resolveModeExecutionPlanResearchArtifactState,
    resolveModeExecutionPhaseDraftState,
    resolveModeExecutionPhasePanelMode,
    resolveModeExecutionPhaseVerificationDraftState,
    resolveModeExecutionResearchComposerState,
    type ModeExecutionDraftState,
    type ModeExecutionOrchestratorPanelState,
    type ModeExecutionPhaseDraftState,
    type ModeExecutionPhasePanelModeState,
    type ModeExecutionPhaseVerificationDraftState,
    type ModeExecutionPlanPanelModeState,
    type ModeExecutionPlanResearchComposerState,
    type ModeExecutionPlanView,
} from '@/web/components/conversation/panels/modeExecutionPanelState';
import type { ConversationPlanActionController } from '@/web/components/conversation/shell/composition/planImplementationController';
import type { PlanningDepth } from '@/web/components/conversation/shell/planningDepth';
import { Button } from '@/web/components/ui/button';

import type { EntityId, OrchestratorExecutionStrategy, TopLevelTab } from '@/shared/contracts';

type PlanView = ModeExecutionPlanView;

type OrchestratorView = Parameters<typeof resolveModeExecutionOrchestratorPanelState>[0]['orchestratorView'];

function readStrategyDescription(orchestratorPanelState: ModeExecutionOrchestratorPanelState): string {
    if (orchestratorPanelState.activeExecutionStrategy === 'parallel') {
        return `${String(orchestratorPanelState.runningStepCount)} child lane${orchestratorPanelState.runningStepCount === 1 ? '' : 's'} running. A child failure aborts sibling workers and fails the root run.`;
    }

    if (orchestratorPanelState.activeExecutionStrategy === 'swarm') {
        return 'The conductor runs role-aware child lanes with shared run-scoped context, then requires final synthesis before completion.';
    }

    if (orchestratorPanelState.activeExecutionStrategy === 'lazy') {
        return 'The conductor orients on the objective, builds a durable task tree, executes through child lanes, and produces a final walkthrough.';
    }

    return 'The root conductor starts one child worker lane at a time. A child failure stops the strategy immediately.';
}

function readStrategyLabel(orchestratorPanelState: ModeExecutionOrchestratorPanelState): string {
    if (orchestratorPanelState.activeExecutionStrategy === 'sequential') {
        return 'sequential';
    }

    return orchestratorPanelState.activeExecutionStrategy;
}

export interface ModeExecutionPanelProps {
    topLevelTab: TopLevelTab;
    showPlanSurface: boolean;
    showOrchestratorSurface: boolean;
    planningDepthSelection: PlanningDepth;
    activePlan?: PlanView;
    isLoadingPlan: boolean;
    orchestratorView?: OrchestratorView;
    actionController: ConversationPlanActionController;
    selectedExecutionStrategy: OrchestratorExecutionStrategy;
    canConfigureExecutionStrategy: boolean;
    onExecutionStrategyChange: (executionStrategy: OrchestratorExecutionStrategy) => void;
    onPlanningDepthSelectionChange: (nextPlanningDepth: PlanningDepth) => void;
    onSelectChildThread?: (threadId: EntityId<'thr'>) => void;
    onCreateVariant?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onActivateVariant?: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
    onResumeFromRevision?: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onViewFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
    onResolveFollowUp?: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
}

function renderOrchestratorPanel(
    orchestratorPanelState: ModeExecutionOrchestratorPanelState | undefined,
    input: {
        isOrchestratorMutating: boolean;
        onAbortOrchestrator: ConversationPlanActionController['onAbortOrchestrator'];
        onSelectChildThread?: (threadId: EntityId<'thr'>) => void;
    }
) {
    if (!orchestratorPanelState) {
        return null;
    }

    return (
        <div className='mt-3 space-y-2'>
            <div className='flex items-center justify-between'>
                <p className='text-sm font-semibold'>Orchestrator Run</p>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isOrchestratorMutating || !orchestratorPanelState.canAbortOrchestrator}
                    onClick={() => {
                        input.onAbortOrchestrator(orchestratorPanelState.runId);
                    }}>
                    Abort
                </Button>
            </div>
            <p className='text-xs'>
                Status: <span className='font-medium'>{orchestratorPanelState.runStatus}</span>
            </p>
            <p className='text-xs'>
                Strategy: <span className='font-medium'>{readStrategyLabel(orchestratorPanelState)}</span>
            </p>
            <p className='text-muted-foreground text-xs'>{readStrategyDescription(orchestratorPanelState)}</p>
            {orchestratorPanelState.swarmLanes.length > 0 ? (
                <div className='border-border/70 bg-background/80 space-y-2 rounded border px-3 py-2 text-xs'>
                    <p className='font-medium'>Swarm lanes</p>
                    <div className='space-y-1'>
                        {orchestratorPanelState.swarmLanes.map((lane) => (
                            <div key={lane.id} className='flex flex-wrap items-center justify-between gap-2'>
                                <span>
                                    {String(lane.sequence)}. {lane.role} · {lane.status}
                                </span>
                                {lane.canOpenWorkerLane ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='ghost'
                                        onClick={() => {
                                            if (lane.childThreadId) {
                                                input.onSelectChildThread?.(lane.childThreadId);
                                            }
                                        }}>
                                        Open lane
                                    </Button>
                                ) : null}
                                {lane.errorMessage ? (
                                    <span className='text-destructive w-full'>{lane.errorMessage}</span>
                                ) : null}
                            </div>
                        ))}
                    </div>
                    {orchestratorPanelState.synthesisLane ? (
                        <p className='text-muted-foreground text-[11px]'>
                            Synthesis: {orchestratorPanelState.synthesisLane.status}
                        </p>
                    ) : null}
                </div>
            ) : null}
            {orchestratorPanelState.lazy ? (
                <div className='border-border/70 bg-background/80 space-y-2 rounded border px-3 py-2 text-xs'>
                    <p className='font-medium'>Lazy objective</p>
                    {orchestratorPanelState.lazy.objective ? (
                        <div className='space-y-1'>
                            <p>
                                Status: <span className='font-medium'>{orchestratorPanelState.lazy.objective.status}</span>
                            </p>
                            <MarkdownContent
                                markdown={orchestratorPanelState.lazy.objective.objectiveMarkdown}
                                className='space-y-2'
                            />
                            <p className='text-muted-foreground text-[11px]'>
                                Research {orchestratorPanelState.lazy.objective.researchDepth} · package policy{' '}
                                {orchestratorPanelState.lazy.objective.packagePolicy}
                            </p>
                        </div>
                    ) : null}
                    {orchestratorPanelState.lazy.executionPhases.length > 0 ? (
                        <div className='space-y-1'>
                            <p className='font-medium'>Phases</p>
                            {orchestratorPanelState.lazy.executionPhases.map((phase) => (
                                <p key={phase.id} className='text-muted-foreground'>
                                    {String(phase.sequence)}. {phase.phaseKind} · {phase.status}
                                </p>
                            ))}
                        </div>
                    ) : null}
                    {orchestratorPanelState.lazy.taskTree.length > 0 ? (
                        <div className='space-y-1'>
                            <p className='font-medium'>Task tree</p>
                            {orchestratorPanelState.lazy.taskTree.map((task) => (
                                <p key={task.id}>
                                    {String(task.sequence)}. {task.title} · {task.status}
                                </p>
                            ))}
                        </div>
                    ) : null}
                    <p className='text-muted-foreground text-[11px]'>
                        {String(orchestratorPanelState.lazy.techDecisionCount)} decisions ·{' '}
                        {String(orchestratorPanelState.lazy.packageAssessmentCount)} package assessments ·{' '}
                        {String(orchestratorPanelState.lazy.workingArtifactCount)} artifacts
                    </p>
                    {orchestratorPanelState.lazy.checkpoints.some((checkpoint) => checkpoint.status === 'pending') ? (
                        <div className='space-y-1'>
                            <p className='font-medium'>Pending checkpoints</p>
                            {orchestratorPanelState.lazy.checkpoints
                                .filter((checkpoint) => checkpoint.status === 'pending')
                                .map((checkpoint) => (
                                    <p key={checkpoint.id} className='text-amber-700'>
                                        {checkpoint.kind}: {checkpoint.promptMarkdown}
                                    </p>
                                ))}
                        </div>
                    ) : null}
                    {orchestratorPanelState.lazy.walkthrough ? (
                        <div className='space-y-1'>
                            <p className='font-medium'>Walkthrough</p>
                            <MarkdownContent
                                markdown={orchestratorPanelState.lazy.walkthrough.contentMarkdown}
                                className='space-y-2'
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className='space-y-1'>
                {orchestratorPanelState.steps.map((step) => (
                    <div key={step.id} className='bg-background rounded border px-3 py-2 text-xs'>
                        <div className='mb-2 flex items-center justify-between gap-3'>
                            <p className='font-medium'>
                                {String(step.sequence)}. {step.status}
                            </p>
                            {step.canOpenWorkerLane ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='ghost'
                                    onClick={() => {
                                        if (step.childThreadId) {
                                            input.onSelectChildThread?.(step.childThreadId);
                                        }
                                    }}>
                                    Open worker lane
                                </Button>
                            ) : null}
                        </div>
                        <MarkdownContent markdown={step.description} className='space-y-2' />
                        {step.childSessionId || step.activeRunId || step.runId ? (
                            <div className='text-muted-foreground mt-2 flex flex-wrap gap-2 text-[11px]'>
                                {step.childSessionId ? (
                                    <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                        Session {step.childSessionId}
                                    </span>
                                ) : null}
                                {step.activeRunId ? (
                                    <span className='rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700'>
                                        Active run {step.activeRunId}
                                    </span>
                                ) : null}
                                {step.runId ? (
                                    <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                        Final run {step.runId}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ModeExecutionPanel({
    topLevelTab,
    showPlanSurface,
    showOrchestratorSurface,
    planningDepthSelection,
    activePlan,
    isLoadingPlan,
    orchestratorView,
    actionController,
    selectedExecutionStrategy,
    canConfigureExecutionStrategy,
    onExecutionStrategyChange,
    onPlanningDepthSelectionChange,
    onSelectChildThread,
    onCreateVariant,
    onActivateVariant,
    onResumeFromRevision,
    onViewFollowUp,
    onResolveFollowUp,
}: ModeExecutionPanelProps) {
    const [draftState, setDraftState] = useState<ModeExecutionDraftState | undefined>(undefined);
    const [panelModeState, setPanelModeState] = useState<ModeExecutionPlanPanelModeState | undefined>(undefined);
    const [phaseDraftState, setPhaseDraftState] = useState<ModeExecutionPhaseDraftState | undefined>(undefined);
    const [phasePanelModeState, setPhasePanelModeState] = useState<ModeExecutionPhasePanelModeState | undefined>(
        undefined
    );
    const [phaseVerificationDraftState, setPhaseVerificationDraftState] = useState<
        ModeExecutionPhaseVerificationDraftState | undefined
    >(undefined);
    const [researchComposerState, setResearchComposerState] = useState<ModeExecutionPlanResearchComposerState | undefined>(
        undefined
    );
    const resolvedDraftState = resolveModeExecutionDraftState({
        activePlan,
        draftState,
    });
    const resolvedPlanPanelMode = resolveModeExecutionPlanPanelMode({
        activePlan,
        panelModeState,
    });
    const artifactState = resolveModeExecutionPlanArtifactState({
        activePlan,
    });
    const phaseState = resolveModeExecutionPlanPhaseState({
        activePlan,
    });
    const resolvedPhaseDraftState = resolveModeExecutionPhaseDraftState({
        activePlan,
        phaseState,
        draftState: phaseDraftState,
    });
    const resolvedPhaseVerificationDraftState = resolveModeExecutionPhaseVerificationDraftState({
        activePlan,
        phaseState,
        verificationDraftState: phaseVerificationDraftState,
    });
    const resolvedPhasePanelMode = resolveModeExecutionPhasePanelMode({
        activePlan,
        phaseState,
        panelModeState: phasePanelModeState,
    });
    const researchArtifactState = resolveModeExecutionPlanResearchArtifactState({
        activePlan,
    });
    const resolvedResearchComposerState = resolveModeExecutionResearchComposerState({
        activePlan,
        composerState: researchComposerState,
    });
    const orchestratorPanelState = resolveModeExecutionOrchestratorPanelState({
        topLevelTab,
        selectedExecutionStrategy,
        canConfigureExecutionStrategy,
        orchestratorView,
    });
    const {
        isPlanMutating,
        isOrchestratorMutating,
        onAnswerQuestion,
        onStartResearchBatch,
        onRevisePlan,
        onExpandNextPhase,
        onRevisePhase,
        onApprovePhase,
        onImplementPhase,
        onCancelPhase,
        onSavePhaseVerification,
        onStartPhaseReplan,
        onGenerateDraft,
        onCancelPlan,
        onApprovePlan,
        onImplementPlan,
        onEnterAdvancedPlanning,
        onAbortResearchBatch,
        onAbortOrchestrator,
    } = actionController;

    if (!showPlanSurface && !showOrchestratorSurface) {
        return null;
    }

    const activePlanId = activePlan?.id;
    const summaryDraft = resolvedDraftState?.summaryDraft ?? '';
    const itemsDraft = resolvedDraftState?.itemsDraft ?? '';
    const answerByQuestionId = resolvedDraftState?.answerByQuestionId ?? {};
    const planningDepth = resolvedDraftState?.planningDepth ?? planningDepthSelection;
    const advancedSnapshot = resolvedDraftState?.advancedSnapshot;
    const researchRequestDraft = resolvedResearchComposerState?.requestMarkdown ?? '';
    const selectedResearchWorkerCount = resolvedResearchComposerState?.workerCount ?? 1;

    function updateDraftState(
        plan: PlanView,
        updater: (current: ModeExecutionDraftState) => ModeExecutionDraftState
    ): void {
        setDraftState((current) => {
            const nextState =
                current?.planId === plan.id && current.revisionId === plan.currentRevisionId
                    ? current
                    : resolvedDraftState;
            return nextState ? updater(nextState) : nextState;
        });
    }

    function updatePhaseDraftState(
        plan: PlanView,
        updater: (current: ModeExecutionPhaseDraftState) => ModeExecutionPhaseDraftState
    ): void {
        setPhaseDraftState((current) => {
            const currentPhaseId = resolvedPhaseDraftState?.phaseId;
            const currentPhaseRevisionId = resolvedPhaseDraftState?.phaseRevisionId;
            const nextState =
                current?.planId === plan.id &&
                currentPhaseId !== undefined &&
                current.phaseId === currentPhaseId &&
                current.phaseRevisionId === currentPhaseRevisionId
                    ? current
                    : resolvedPhaseDraftState;
            return nextState ? updater(nextState) : nextState;
        });
    }

    function updatePhaseVerificationDraftState(
        plan: PlanView,
        updater: (current: ModeExecutionPhaseVerificationDraftState) => ModeExecutionPhaseVerificationDraftState
    ): void {
        setPhaseVerificationDraftState((current) => {
            const currentPhaseId = resolvedPhaseVerificationDraftState?.phaseId;
            const currentPhaseRevisionId = resolvedPhaseVerificationDraftState?.phaseRevisionId;
            const nextState =
                current?.planId === plan.id &&
                currentPhaseId !== undefined &&
                current.phaseId === currentPhaseId &&
                current.phaseRevisionId === currentPhaseRevisionId
                    ? current
                    : resolvedPhaseVerificationDraftState;
            return nextState ? updater(nextState) : nextState;
        });
    }

    function updateResearchComposerState(
        plan: PlanView,
        updater: (
            current: NonNullable<typeof resolvedResearchComposerState>
        ) => NonNullable<typeof resolvedResearchComposerState>
    ): void {
        setResearchComposerState((current) => {
            const nextState =
                current?.planId === plan.id && current.revisionId === plan.currentRevisionId
                    ? current
                    : resolvedResearchComposerState;
            return nextState ? updater(nextState) : nextState;
        });
    }

    function insertEvidenceAttachmentIntoDraft(attachmentId: EntityId<'pea'>): void {
        if (!activePlan || !resolvedDraftState || !researchArtifactState) {
            return;
        }

        const attachment = researchArtifactState.evidenceAttachments.find((candidate) => candidate.id === attachmentId);
        if (!attachment || planningDepth !== 'advanced' || !advancedSnapshot) {
            return;
        }

        const insertedMarkdown = [
            attachment.label,
            '',
            attachment.detailsMarkdown,
        ].join('\n');
        const nextEvidenceMarkdown =
            advancedSnapshot.evidenceMarkdown.trim().length > 0
                ? `${advancedSnapshot.evidenceMarkdown.trim()}\n\n${insertedMarkdown}`
                : insertedMarkdown;

        updateDraftState(activePlan, (current) => ({
            ...current,
            ...(current.advancedSnapshot
                ? {
                      advancedSnapshot: {
                          ...current.advancedSnapshot,
                          evidenceMarkdown: nextEvidenceMarkdown,
                      },
                  }
                : {}),
        }));
        setPanelModeState({
            planId: activePlan.id,
            revisionId: activePlan.currentRevisionId,
            mode: 'edit',
        });
    }

    function enterPhaseEditMode(): void {
        if (!activePlan || !resolvedPhaseDraftState) {
            return;
        }

        setPhaseVerificationDraftState(undefined);
        setPhasePanelModeState({
            planId: activePlan.id,
            phaseId: resolvedPhaseDraftState.phaseId,
            phaseRevisionId: resolvedPhaseDraftState.phaseRevisionId,
            mode: 'edit',
        });
    }

    function enterPhaseVerificationMode(): void {
        if (!activePlan || !resolvedPhaseVerificationDraftState || phaseState?.currentPhase?.status !== 'implemented') {
            return;
        }

        setPhaseDraftState(undefined);
        setPhaseVerificationDraftState(resolvedPhaseVerificationDraftState);
        setPhasePanelModeState({
            planId: activePlan.id,
            phaseId: resolvedPhaseVerificationDraftState.phaseId,
            phaseRevisionId: resolvedPhaseVerificationDraftState.phaseRevisionId,
            mode: 'verification',
        });
    }

    function discardPhaseEdits(): void {
        setPhaseDraftState(undefined);
        setPhaseVerificationDraftState(undefined);
        setPhasePanelModeState(undefined);
    }

    function discardPhaseVerificationEdits(): void {
        setPhaseVerificationDraftState(undefined);
        setPhasePanelModeState(undefined);
    }

    function addVerificationDiscrepancy(): void {
        if (!activePlan || !resolvedPhaseVerificationDraftState) {
            return;
        }

        updatePhaseVerificationDraftState(activePlan, (current) => ({
            ...current,
            discrepanciesDraft: [
                ...current.discrepanciesDraft,
                {
                    id: `verification_discrepancy_${String(current.discrepanciesDraft.length + 1)}`,
                    title: '',
                    detailsMarkdown: '',
                },
            ],
        }));
    }

    function removeVerificationDiscrepancy(discrepancyId: string): void {
        if (!activePlan || !resolvedPhaseVerificationDraftState) {
            return;
        }

        updatePhaseVerificationDraftState(activePlan, (current) => ({
            ...current,
            discrepanciesDraft: current.discrepanciesDraft.filter((discrepancy) => discrepancy.id !== discrepancyId),
        }));
    }

    return (
        <section className='border-border bg-card rounded-2xl border p-3'>
            {showPlanSurface ? (
                <div className='space-y-3'>
                    <div>
                        <p className='text-sm font-semibold'>Planning Workflow</p>
                        <p className='text-muted-foreground text-xs'>
                            Review the structured plan artifact, then revise, approve, cancel, or implement
                            intentionally.
                        </p>
                    </div>

                    {isLoadingPlan ? (
                        <p className='text-muted-foreground text-xs'>Loading active plan...</p>
                    ) : activePlan && artifactState ? (
                        resolvedPlanPanelMode === 'edit' ? (
                            <PlanEditView
                                summaryDraft={summaryDraft}
                                itemsDraft={itemsDraft}
                                planningDepth={planningDepth}
                                isPlanMutating={isPlanMutating}
                                {...(advancedSnapshot ? { advancedSnapshot } : {})}
                                onSummaryDraftChange={(next) => {
                                    updateDraftState(activePlan, (current) => ({
                                        ...current,
                                        summaryDraft: next,
                                    }));
                                }}
                                onItemsDraftChange={(next) => {
                                    updateDraftState(activePlan, (current) => ({
                                        ...current,
                                        itemsDraft: next,
                                    }));
                                }}
                                onAdvancedSnapshotChange={(nextSnapshot) => {
                                    updateDraftState(activePlan, (current) => ({
                                        ...current,
                                        advancedSnapshot: nextSnapshot,
                                    }));
                                }}
                                onSaveDraft={() => {
                                    const items = itemsDraft
                                        .split('\n')
                                        .map((item) => item.trim())
                                        .filter((item) => item.length > 0);
                                    setPanelModeState(undefined);
                                    onRevisePlan(activePlan.id, summaryDraft.trim(), items, advancedSnapshot);
                                }}
                                onDiscardEdits={() => {
                                    setDraftState(undefined);
                                    setPanelModeState(undefined);
                                }}
                            />
                        ) : (
                            <PlanArtifactView
                                plan={activePlan}
                                artifactState={artifactState}
                                answerByQuestionId={answerByQuestionId}
                                planningDepth={planningDepth}
                                isPlanMutating={isPlanMutating}
                                {...(advancedSnapshot ? { advancedSnapshot } : {})}
                                phaseState={phaseState}
                                phaseDraftState={resolvedPhaseDraftState}
                                phaseVerificationDraftState={resolvedPhaseVerificationDraftState}
                                phasePanelMode={resolvedPhasePanelMode}
                                {...(researchArtifactState ? { researchState: researchArtifactState } : {})}
                                researchRequestDraft={researchRequestDraft}
                                selectedResearchWorkerCount={selectedResearchWorkerCount}
                                canConfigureExecutionStrategy={
                                    topLevelTab === 'orchestrator' && canConfigureExecutionStrategy
                                }
                                selectedExecutionStrategy={selectedExecutionStrategy}
                                onExecutionStrategyChange={onExecutionStrategyChange}
                                onUpgradeToAdvancedPlanning={() => {
                                    setDraftState(undefined);
                                    setPanelModeState(undefined);
                                    onEnterAdvancedPlanning(activePlan.id);
                                }}
                                onQuestionAnswerDraftChange={(planId, questionId, answer) => {
                                    if (activePlanId !== planId) {
                                        return;
                                    }

                                    updateDraftState(activePlan, (current) => ({
                                        ...current,
                                        answerByQuestionId: {
                                            ...current.answerByQuestionId,
                                            [questionId]: answer,
                                        },
                                    }));
                                }}
                                onAnswerQuestion={(planId, questionId, answer) => {
                                    onAnswerQuestion(planId, questionId, answer);
                                }}
                                onResearchRequestDraftChange={(next) => {
                                    updateResearchComposerState(activePlan, (current) => ({
                                        ...current,
                                        requestMarkdown: next,
                                    }));
                                }}
                                onSelectedResearchWorkerCountChange={(next) => {
                                    const hardMaxWorkerCount = researchArtifactState?.capacity?.hardMaxWorkerCount ?? 1;
                                    updateResearchComposerState(activePlan, (current) => ({
                                        ...current,
                                        workerCount: Math.max(1, Math.min(next, hardMaxWorkerCount)),
                                    }));
                                }}
                                onExpandNextPhase={() => {
                                    onExpandNextPhase(activePlan.id);
                                }}
                                onEnterPhaseEditMode={enterPhaseEditMode}
                                onEnterPhaseVerificationMode={enterPhaseVerificationMode}
                                onPhaseSummaryDraftChange={(next) => {
                                    updatePhaseDraftState(activePlan, (current) => ({
                                        ...current,
                                        summaryDraft: next,
                                    }));
                                }}
                                onPhaseItemsDraftChange={(next) => {
                                    updatePhaseDraftState(activePlan, (current) => ({
                                        ...current,
                                        itemsDraft: next,
                                    }));
                                }}
                                onDiscardPhaseEdits={discardPhaseEdits}
                                onVerificationOutcomeChange={(next) => {
                                    if (!resolvedPhaseVerificationDraftState) {
                                        return;
                                    }

                                    updatePhaseVerificationDraftState(activePlan, (current) => ({
                                        ...current,
                                        outcome: next,
                                        discrepanciesDraft:
                                            next === 'passed'
                                                ? []
                                                : current.discrepanciesDraft.length > 0
                                                  ? current.discrepanciesDraft
                                                  : [
                                                        {
                                                            id: 'verification_discrepancy_1',
                                                            title: '',
                                                            detailsMarkdown: '',
                                                        },
                                                    ],
                                    }));
                                }}
                                onVerificationSummaryDraftChange={(next) => {
                                    if (!resolvedPhaseVerificationDraftState) {
                                        return;
                                    }

                                    updatePhaseVerificationDraftState(activePlan, (current) => ({
                                        ...current,
                                        summaryDraft: next,
                                    }));
                                }}
                                onVerificationDiscrepancyTitleChange={(discrepancyId, next) => {
                                    if (!resolvedPhaseVerificationDraftState) {
                                        return;
                                    }

                                    updatePhaseVerificationDraftState(activePlan, (current) => ({
                                        ...current,
                                        discrepanciesDraft: current.discrepanciesDraft.map((discrepancy) =>
                                            discrepancy.id === discrepancyId
                                                ? { ...discrepancy, title: next }
                                                : discrepancy
                                        ),
                                    }));
                                }}
                                onVerificationDiscrepancyDetailsChange={(discrepancyId, next) => {
                                    if (!resolvedPhaseVerificationDraftState) {
                                        return;
                                    }

                                    updatePhaseVerificationDraftState(activePlan, (current) => ({
                                        ...current,
                                        discrepanciesDraft: current.discrepanciesDraft.map((discrepancy) =>
                                            discrepancy.id === discrepancyId
                                                ? { ...discrepancy, detailsMarkdown: next }
                                                : discrepancy
                                        ),
                                    }));
                                }}
                                onAddVerificationDiscrepancy={() => {
                                    addVerificationDiscrepancy();
                                }}
                                onRemoveVerificationDiscrepancy={(discrepancyId) => {
                                    removeVerificationDiscrepancy(discrepancyId);
                                }}
                                onDiscardPhaseVerificationEdits={discardPhaseVerificationEdits}
                                onSavePhaseVerification={() => {
                                    if (!resolvedPhaseVerificationDraftState || !onSavePhaseVerification) {
                                        return;
                                    }

                                    setPhasePanelModeState(undefined);
                                    onSavePhaseVerification(
                                        activePlan.id,
                                        resolvedPhaseVerificationDraftState.phaseId,
                                        resolvedPhaseVerificationDraftState.phaseRevisionId,
                                        resolvedPhaseVerificationDraftState.outcome,
                                        resolvedPhaseVerificationDraftState.summaryDraft.trim(),
                                        resolvedPhaseVerificationDraftState.discrepanciesDraft
                                    );
                                }}
                                onSavePhaseDraft={() => {
                                    if (!resolvedPhaseDraftState) {
                                        return;
                                    }

                                    const items = resolvedPhaseDraftState.itemsDraft
                                        .split('\n')
                                        .map((item) => item.trim())
                                        .filter((item) => item.length > 0);
                                    setPhasePanelModeState(undefined);
                                    onRevisePhase(
                                        activePlan.id,
                                        resolvedPhaseDraftState.phaseId,
                                        resolvedPhaseDraftState.phaseRevisionId,
                                        resolvedPhaseDraftState.summaryDraft.trim(),
                                        items
                                    );
                                }}
                                onApprovePhase={() => {
                                    if (!phaseState?.currentPhase) {
                                        return;
                                    }

                                    onApprovePhase(
                                        activePlan.id,
                                        phaseState.currentPhase.id,
                                        phaseState.currentPhase.currentRevisionId
                                    );
                                }}
                                onImplementPhase={() => {
                                    if (!phaseState?.currentPhase) {
                                        return;
                                    }

                                    onImplementPhase(
                                        activePlan.id,
                                        phaseState.currentPhase.id,
                                        phaseState.currentPhase.currentRevisionId,
                                        selectedExecutionStrategy
                                    );
                                }}
                                onCancelPhase={() => {
                                    if (!phaseState?.currentPhase) {
                                        return;
                                    }

                                    setPhasePanelModeState(undefined);
                                    onCancelPhase(activePlan.id, phaseState.currentPhase.id);
                                }}
                                onStartPhaseReplan={() => {
                                    const latestVerification = phaseState?.currentPhase?.latestVerification;
                                    if (!phaseState?.currentPhase || !latestVerification || !onStartPhaseReplan) {
                                        return;
                                    }

                                    setPhaseVerificationDraftState(undefined);
                                    setPhasePanelModeState(undefined);
                                    onStartPhaseReplan(activePlan.id, phaseState.currentPhase.id, latestVerification.id);
                                }}
                                onStartResearchBatch={(promptMarkdown, workerCount) => {
                                    updateResearchComposerState(activePlan, (current) => ({
                                        ...current,
                                        requestMarkdown: '',
                                    }));
                                    onStartResearchBatch(activePlan.id, promptMarkdown, workerCount);
                                }}
                                onAbortResearchBatch={(researchBatchId) => {
                                    onAbortResearchBatch(activePlan.id, researchBatchId);
                                }}
                                onInsertEvidenceAttachmentToDraft={insertEvidenceAttachmentIntoDraft}
                                onGenerateDraft={() => {
                                    onGenerateDraft(activePlan.id);
                                }}
                                onEnterEditMode={() => {
                                    setPanelModeState({
                                        planId: activePlan.id,
                                        revisionId: activePlan.currentRevisionId,
                                        mode: 'edit',
                                    });
                                }}
                                onCancelPlan={() => {
                                    setPanelModeState(undefined);
                                    onCancelPlan(activePlan.id);
                                }}
                                onApprovePlan={() => {
                                    onApprovePlan(activePlan.id, activePlan.currentRevisionId);
                                }}
                                onImplementPlan={() => {
                                    onImplementPlan(activePlan.id, selectedExecutionStrategy);
                                }}
                                {...(onCreateVariant ? { onCreateVariant } : {})}
                                {...(onActivateVariant ? { onActivateVariant } : {})}
                                {...(onResumeFromRevision ? { onResumeFromRevision } : {})}
                                {...(onViewFollowUp ? { onViewFollowUp } : {})}
                                {...(onResolveFollowUp ? { onResolveFollowUp } : {})}
                                {...(onSelectChildThread ? { onSelectChildThread } : {})}
                            />
                        )
                    ) : (
                        <div className='space-y-3'>
                            <PlanningDepthToggle
                                selectedPlanningDepth={planningDepthSelection}
                                onPlanningDepthChange={onPlanningDepthSelectionChange}
                                disabled={isLoadingPlan}
                            />
                            <p className='text-muted-foreground text-xs'>
                                Simple planning keeps the current artifact compact. Advanced planning adds evidence,
                                observations, root cause, and a structured phase outline.
                            </p>
                            <p className='text-muted-foreground text-xs'>
                                Submit a planning prompt to create a plan artifact for this session.
                            </p>
                        </div>
                    )}
                </div>
            ) : null}

            {showOrchestratorSurface
                ? renderOrchestratorPanel(orchestratorPanelState, {
                      isOrchestratorMutating,
                      onAbortOrchestrator,
                      ...(onSelectChildThread ? { onSelectChildThread } : {}),
                  })
                : null}
        </section>
    );
}

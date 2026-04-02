import { useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { PlanArtifactView, PlanEditView } from '@/web/components/conversation/panels/modeExecutionPanelSections';
import {
    resolveModeExecutionDraftState,
    resolveModeExecutionOrchestratorPanelState,
    resolveModeExecutionPlanArtifactState,
    resolveModeExecutionPlanPanelMode,
    type ModeExecutionDraftState,
    type ModeExecutionOrchestratorPanelState,
    type ModeExecutionPlanPanelModeState,
    type ModeExecutionPlanView,
} from '@/web/components/conversation/panels/modeExecutionPanelState';
import type { ConversationPlanActionController } from '@/web/components/conversation/shell/composition/planImplementationController';
import { Button } from '@/web/components/ui/button';

import type { EntityId, OrchestratorExecutionStrategy, TopLevelTab } from '@/shared/contracts';

type PlanView = ModeExecutionPlanView;

type OrchestratorView = Parameters<typeof resolveModeExecutionOrchestratorPanelState>[0]['orchestratorView'];

export interface ModeExecutionPanelProps {
    topLevelTab: TopLevelTab;
    modeKey: string;
    activePlan?: PlanView;
    isLoadingPlan: boolean;
    orchestratorView?: OrchestratorView;
    actionController: ConversationPlanActionController;
    selectedExecutionStrategy: OrchestratorExecutionStrategy;
    canConfigureExecutionStrategy: boolean;
    onExecutionStrategyChange: (executionStrategy: OrchestratorExecutionStrategy) => void;
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
                Strategy: <span className='font-medium'>{orchestratorPanelState.activeExecutionStrategy}</span>
            </p>
            <p className='text-muted-foreground text-xs'>
                {orchestratorPanelState.activeExecutionStrategy === 'parallel'
                    ? `${String(orchestratorPanelState.runningStepCount)} child lane${orchestratorPanelState.runningStepCount === 1 ? '' : 's'} running. A child failure aborts sibling workers and fails the root run.`
                    : 'The root delegator starts one child worker lane at a time. A child failure stops the strategy immediately.'}
            </p>
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
    modeKey,
    activePlan,
    isLoadingPlan,
    orchestratorView,
    actionController,
    selectedExecutionStrategy,
    canConfigureExecutionStrategy,
    onExecutionStrategyChange,
    onSelectChildThread,
    onCreateVariant,
    onActivateVariant,
    onResumeFromRevision,
    onViewFollowUp,
    onResolveFollowUp,
}: ModeExecutionPanelProps) {
    const [draftState, setDraftState] = useState<ModeExecutionDraftState | undefined>(undefined);
    const [panelModeState, setPanelModeState] = useState<ModeExecutionPlanPanelModeState | undefined>(undefined);
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
        onRevisePlan,
        onGenerateDraft,
        onCancelPlan,
        onApprovePlan,
        onImplementPlan,
        onAbortOrchestrator,
    } = actionController;

    if (modeKey !== 'plan' && topLevelTab !== 'orchestrator') {
        return null;
    }

    const activePlanId = activePlan?.id;
    const summaryDraft = resolvedDraftState?.summaryDraft ?? '';
    const itemsDraft = resolvedDraftState?.itemsDraft ?? '';
    const answerByQuestionId = resolvedDraftState?.answerByQuestionId ?? {};

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

    return (
        <section className='border-border bg-card rounded-2xl border p-3'>
            {modeKey === 'plan' ? (
                <div className='space-y-3'>
                    <div>
                        <p className='text-sm font-semibold'>Plan Mode</p>
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
                                isPlanMutating={isPlanMutating}
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
                                onSaveDraft={() => {
                                    const items = itemsDraft
                                        .split('\n')
                                        .map((item) => item.trim())
                                        .filter((item) => item.length > 0);
                                    setPanelModeState(undefined);
                                    onRevisePlan(activePlan.id, summaryDraft.trim(), items);
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
                                isPlanMutating={isPlanMutating}
                                canConfigureExecutionStrategy={
                                    topLevelTab === 'orchestrator' && canConfigureExecutionStrategy
                                }
                                selectedExecutionStrategy={selectedExecutionStrategy}
                                onExecutionStrategyChange={onExecutionStrategyChange}
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
                            />
                        )
                    ) : (
                        <p className='text-muted-foreground text-xs'>
                            Submit a planning prompt to create a plan artifact for this session.
                        </p>
                    )}
                </div>
            ) : null}

            {renderOrchestratorPanel(orchestratorPanelState, {
                isOrchestratorMutating,
                onAbortOrchestrator,
                ...(onSelectChildThread ? { onSelectChildThread } : {}),
            })}
        </section>
    );
}

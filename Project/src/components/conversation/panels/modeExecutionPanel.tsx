import { useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import {
    resolveModeExecutionDraftState,
    type ModeExecutionDraftState,
    type ModeExecutionPlanView,
} from '@/web/components/conversation/panels/modeExecutionPanelState';
import type { ConversationPlanActionController } from '@/web/components/conversation/shell/composition/planImplementationController';
import { Button } from '@/web/components/ui/button';

import type { EntityId, OrchestratorExecutionStrategy, TopLevelTab } from '@/shared/contracts';

type PlanView = ModeExecutionPlanView;

interface OrchestratorView {
    run: {
        id: EntityId<'orch'>;
        status: 'running' | 'completed' | 'aborted' | 'failed';
        executionStrategy: OrchestratorExecutionStrategy;
        activeStepIndex?: number;
    };
    steps: Array<{
        id: EntityId<'step'>;
        sequence: number;
        description: string;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
        childThreadId?: EntityId<'thr'>;
        childSessionId?: EntityId<'sess'>;
        activeRunId?: EntityId<'run'>;
        runId?: EntityId<'run'>;
    }>;
}

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
}: ModeExecutionPanelProps) {
    const [draftState, setDraftState] = useState<ModeExecutionDraftState | undefined>(undefined);
    const resolvedDraftState = resolveModeExecutionDraftState({
        activePlan,
        draftState,
    });
    const {
        isPlanMutating,
        isOrchestratorMutating,
        onAnswerQuestion,
        onRevisePlan,
        onApprovePlan,
        onImplementPlan,
        onAbortOrchestrator,
    } = actionController;

    if (modeKey !== 'plan' && topLevelTab !== 'orchestrator') {
        return null;
    }

    const summaryDraft = resolvedDraftState?.summaryDraft ?? '';
    const itemsDraft = resolvedDraftState?.itemsDraft ?? '';
    const answerByQuestionId = resolvedDraftState?.answerByQuestionId ?? {};
    const itemPreviewMarkdown = itemsDraft
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .map((item) => `- ${item}`)
        .join('\n');
    const activeExecutionStrategy = orchestratorView?.run.executionStrategy ?? selectedExecutionStrategy;
    const runningStepCount = orchestratorView?.steps.filter((step) => step.status === 'running').length ?? 0;

    return (
        <section className='border-border bg-card rounded-2xl border p-3'>
            {modeKey === 'plan' ? (
                <div className='space-y-3'>
                    <div>
                        <p className='text-sm font-semibold'>Plan Mode</p>
                        <p className='text-muted-foreground text-xs'>
                            Clarify, revise, approve, then implement explicitly.
                        </p>
                    </div>

                    {isLoadingPlan ? (
                        <p className='text-muted-foreground text-xs'>Loading active plan...</p>
                    ) : activePlan ? (
                        <div className='space-y-3'>
                            <p className='text-xs'>
                                Status: <span className='font-medium'>{activePlan.status}</span>
                            </p>
                            {activePlan.questions.map((question) => (
                                <div key={question.id} className='space-y-1'>
                                    <p className='text-xs font-medium'>{question.question}</p>
                                    <div className='flex gap-2'>
                                        <input
                                            className='border-border bg-background h-8 flex-1 rounded-md border px-2 text-xs'
                                            value={answerByQuestionId[question.id] ?? ''}
                                            onChange={(event) => {
                                                const next = event.target.value;
                                                setDraftState((current) => {
                                                    const nextState =
                                                        current?.planId === activePlan.id
                                                            ? current
                                                            : resolvedDraftState;
                                                    return nextState
                                                        ? {
                                                              ...nextState,
                                                              answerByQuestionId: {
                                                                  ...nextState.answerByQuestionId,
                                                                  [question.id]: next,
                                                              },
                                                          }
                                                        : nextState;
                                                });
                                            }}
                                        />
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={
                                                isPlanMutating ||
                                                (answerByQuestionId[question.id] ?? '').trim().length === 0
                                            }
                                            onClick={() => {
                                                const answer = (answerByQuestionId[question.id] ?? '').trim();
                                                if (!answer) {
                                                    return;
                                                }
                                                onAnswerQuestion(activePlan.id, question.id, answer);
                                            }}>
                                            Save Answer
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            <div className='space-y-1'>
                                <p className='text-xs font-medium'>Plan Summary</p>
                                <textarea
                                    rows={4}
                                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                                    value={summaryDraft}
                                    onChange={(event) => {
                                        const next = event.target.value;
                                        setDraftState((current) => {
                                            const nextState =
                                                current?.planId === activePlan.id ? current : resolvedDraftState;
                                            return nextState
                                                ? {
                                                      ...nextState,
                                                      summaryDraft: next,
                                                  }
                                                : nextState;
                                        });
                                    }}
                                />
                                <div className='border-border bg-background rounded-md border p-3'>
                                    {summaryDraft.trim().length > 0 ? (
                                        <MarkdownContent markdown={summaryDraft} />
                                    ) : (
                                        <p className='text-muted-foreground text-xs'>
                                            Summary preview will render here.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className='space-y-1'>
                                <p className='text-xs font-medium'>Plan Items (one per line)</p>
                                <textarea
                                    rows={4}
                                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                                    value={itemsDraft}
                                    onChange={(event) => {
                                        const next = event.target.value;
                                        setDraftState((current) => {
                                            const nextState =
                                                current?.planId === activePlan.id ? current : resolvedDraftState;
                                            return nextState
                                                ? {
                                                      ...nextState,
                                                      itemsDraft: next,
                                                  }
                                                : nextState;
                                        });
                                    }}
                                />
                                <div className='border-border bg-background rounded-md border p-3'>
                                    {itemPreviewMarkdown.length > 0 ? (
                                        <MarkdownContent markdown={itemPreviewMarkdown} />
                                    ) : (
                                        <p className='text-muted-foreground text-xs'>Item preview will render here.</p>
                                    )}
                                </div>
                            </div>

                            <div className='flex flex-wrap gap-2'>
                                {topLevelTab === 'orchestrator' && canConfigureExecutionStrategy ? (
                                    <div className='border-border/70 bg-background/70 flex items-center gap-2 rounded-xl border p-1 text-xs'>
                                        <span className='px-2 font-medium'>Strategy</span>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant={selectedExecutionStrategy === 'delegate' ? 'default' : 'ghost'}
                                            disabled={isPlanMutating}
                                            onClick={() => {
                                                onExecutionStrategyChange('delegate');
                                            }}>
                                            Delegate
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant={selectedExecutionStrategy === 'parallel' ? 'default' : 'ghost'}
                                            disabled={isPlanMutating}
                                            onClick={() => {
                                                onExecutionStrategyChange('parallel');
                                            }}>
                                            Parallel
                                        </Button>
                                    </div>
                                ) : null}
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={isPlanMutating}
                                    onClick={() => {
                                        const items = itemsDraft
                                            .split('\n')
                                            .map((item) => item.trim())
                                            .filter((item) => item.length > 0);
                                        onRevisePlan(activePlan.id, summaryDraft.trim(), items);
                                    }}>
                                    Save Draft
                                </Button>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={isPlanMutating || activePlan.status === 'approved'}
                                    onClick={() => {
                                        onApprovePlan(activePlan.id);
                                    }}>
                                    Approve
                                </Button>
                                <Button
                                    type='button'
                                    size='sm'
                                    disabled={
                                        isPlanMutating ||
                                        (activePlan.status !== 'approved' && activePlan.status !== 'implementing')
                                    }
                                    onClick={() => {
                                        onImplementPlan(activePlan.id, selectedExecutionStrategy);
                                    }}>
                                    Implement
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <p className='text-muted-foreground text-xs'>
                            Submit a planning prompt to create a plan for this session.
                        </p>
                    )}
                </div>
            ) : null}

            {topLevelTab === 'orchestrator' && orchestratorView ? (
                <div className='mt-3 space-y-2'>
                    <div className='flex items-center justify-between'>
                        <p className='text-sm font-semibold'>Orchestrator Run</p>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={isOrchestratorMutating || orchestratorView.run.status !== 'running'}
                            onClick={() => {
                                onAbortOrchestrator(orchestratorView.run.id);
                            }}>
                            Abort
                        </Button>
                    </div>
                    <p className='text-xs'>
                        Status: <span className='font-medium'>{orchestratorView.run.status}</span>
                    </p>
                    <p className='text-xs'>
                        Strategy: <span className='font-medium'>{activeExecutionStrategy}</span>
                    </p>
                    <p className='text-muted-foreground text-xs'>
                        {activeExecutionStrategy === 'parallel'
                            ? `${String(runningStepCount)} child lane${runningStepCount === 1 ? '' : 's'} running. A child failure aborts sibling workers and fails the root run.`
                            : 'The root delegator starts one child worker lane at a time. A child failure stops the strategy immediately.'}
                    </p>
                    <div className='space-y-1'>
                        {orchestratorView.steps.map((step) => (
                            <div key={step.id} className='bg-background rounded border px-3 py-2 text-xs'>
                                <div className='mb-2 flex items-center justify-between gap-3'>
                                    <p className='font-medium'>
                                        {String(step.sequence)}. {step.status}
                                    </p>
                                    {step.childThreadId ? (
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            onClick={() => {
                                                if (step.childThreadId) {
                                                    onSelectChildThread?.(step.childThreadId);
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
            ) : null}
        </section>
    );
}

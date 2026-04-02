import type { EntityId, OrchestratorExecutionStrategy, PlanQuestionCategory, TopLevelTab } from '@/shared/contracts';

interface PlanQuestionView {
    id: string;
    question: string;
    category: PlanQuestionCategory;
    required: boolean;
    placeholderText?: string;
    helpText?: string;
    answer?: string;
}

interface PlanItemView {
    id: EntityId<'step'>;
    sequence: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
}

export interface ModeExecutionPlanView {
    id: EntityId<'plan'>;
    status: 'awaiting_answers' | 'draft' | 'approved' | 'implementing' | 'implemented' | 'failed' | 'cancelled';
    summaryMarkdown: string;
    currentRevisionId: EntityId<'prev'>;
    currentRevisionNumber: number;
    approvedRevisionId?: EntityId<'prev'>;
    approvedRevisionNumber?: number;
    questions: PlanQuestionView[];
    items: PlanItemView[];
}

export interface ModeExecutionDraftState {
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    summaryDraft: string;
    itemsDraft: string;
    answerByQuestionId: Record<string, string>;
}

export interface ModeExecutionOrchestratorStepView {
    id: EntityId<'step'>;
    sequence: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    activeRunId?: EntityId<'run'>;
    runId?: EntityId<'run'>;
    canOpenWorkerLane: boolean;
}

export interface ModeExecutionOrchestratorPanelState {
    activeExecutionStrategy: OrchestratorExecutionStrategy;
    canAbortOrchestrator: boolean;
    canConfigureExecutionStrategy: boolean;
    isVisible: boolean;
    isRootOrchestratorThread: boolean;
    runId: EntityId<'orch'>;
    runStatus: 'running' | 'completed' | 'aborted' | 'failed';
    runningStepCount: number;
    showStrategyControls: boolean;
    steps: ModeExecutionOrchestratorStepView[];
}

export function resolveModeExecutionOrchestratorPanelState(input: {
    topLevelTab: TopLevelTab;
    selectedExecutionStrategy: OrchestratorExecutionStrategy;
    canConfigureExecutionStrategy: boolean;
    orchestratorView:
        | {
              run: {
                  id: EntityId<'orch'>;
                  status: 'running' | 'completed' | 'aborted' | 'failed';
                  executionStrategy: OrchestratorExecutionStrategy;
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
        | undefined;
}): ModeExecutionOrchestratorPanelState | undefined {
    if (input.topLevelTab !== 'orchestrator' || !input.orchestratorView) {
        return undefined;
    }

    const activeExecutionStrategy = input.orchestratorView.run.executionStrategy;

    return {
        activeExecutionStrategy,
        canAbortOrchestrator: input.orchestratorView.run.status === 'running',
        canConfigureExecutionStrategy: input.canConfigureExecutionStrategy,
        isVisible: true,
        isRootOrchestratorThread: input.canConfigureExecutionStrategy,
        runId: input.orchestratorView.run.id,
        runStatus: input.orchestratorView.run.status,
        runningStepCount: input.orchestratorView.steps.filter((step) => step.status === 'running').length,
        showStrategyControls: input.canConfigureExecutionStrategy,
        steps: input.orchestratorView.steps.map((step) => ({
            ...step,
            canOpenWorkerLane: Boolean(step.childThreadId),
        })),
    };
}

export function resolveModeExecutionDraftState(input: {
    activePlan: ModeExecutionPlanView | undefined;
    draftState: ModeExecutionDraftState | undefined;
}): ModeExecutionDraftState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    if (
        input.draftState?.planId === input.activePlan.id &&
        input.draftState.revisionId === input.activePlan.currentRevisionId
    ) {
        return input.draftState;
    }

    return {
        planId: input.activePlan.id,
        revisionId: input.activePlan.currentRevisionId,
        summaryDraft: input.activePlan.summaryMarkdown,
        itemsDraft: input.activePlan.items.map((item) => item.description).join('\n'),
        answerByQuestionId: Object.fromEntries(
            input.activePlan.questions.map((question) => [question.id, question.answer ?? ''])
        ),
    };
}

export function hasUnansweredRequiredPlanQuestions(plan: ModeExecutionPlanView): boolean {
    return plan.questions.some((question) => question.required && (question.answer?.trim().length ?? 0) === 0);
}

export function canGenerateDraft(plan: ModeExecutionPlanView): boolean {
    if (hasUnansweredRequiredPlanQuestions(plan)) {
        return false;
    }

    return plan.status === 'awaiting_answers' || plan.status === 'draft' || plan.status === 'failed';
}

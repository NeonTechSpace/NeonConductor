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
    runId?: EntityId<'run'>;
    errorMessage?: string;
}

export interface ModeExecutionPlanView {
    id: EntityId<'plan'>;
    status: 'awaiting_answers' | 'draft' | 'approved' | 'implementing' | 'implemented' | 'failed' | 'cancelled';
    sourcePrompt: string;
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

export interface ModeExecutionPlanPanelModeState {
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    mode: ModeExecutionPlanPanelMode;
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

export type ModeExecutionPlanPanelMode = 'artifact' | 'edit';

export type ModeExecutionPlanStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive';

export interface ModeExecutionPlanArtifactEvidenceLine {
    label: string;
    value: string;
}

export interface ModeExecutionPlanArtifactState {
    statusLabel: string;
    statusDescription: string;
    statusTone: ModeExecutionPlanStatusTone;
    revisionLabel: string;
    approvedRevisionLabel: string | undefined;
    revisionComparisonLabel: string;
    questionsEditable: boolean;
    readyToImplement: boolean;
    canGenerateDraft: boolean;
    canRevise: boolean;
    canApprove: boolean;
    canImplement: boolean;
    canCancel: boolean;
    evidenceLines: ModeExecutionPlanArtifactEvidenceLine[];
}

export function resolveModeExecutionPlanPanelMode(input: {
    activePlan: ModeExecutionPlanView | undefined;
    panelModeState: ModeExecutionPlanPanelModeState | undefined;
}): ModeExecutionPlanPanelMode {
    if (!input.activePlan) {
        return 'artifact';
    }

    if (
        input.panelModeState?.planId === input.activePlan.id &&
        input.panelModeState.revisionId === input.activePlan.currentRevisionId
    ) {
        return input.panelModeState.mode;
    }

    return 'artifact';
}

function readPlanStatusLabel(status: ModeExecutionPlanView['status']): string {
    switch (status) {
        case 'awaiting_answers':
            return 'Waiting for answers';
        case 'draft':
            return 'Draft ready for review';
        case 'approved':
            return 'Ready to implement';
        case 'implementing':
            return 'Implementation in progress';
        case 'implemented':
            return 'Implemented';
        case 'failed':
            return 'Implementation failed';
        case 'cancelled':
            return 'Cancelled';
    }
}

function readPlanStatusDescription(plan: ModeExecutionPlanView): string {
    switch (plan.status) {
        case 'awaiting_answers':
            return 'Finish the required intake answers before generating a stronger draft.';
        case 'draft':
            return 'The current revision is editable, approvable, and ready for another refinement pass.';
        case 'approved':
            return 'Execution should use the approved revision, not the editable draft snapshot.';
        case 'implementing':
            return 'Implementation is actively running from the approved revision.';
        case 'implemented':
            return 'The approved plan has already completed execution.';
        case 'failed':
            return 'The last implementation attempt failed. Revise the plan or approve a replacement revision.';
        case 'cancelled':
            return 'This plan was cancelled. Its revision history remains available for review.';
    }
}

function readStatusTone(status: ModeExecutionPlanView['status']): ModeExecutionPlanStatusTone {
    switch (status) {
        case 'approved':
        case 'implemented':
            return 'success';
        case 'implementing':
            return 'info';
        case 'awaiting_answers':
            return 'warning';
        case 'failed':
            return 'destructive';
        case 'draft':
        case 'cancelled':
            return 'neutral';
    }
}

function readRevisionLabel(revisionNumber: number, revisionId: string): string {
    return `Revision ${String(revisionNumber)} (${revisionId})`;
}

export function resolveModeExecutionPlanArtifactState(input: {
    activePlan: ModeExecutionPlanView | undefined;
}): ModeExecutionPlanArtifactState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    const plan = input.activePlan;
    const approvedRevisionLabel = plan.approvedRevisionId
        ? readRevisionLabel(plan.approvedRevisionNumber ?? plan.currentRevisionNumber, plan.approvedRevisionId)
        : undefined;
    const currentRevisionLabel = readRevisionLabel(plan.currentRevisionNumber, plan.currentRevisionId);
    const hasApprovedRevision = Boolean(plan.approvedRevisionId);
    const approvedRevisionMatchesCurrent = plan.approvedRevisionId === plan.currentRevisionId;
    const answeredQuestions = plan.questions.filter(
        (question) => typeof question.answer === 'string' && question.answer.trim().length > 0
    );

    return {
        statusLabel: readPlanStatusLabel(plan.status),
        statusDescription: readPlanStatusDescription(plan),
        statusTone: readStatusTone(plan.status),
        revisionLabel: currentRevisionLabel,
        approvedRevisionLabel,
        revisionComparisonLabel: hasApprovedRevision
            ? approvedRevisionMatchesCurrent
                ? 'The current revision is the approved revision.'
                : 'The current revision is ahead of the last approved revision.'
            : 'No approved revision has been recorded yet.',
        questionsEditable: plan.status === 'awaiting_answers',
        readyToImplement: plan.status === 'approved',
        canGenerateDraft: canGenerateDraft(plan),
        canRevise:
            plan.status === 'draft' ||
            plan.status === 'approved' ||
            plan.status === 'implemented' ||
            plan.status === 'failed' ||
            plan.status === 'cancelled',
        canApprove: plan.status === 'draft' || plan.status === 'failed' || plan.status === 'cancelled',
        canImplement: plan.status === 'approved',
        canCancel:
            plan.status === 'awaiting_answers' ||
            plan.status === 'draft' ||
            plan.status === 'approved' ||
            plan.status === 'failed',
        evidenceLines: [
            {
                label: 'Source prompt',
                value: plan.sourcePrompt,
            },
            {
                label: 'Intake answers',
                value:
                    answeredQuestions.length > 0
                        ? answeredQuestions
                              .map(
                                  (question) => `${question.question} ${question.answer ? `- ${question.answer}` : ''}`
                              )
                              .join(' · ')
                        : 'No intake answers have been recorded yet.',
            },
            {
                label: 'Revision state',
                value: approvedRevisionMatchesCurrent
                    ? `The approved revision matches ${currentRevisionLabel}.`
                    : approvedRevisionLabel
                      ? `Current draft ${currentRevisionLabel} is ahead of ${approvedRevisionLabel}.`
                      : `Current draft ${currentRevisionLabel} has not been approved yet.`,
            },
        ],
    };
}

import type { ModeExecutionAdvancedPlanningSnapshotDraft } from '@/web/components/conversation/panels/modeExecutionPanelAdvancedPlanning';

import type {
    EntityId,
    OrchestratorExecutionStrategy,
    PlanRecordView,
    PlanPhaseOutlineInput,
    TopLevelTab,
} from '@/shared/contracts';

export {
    canGenerateDraft,
    hasUnansweredRequiredPlanQuestions,
    resolveModeExecutionPlanArtifactState,
    resolveModeExecutionPlanResearchArtifactState,
} from '@/web/components/conversation/panels/modeExecutionPlanArtifactState';
export interface ModeExecutionPlanVariantView {
    id: EntityId<'pvar'>;
    name: string;
    revisionId?: EntityId<'prev'>;
    revisionNumber?: number;
    revisionLabel?: string;
    isCurrent?: boolean;
    isApproved?: boolean;
    createdAt?: string;
    archivedAt?: string;
}

export interface ModeExecutionPlanFollowUpView {
    id: EntityId<'pfu'>;
    kind: 'missing_context' | 'missing_file';
    status: 'open' | 'resolved' | 'dismissed';
    promptMarkdown: string;
    responseMarkdown?: string;
    sourceRevisionLabel?: string;
    createdAt?: string;
    resolvedAt?: string;
    dismissedAt?: string;
}

export interface ModeExecutionPlanTimelineActionView {
    label: string;
    kind:
        | 'resume_from_here'
        | 'branch_from_here'
        | 'view_follow_up'
        | 'switch_to_variant'
        | 'resume_editing'
        | 'resolve_follow_up';
    revisionId?: EntityId<'prev'>;
    variantId?: EntityId<'pvar'>;
    followUpId?: EntityId<'pfu'>;
}

export interface ModeExecutionPlanHistoryEntryView {
    id: string;
    kind:
        | 'revision'
        | 'approval'
        | 'variant_created'
        | 'variant_activated'
        | 'follow_up_raised'
        | 'follow_up_resolved'
        | 'follow_up_dismissed'
        | 'implementation'
        | 'cancellation'
        | 'phase_expanded'
        | 'phase_revision_created'
        | 'phase_approved'
        | 'phase_implementation_started'
        | 'phase_implementation_completed'
        | 'phase_implementation_failed'
        | 'phase_cancelled'
        | 'phase_verification_recorded'
        | 'phase_replan_started';
    title: string;
    description: string;
    timestamp?: string;
    revisionLabel?: string;
    variantLabel?: string;
    followUpLabel?: string;
    actions?: ModeExecutionPlanTimelineActionView[];
}

export interface ModeExecutionPlanRecoveryBannerView {
    title: string;
    message: string;
    actions: ModeExecutionPlanTimelineActionView[];
}

export type ModeExecutionPlanView = PlanRecordView;

export type ModeExecutionPlanPhaseVerificationOutcome = 'passed' | 'failed';

export interface ModeExecutionPlanPhaseVerificationDiscrepancyView {
    id: string;
    sequence: number;
    title: string;
    detailsMarkdown: string;
    createdAt: string;
}

export interface ModeExecutionPlanPhaseVerificationView {
    id: string;
    planPhaseId: string;
    planPhaseRevisionId: string;
    outcome: ModeExecutionPlanPhaseVerificationOutcome;
    summaryMarkdown: string;
    discrepancies: ModeExecutionPlanPhaseVerificationDiscrepancyView[];
    createdAt: string;
}

export interface ModeExecutionDraftState {
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    summaryDraft: string;
    itemsDraft: string;
    answerByQuestionId: Record<string, string>;
    planningDepth: NonNullable<ModeExecutionPlanView['planningDepth']>;
    advancedSnapshot?: ModeExecutionAdvancedPlanningSnapshotDraft;
}

export interface ModeExecutionPlanResearchComposerState {
    planId: EntityId<'plan'>;
    revisionId: EntityId<'prev'>;
    requestMarkdown: string;
    workerCount: number;
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
        planningDepth: input.activePlan.planningDepth ?? 'simple',
        ...(input.activePlan.advancedSnapshot ? { advancedSnapshot: input.activePlan.advancedSnapshot } : {}),
    };
}

export function resolveModeExecutionResearchComposerState(input: {
    activePlan: ModeExecutionPlanView | undefined;
    composerState: ModeExecutionPlanResearchComposerState | undefined;
}): ModeExecutionPlanResearchComposerState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    if (
        input.composerState?.planId === input.activePlan.id &&
        input.composerState.revisionId === input.activePlan.currentRevisionId
    ) {
        return input.composerState;
    }

    return {
        planId: input.activePlan.id,
        revisionId: input.activePlan.currentRevisionId,
        requestMarkdown: '',
        workerCount:
            input.activePlan.researchRecommendation?.suggestedWorkerCount ??
            input.activePlan.researchCapacity?.recommendedWorkerCount ??
            1,
    };
}

export type ModeExecutionPlanPanelMode = 'artifact' | 'edit';

export type ModeExecutionPlanStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive';

export interface ModeExecutionPlanArtifactState {
    planningDepth: NonNullable<ModeExecutionPlanView['planningDepth']>;
    statusLabel: string;
    statusDescription: string;
    statusTone: ModeExecutionPlanStatusTone;
    revisionLabel: string;
    approvedRevisionLabel: string | undefined;
    revisionComparisonLabel: string;
    currentVariantLabel: string;
    approvedVariantLabel: string | undefined;
    variantComparisonLabel: string;
    variants: ModeExecutionPlanVariantView[];
    followUps: ModeExecutionPlanFollowUpView[];
    history: ModeExecutionPlanHistoryEntryView[];
    recoveryBanner: ModeExecutionPlanRecoveryBannerView | undefined;
    currentVariantId: EntityId<'pvar'> | undefined;
    approvedVariantId: EntityId<'pvar'> | undefined;
    hasOpenFollowUps: boolean;
    hasRunningResearchBatch: boolean;
    questionsEditable: boolean;
    readyToImplement: boolean;
    canGenerateDraft: boolean;
    canRevise: boolean;
    canApprove: boolean;
    canImplement: boolean;
    canCancel: boolean;
    canEnterAdvancedPlanning: boolean;
}

export interface ModeExecutionPlanResearchArtifactState {
    currentRevisionBatches: NonNullable<ModeExecutionPlanView['researchBatches']>;
    historicalBatches: NonNullable<ModeExecutionPlanView['researchBatches']>;
    evidenceAttachments: NonNullable<ModeExecutionPlanView['evidenceAttachments']>;
    recommendation?: ModeExecutionPlanView['researchRecommendation'];
    capacity?: ModeExecutionPlanView['researchCapacity'];
    activeBatch?: NonNullable<ModeExecutionPlanView['researchBatches']>[number];
    hasRunningResearchBatch: boolean;
    canStartResearch: boolean;
    canAbortActiveResearchBatch: boolean;
}

export type ModeExecutionPhasePanelMode = 'artifact' | 'edit' | 'verification';

export type ModeExecutionPlanPhaseStatus =
    | 'not_started'
    | 'draft'
    | 'approved'
    | 'implementing'
    | 'implemented'
    | 'cancelled';

export type ModeExecutionPlanPhaseItemStatus = ModeExecutionPlanView['items'][number]['status'];

export interface ModeExecutionPlanPhaseItemView {
    id: string;
    sequence: number;
    description: string;
    status: ModeExecutionPlanPhaseItemStatus;
    runId?: EntityId<'run'>;
    errorMessage?: string;
}

export interface ModeExecutionPlanPhaseRevisionView {
    id: string;
    revisionNumber: number;
    summaryMarkdown: string;
    items: ModeExecutionPlanPhaseItemView[];
    createdByKind: 'expand' | 'revise' | 'replan';
    createdAt: string;
    previousRevisionId?: string;
    supersededAt?: string;
}

export interface ModeExecutionPlanPhaseRecordView {
    id: string;
    planId: EntityId<'plan'>;
    planRevisionId: EntityId<'prev'>;
    variantId: EntityId<'pvar'>;
    phaseOutlineId: string;
    phaseSequence: number;
    title: string;
    goalMarkdown: string;
    exitCriteriaMarkdown: string;
    status: ModeExecutionPlanPhaseStatus;
    currentRevisionId: string;
    currentRevisionNumber: number;
    approvedRevisionId?: string;
    approvedRevisionNumber?: number;
    summaryMarkdown: string;
    items: ModeExecutionPlanPhaseItemView[];
    createdAt: string;
    updatedAt: string;
    approvedAt?: string;
    implementedAt?: string;
    implementationRunId?: string;
    orchestratorRunId?: string;
    implementedRevisionId?: string;
    implementedRevisionNumber?: number;
    verificationStatus?: 'not_applicable' | 'pending' | 'passed' | 'failed';
    latestVerification?: ModeExecutionPlanPhaseVerificationView;
    verifications?: ModeExecutionPlanPhaseVerificationView[];
    canStartVerification?: boolean;
    canStartReplan?: boolean;
    revisions?: ModeExecutionPlanPhaseRevisionView[];
}

export interface ModeExecutionPlanPhaseState {
    roadmapPhases: PlanPhaseOutlineInput[];
    currentPhase: ModeExecutionPlanPhaseRecordView | undefined;
    nextExpandablePhaseOutlineId: string | undefined;
    hasOpenPhaseDetail: boolean;
    canExpandNextPhase: boolean;
}

export interface ModeExecutionPhaseDraftState {
    planId: EntityId<'plan'>;
    phaseId: string;
    phaseRevisionId: string;
    summaryDraft: string;
    itemsDraft: string;
}

export interface ModeExecutionPhaseVerificationDiscrepancyDraftState {
    id: string;
    title: string;
    detailsMarkdown: string;
}

export interface ModeExecutionPhaseVerificationDraftState {
    planId: EntityId<'plan'>;
    phaseId: string;
    phaseRevisionId: string;
    outcome: ModeExecutionPlanPhaseVerificationOutcome;
    summaryDraft: string;
    discrepanciesDraft: ModeExecutionPhaseVerificationDiscrepancyDraftState[];
}

export interface ModeExecutionPhasePanelModeState {
    planId: EntityId<'plan'>;
    phaseId: string;
    phaseRevisionId: string;
    mode: ModeExecutionPhasePanelMode;
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

function mapPlanPhaseRecord(
    phase: ModeExecutionPlanPhaseRecordView,
    roadmapPhase: PlanPhaseOutlineInput | undefined
): ModeExecutionPlanPhaseRecordView {
    return {
        ...phase,
        ...(roadmapPhase
            ? { goalMarkdown: roadmapPhase.goalMarkdown, exitCriteriaMarkdown: roadmapPhase.exitCriteriaMarkdown }
            : {}),
        items: phase.items.map((item) => ({
            ...item,
        })),
        ...(phase.revisions
            ? {
                  revisions: phase.revisions.map((revision) => ({
                      ...revision,
                      items: revision.items.map((item) => ({
                          ...item,
                      })),
                  })),
              }
            : {}),
    };
}

function hasVerifiedRoadmapCompletion(phase: ModeExecutionPlanPhaseRecordView): boolean {
    if (phase.status === 'cancelled') {
        return false;
    }

    if (phase.status !== 'implemented') {
        return true;
    }

    if (phase.verificationStatus === 'failed' || phase.verificationStatus === 'pending') {
        return false;
    }

    return true;
}

function computeNextExpandablePhaseOutlineId(input: {
    roadmapPhases: PlanPhaseOutlineInput[];
    phaseRecords: ModeExecutionPlanPhaseRecordView[];
}): string | undefined {
    const roadmapPhases = [...input.roadmapPhases].sort((left, right) => left.sequence - right.sequence);
    if (roadmapPhases.length === 0) {
        return undefined;
    }

    const phaseByOutlineId = new Map(input.phaseRecords.map((phase) => [phase.phaseOutlineId, phase] as const));
    for (const roadmapPhase of roadmapPhases) {
        const phase = phaseByOutlineId.get(roadmapPhase.id);
        if (!phase) {
            const allPriorPhasesVerified = roadmapPhases
                .filter((candidate) => candidate.sequence < roadmapPhase.sequence)
                .every((candidate) => {
                    const priorPhase = phaseByOutlineId.get(candidate.id);
                    return priorPhase ? hasVerifiedRoadmapCompletion(priorPhase) : true;
                });

            return allPriorPhasesVerified ? roadmapPhase.id : undefined;
        }

        if (
            phase.status === 'draft' ||
            phase.status === 'approved' ||
            phase.status === 'implementing' ||
            phase.status === 'cancelled'
        ) {
            return undefined;
        }

        if (!hasVerifiedRoadmapCompletion(phase)) {
            return undefined;
        }
    }

    return undefined;
}

export function resolveModeExecutionPlanPhaseState(input: {
    activePlan: ModeExecutionPlanView | undefined;
}): ModeExecutionPlanPhaseState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    const plan = input.activePlan as ModeExecutionPlanView & {
        phases?: ModeExecutionPlanPhaseRecordView[];
        hasOpenPhaseDetail?: boolean;
    };
    const roadmapPhases = Array.isArray(plan.advancedSnapshot?.phases) ? plan.advancedSnapshot.phases : [];
    const phaseRecords = Array.isArray(plan.phases) ? plan.phases : [];
    const sortedPhases = [...phaseRecords].sort((left, right) => left.phaseSequence - right.phaseSequence);
    const currentPhase = [...sortedPhases].reverse().find((phase) => phase.status !== 'not_started') ?? undefined;
    const nextExpandablePhaseOutlineId = !plan.hasOpenPhaseDetail
        ? computeNextExpandablePhaseOutlineId({
              roadmapPhases,
              phaseRecords,
          })
        : undefined;
    const hasOpenPhaseDetail =
        plan.hasOpenPhaseDetail ??
        phaseRecords.some(
            (phase) => phase.status === 'draft' || phase.status === 'approved' || phase.status === 'implementing'
        );
    const normalizedCurrentPhase = currentPhase
        ? mapPlanPhaseRecord(
              currentPhase,
              roadmapPhases.find((phase) => phase.id === currentPhase.phaseOutlineId)
          )
        : undefined;

    return {
        roadmapPhases,
        currentPhase: normalizedCurrentPhase,
        nextExpandablePhaseOutlineId,
        hasOpenPhaseDetail,
        canExpandNextPhase:
            plan.planningDepth === 'advanced' &&
            plan.status === 'approved' &&
            !hasOpenPhaseDetail &&
            Boolean(nextExpandablePhaseOutlineId),
    };
}

export function resolveModeExecutionPhaseDraftState(input: {
    activePlan: ModeExecutionPlanView | undefined;
    phaseState: ModeExecutionPlanPhaseState | undefined;
    draftState: ModeExecutionPhaseDraftState | undefined;
}): ModeExecutionPhaseDraftState | undefined {
    if (!input.activePlan || !input.phaseState?.currentPhase) {
        return undefined;
    }

    if (
        input.draftState?.planId === input.activePlan.id &&
        input.draftState.phaseId === input.phaseState.currentPhase.id &&
        input.draftState.phaseRevisionId === input.phaseState.currentPhase.currentRevisionId
    ) {
        return input.draftState;
    }

    return {
        planId: input.activePlan.id,
        phaseId: input.phaseState.currentPhase.id,
        phaseRevisionId: input.phaseState.currentPhase.currentRevisionId,
        summaryDraft: input.phaseState.currentPhase.summaryMarkdown,
        itemsDraft: input.phaseState.currentPhase.items.map((item) => item.description).join('\n'),
    };
}

export function resolveModeExecutionPhaseVerificationDraftState(input: {
    activePlan: ModeExecutionPlanView | undefined;
    phaseState: ModeExecutionPlanPhaseState | undefined;
    verificationDraftState: ModeExecutionPhaseVerificationDraftState | undefined;
}): ModeExecutionPhaseVerificationDraftState | undefined {
    if (!input.activePlan || !input.phaseState?.currentPhase) {
        return undefined;
    }

    if (
        input.verificationDraftState?.planId === input.activePlan.id &&
        input.verificationDraftState.phaseId === input.phaseState.currentPhase.id &&
        input.verificationDraftState.phaseRevisionId === input.phaseState.currentPhase.currentRevisionId
    ) {
        return input.verificationDraftState;
    }

    const latestVerification = input.phaseState.currentPhase.latestVerification;
    return {
        planId: input.activePlan.id,
        phaseId: input.phaseState.currentPhase.id,
        phaseRevisionId: input.phaseState.currentPhase.currentRevisionId,
        outcome: latestVerification?.outcome ?? 'passed',
        summaryDraft: latestVerification?.summaryMarkdown ?? input.phaseState.currentPhase.summaryMarkdown,
        discrepanciesDraft:
            latestVerification?.discrepancies.map((discrepancy) => ({
                id: discrepancy.id,
                title: discrepancy.title,
                detailsMarkdown: discrepancy.detailsMarkdown,
            })) ?? [],
    };
}

export function resolveModeExecutionPhasePanelMode(input: {
    activePlan: ModeExecutionPlanView | undefined;
    phaseState: ModeExecutionPlanPhaseState | undefined;
    panelModeState: ModeExecutionPhasePanelModeState | undefined;
}): ModeExecutionPhasePanelMode {
    if (!input.activePlan || !input.phaseState?.currentPhase) {
        return 'artifact';
    }

    if (
        input.panelModeState?.planId === input.activePlan.id &&
        input.panelModeState.phaseId === input.phaseState.currentPhase.id &&
        input.panelModeState.phaseRevisionId === input.phaseState.currentPhase.currentRevisionId
    ) {
        return input.panelModeState.mode;
    }

    return 'artifact';
}

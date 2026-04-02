import type { ModeExecutionAdvancedPlanningSnapshotDraft } from '@/web/components/conversation/panels/modeExecutionPanelAdvancedPlanning';

import type {
    EntityId,
    OrchestratorExecutionStrategy,
    PlanFollowUpView,
    PlanHistoryEntry,
    PlanHistoryEntryAction,
    PlanRecordView,
    PlanRecoveryBanner,
    PlanRecoveryBannerAction,
    PlanPhaseOutlineInput,
    PlanVariantView,
    TopLevelTab,
} from '@/shared/contracts';

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
        | 'phase_cancelled';
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

export type ModeExecutionPhasePanelMode = 'artifact' | 'edit';

export type ModeExecutionPlanPhaseStatus = 'not_started' | 'draft' | 'approved' | 'implementing' | 'implemented' | 'cancelled';

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
    createdByKind: 'expand' | 'revise';
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
        ...(roadmapPhase ? { goalMarkdown: roadmapPhase.goalMarkdown, exitCriteriaMarkdown: roadmapPhase.exitCriteriaMarkdown } : {}),
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

export function resolveModeExecutionPlanPhaseState(input: {
    activePlan: ModeExecutionPlanView | undefined;
}): ModeExecutionPlanPhaseState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    const plan = input.activePlan as ModeExecutionPlanView & {
        phases?: ModeExecutionPlanPhaseRecordView[];
        nextExpandablePhaseOutlineId?: string;
        hasOpenPhaseDetail?: boolean;
    };
    const roadmapPhases = Array.isArray(plan.advancedSnapshot?.phases) ? plan.advancedSnapshot.phases : [];
    const phaseRecords = Array.isArray(plan.phases) ? plan.phases : [];
    const phaseByOutlineId = new Map(phaseRecords.map((phase) => [phase.phaseOutlineId, phase]));
    const sortedPhases = [...phaseRecords].sort((left, right) => left.phaseSequence - right.phaseSequence);
    const currentPhase =
        [...sortedPhases].reverse().find((phase) => phase.status !== 'not_started') ?? undefined;
    const nextExpandablePhaseOutlineId =
        plan.nextExpandablePhaseOutlineId ??
        (!plan.hasOpenPhaseDetail
            ? roadmapPhases.find((phase) => !phaseByOutlineId.has(phase.id))?.id
            : undefined);
    const hasOpenPhaseDetail =
        plan.hasOpenPhaseDetail ??
        phaseRecords.some(
            (phase) => phase.status === 'draft' || phase.status === 'approved' || phase.status === 'implementing'
        );
    const normalizedCurrentPhase = currentPhase
        ? mapPlanPhaseRecord(currentPhase, roadmapPhases.find((phase) => phase.id === currentPhase.phaseOutlineId))
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

function readVariantLabel(
    variant: ModeExecutionPlanVariantView | undefined,
    fallbackId: string | undefined
): string | undefined {
    if (variant) {
        return variant.name.trim().length > 0 ? variant.name : (fallbackId ?? variant.revisionLabel);
    }

    return fallbackId;
}

function mapHistoryAction(action: PlanHistoryEntryAction | PlanRecoveryBannerAction): ModeExecutionPlanTimelineActionView {
    switch (action.kind) {
        case 'switch_to_approved_variant':
            return {
                label: action.label,
                kind: 'switch_to_variant',
                ...(action.variantId ? { variantId: action.variantId } : {}),
            };
        case 'resume_editing':
            return {
                label: action.label,
                kind: 'resume_editing',
            };
        case 'resolve_follow_up':
            return {
                label: action.label,
                kind: 'resolve_follow_up',
                ...(action.followUpId ? { followUpId: action.followUpId } : {}),
            };
        default:
            return {
                label: action.label,
                kind: action.kind,
                ...(action.revisionId ? { revisionId: action.revisionId } : {}),
                ...(action.variantId ? { variantId: action.variantId } : {}),
                ...(action.followUpId ? { followUpId: action.followUpId } : {}),
            };
    }
}

function mapVariantView(
    variant: PlanVariantView,
    input: { currentVariantId: EntityId<'pvar'>; approvedVariantId?: EntityId<'pvar'> }
): ModeExecutionPlanVariantView {
    return {
        id: variant.id,
        name: variant.name,
        revisionId: variant.currentRevisionId,
        revisionNumber: variant.currentRevisionNumber,
        revisionLabel: readRevisionLabel(variant.currentRevisionNumber, variant.currentRevisionId),
        isCurrent: variant.id === input.currentVariantId,
        isApproved: variant.id === input.approvedVariantId,
        createdAt: variant.createdAt,
        ...(variant.archivedAt ? { archivedAt: variant.archivedAt } : {}),
    };
}

function mapFollowUpView(
    followUp: PlanFollowUpView,
    revisionLabelById: Map<EntityId<'prev'>, string>
): ModeExecutionPlanFollowUpView {
    return {
        id: followUp.id,
        kind: followUp.kind,
        status: followUp.status,
        promptMarkdown: followUp.promptMarkdown,
        ...(followUp.responseMarkdown ? { responseMarkdown: followUp.responseMarkdown } : {}),
        ...(followUp.sourceRevisionId
            ? {
                  sourceRevisionLabel:
                      revisionLabelById.get(followUp.sourceRevisionId) ?? `Revision ${followUp.sourceRevisionId}`,
              }
            : {}),
        createdAt: followUp.createdAt,
        ...(followUp.resolvedAt ? { resolvedAt: followUp.resolvedAt } : {}),
        ...(followUp.dismissedAt ? { dismissedAt: followUp.dismissedAt } : {}),
    };
}

function mapHistoryEntryView(
    entry: PlanHistoryEntry,
    input: {
        revisionLabelById: Map<EntityId<'prev'>, string>;
        variantNameById: Map<EntityId<'pvar'>, string>;
        followUpById: Map<EntityId<'pfu'>, ModeExecutionPlanFollowUpView>;
    }
): ModeExecutionPlanHistoryEntryView {
    const followUpStatus = entry.followUpId ? input.followUpById.get(entry.followUpId)?.status : undefined;
    const kind: ModeExecutionPlanHistoryEntryView['kind'] =
        entry.kind === 'revision_created' || entry.kind === 'plan_started' || entry.kind === 'plan_resumed'
            ? 'revision'
            : entry.kind === 'revision_approved'
              ? 'approval'
              : entry.kind === 'implementation_started' ||
                  entry.kind === 'implementation_completed' ||
                  entry.kind === 'implementation_failed'
                ? 'implementation'
                : entry.kind === 'plan_cancelled'
                  ? 'cancellation'
                  : entry.kind === 'follow_up_raised'
                    ? 'follow_up_raised'
                    : entry.kind === 'follow_up_resolved'
                      ? followUpStatus === 'dismissed'
                          ? 'follow_up_dismissed'
                          : 'follow_up_resolved'
                      : entry.kind;
    const revisionLabel =
        entry.revisionId && entry.revisionNumber !== undefined
            ? readRevisionLabel(entry.revisionNumber, entry.revisionId)
            : entry.revisionId
              ? input.revisionLabelById.get(entry.revisionId) ?? `Revision ${entry.revisionId}`
              : undefined;
    const variantLabel = entry.variantName ?? (entry.variantId ? input.variantNameById.get(entry.variantId) : undefined);
    const followUp = entry.followUpId ? input.followUpById.get(entry.followUpId) : undefined;

    return {
        id: entry.id,
        kind,
        title: entry.title,
        description: entry.detail ?? entry.title,
        timestamp: entry.createdAt,
        ...(revisionLabel ? { revisionLabel } : {}),
        ...(variantLabel ? { variantLabel } : {}),
        ...(followUp ? { followUpLabel: `${followUp.kind.replace('_', ' ')} · ${followUp.status}` } : {}),
        ...(entry.actions ? { actions: entry.actions.map(mapHistoryAction) } : {}),
    };
}

function mapRecoveryBanner(
    banner: PlanRecoveryBanner | undefined
): ModeExecutionPlanRecoveryBannerView | undefined {
    if (!banner) {
        return undefined;
    }

    return {
        title: banner.title,
        message: banner.message,
        actions: banner.actions.map(mapHistoryAction),
    };
}

function sortHistoryEntriesNewestFirst(
    entries: ModeExecutionPlanHistoryEntryView[]
): ModeExecutionPlanHistoryEntryView[] {
    return [...entries].sort((left, right) => {
        const leftTimestamp = left.timestamp ? Date.parse(left.timestamp) : Number.NEGATIVE_INFINITY;
        const rightTimestamp = right.timestamp ? Date.parse(right.timestamp) : Number.NEGATIVE_INFINITY;
        if (Number.isNaN(leftTimestamp) || Number.isNaN(rightTimestamp) || leftTimestamp === rightTimestamp) {
            return 0;
        }

        return rightTimestamp - leftTimestamp;
    });
}

function buildFallbackHistoryEntries(
    plan: ModeExecutionPlanView,
    state: {
        currentRevisionLabel: string;
        approvedRevisionLabel: string | undefined;
        currentVariantLabel: string;
        approvedVariantLabel: string | undefined;
        hasOpenFollowUps: boolean;
        followUps: ModeExecutionPlanFollowUpView[];
    }
): ModeExecutionPlanHistoryEntryView[] {
    const entries: ModeExecutionPlanHistoryEntryView[] = [];

    if (state.approvedRevisionLabel && plan.approvedRevisionId) {
        const approvalEntry: ModeExecutionPlanHistoryEntryView = {
            id: `approval-${plan.approvedRevisionId}`,
            kind: 'approval',
            title: 'Approved revision',
            description: `The plan was approved on ${state.approvedRevisionLabel}.`,
            revisionLabel: state.approvedRevisionLabel,
            ...(state.approvedVariantLabel ? { variantLabel: state.approvedVariantLabel } : {}),
        };
        entries.push(approvalEntry);
    }

    entries.push({
        id: `revision-${plan.currentRevisionId}`,
        kind: 'revision',
        title: 'Current revision',
        description: `The active draft is ${state.currentRevisionLabel}.`,
        revisionLabel: state.currentRevisionLabel,
        variantLabel: state.currentVariantLabel,
        actions: [
            {
                label: 'Resume From Here',
                kind: 'resume_from_here',
                revisionId: plan.currentRevisionId,
            },
            {
                label: 'Branch From Here',
                kind: 'branch_from_here',
                revisionId: plan.currentRevisionId,
            },
        ],
    });

    if (plan.status === 'cancelled') {
        entries.push({
            id: `cancellation-${plan.id}`,
            kind: 'cancellation',
            title: 'Plan cancelled',
            description: 'The plan was cancelled, but its revision history remains available for recovery.',
        });
    } else if (plan.status === 'failed') {
        entries.push({
            id: `implementation-${plan.id}`,
            kind: 'implementation',
            title: 'Implementation failed',
            description: 'The latest implementation attempt failed and the plan remains recoverable.',
        });
    } else if (plan.status === 'implemented') {
        entries.push({
            id: `implementation-${plan.id}`,
            kind: 'implementation',
            title: 'Implementation completed',
            description: 'The approved plan completed execution.',
        });
    }

    if (state.hasOpenFollowUps) {
        for (const followUp of state.followUps) {
            if (followUp.status !== 'open') {
                continue;
            }

            entries.push({
                id: `follow-up-${followUp.id}`,
                kind: 'follow_up_raised',
                title: 'Open follow-up',
                description: followUp.promptMarkdown,
                followUpLabel: `${followUp.kind.replace('_', ' ')} · ${followUp.status}`,
                actions: [
                    {
                        label: 'View Follow-Up',
                        kind: 'view_follow_up',
                        followUpId: followUp.id,
                    },
                ],
            });
        }
    }

    return entries;
}

function deriveRecoveryBanner(input: {
    plan: ModeExecutionPlanView;
    currentRevisionLabel: string;
    currentVariantLabel: string;
    approvedVariantLabel: string | undefined;
    approvedVariantId: EntityId<'pvar'> | undefined;
    approvedRevisionLabel: string | undefined;
    hasOpenFollowUps: boolean;
    openFollowUpCount: number;
}): ModeExecutionPlanRecoveryBannerView | undefined {
    const actions: ModeExecutionPlanTimelineActionView[] = [];

    if (input.plan.status === 'failed' || input.plan.status === 'cancelled') {
        actions.push({
            label: 'Resume Editing',
            kind: 'resume_editing',
        });
    }

    if (input.hasOpenFollowUps) {
        const openFollowUpId = input.plan.followUps.find((followUp) => followUp.status === 'open')?.id;
        actions.push({
            label: 'Resolve Follow-Up',
            kind: 'resolve_follow_up',
            ...(openFollowUpId ? { followUpId: openFollowUpId } : {}),
        });
    }

    if (input.approvedVariantId && input.approvedVariantId !== input.plan.currentVariantId) {
        actions.push({
            label: 'Switch To Approved Variant',
            kind: 'switch_to_variant',
            variantId: input.approvedVariantId,
        });
    }

    if (actions.length === 0) {
        return undefined;
    }

    if (input.hasOpenFollowUps) {
        return {
            title: 'Recovery required',
            message: `There ${input.openFollowUpCount === 1 ? 'is 1 open follow-up' : `are ${String(input.openFollowUpCount)} open follow-ups`} that should be resolved before approving this plan.`,
            actions,
        };
    }

    if (input.plan.status === 'failed') {
        return {
            title: 'Recovery required',
            message: `The latest implementation failed on ${input.currentRevisionLabel}. Review the history and resume from a safe revision or branch a new variant.`,
            actions,
        };
    }

    if (input.plan.status === 'cancelled') {
        return {
            title: 'Plan cancelled',
            message:
                'This plan was cancelled. You can resume from history or branch a new variant without losing prior revisions.',
            actions,
        };
    }

    if (input.approvedVariantLabel && input.approvedVariantId !== input.plan.currentVariantId) {
        return {
            title: 'Approval review needed',
            message: `The current draft is on ${input.currentVariantLabel}, while the last approved variant is ${input.approvedVariantLabel}.`,
            actions,
        };
    }

    return undefined;
}

export function resolveModeExecutionPlanArtifactState(input: {
    activePlan: ModeExecutionPlanView | undefined;
}): ModeExecutionPlanArtifactState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    const plan = input.activePlan;
    const planVariants = Array.isArray(plan.variants) ? plan.variants : [];
    const planFollowUps = Array.isArray(plan.followUps) ? plan.followUps : [];
    const planHistory = Array.isArray(plan.history) ? plan.history : [];
    const planResearchBatches = Array.isArray(plan.researchBatches) ? plan.researchBatches : [];
    const currentRevisionResearchBatches = planResearchBatches.filter(
        (batch) => batch.planRevisionId === plan.currentRevisionId
    );
    const hasRunningResearchBatch = currentRevisionResearchBatches.some((batch) => batch.status === 'running');
    const revisionLabelById = new Map<EntityId<'prev'>, string>();
    revisionLabelById.set(plan.currentRevisionId, readRevisionLabel(plan.currentRevisionNumber, plan.currentRevisionId));
    if (plan.approvedRevisionId && plan.approvedRevisionNumber !== undefined) {
        revisionLabelById.set(
            plan.approvedRevisionId,
            readRevisionLabel(plan.approvedRevisionNumber, plan.approvedRevisionId)
        );
    }
    for (const variant of planVariants) {
        revisionLabelById.set(
            variant.currentRevisionId,
            readRevisionLabel(variant.currentRevisionNumber, variant.currentRevisionId)
        );
    }

    const variants = planVariants.map((variant) =>
        mapVariantView(variant, {
            currentVariantId: plan.currentVariantId,
            ...(plan.approvedVariantId ? { approvedVariantId: plan.approvedVariantId } : {}),
        })
    );
    const variantNameById = new Map(variants.map((variant) => [variant.id, variant.name]));
    const followUps = planFollowUps.map((followUp) => mapFollowUpView(followUp, revisionLabelById));
    const followUpById = new Map(followUps.map((followUp) => [followUp.id, followUp]));
    const openFollowUps = followUps.filter((followUp) => followUp.status === 'open');
    const currentVariant = variants.find((variant) => variant.id === plan.currentVariantId);
    const approvedVariant = plan.approvedVariantId
        ? variants.find((variant) => variant.id === plan.approvedVariantId)
        : undefined;
    const approvedRevisionLabel = plan.approvedRevisionId
        ? readRevisionLabel(plan.approvedRevisionNumber ?? plan.currentRevisionNumber, plan.approvedRevisionId)
        : undefined;
    const currentRevisionLabel = readRevisionLabel(plan.currentRevisionNumber, plan.currentRevisionId);
    const hasApprovedRevision = Boolean(plan.approvedRevisionId);
    const approvedRevisionMatchesCurrent = plan.approvedRevisionId === plan.currentRevisionId;
    const currentVariantLabel = readVariantLabel(currentVariant, plan.currentVariantName) ?? 'Current variant';
    const approvedVariantLabel = plan.approvedVariantId
        ? readVariantLabel(approvedVariant, plan.approvedVariantName ?? plan.approvedVariantId)
        : undefined;
    const planningDepth = plan.planningDepth ?? 'simple';
    const history = planHistory.length
        ? sortHistoryEntriesNewestFirst(
              planHistory.map((entry) =>
                  mapHistoryEntryView(entry, {
                      revisionLabelById,
                      variantNameById,
                      followUpById,
                  })
              )
          )
        : buildFallbackHistoryEntries(plan, {
              currentRevisionLabel,
              approvedRevisionLabel,
              currentVariantLabel,
              approvedVariantLabel,
              hasOpenFollowUps: openFollowUps.length > 0,
              followUps,
          });
    const recoveryBanner = mapRecoveryBanner(plan.recoveryBanner)
        ?? deriveRecoveryBanner({
            plan,
            currentRevisionLabel,
            currentVariantLabel,
            approvedVariantLabel,
            approvedVariantId: plan.approvedVariantId,
            approvedRevisionLabel,
            hasOpenFollowUps: openFollowUps.length > 0,
            openFollowUpCount: openFollowUps.length,
        });

    return {
        planningDepth,
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
        currentVariantLabel,
        approvedVariantLabel,
        variantComparisonLabel: approvedVariantLabel
            ? plan.currentVariantId === plan.approvedVariantId
                ? 'The current variant matches the approved variant.'
                : `The current variant is ${currentVariantLabel}, while the approved variant is ${approvedVariantLabel}.`
            : `The current variant is ${currentVariantLabel}.`,
        variants,
        followUps,
        history,
        recoveryBanner,
        currentVariantId: plan.currentVariantId,
        approvedVariantId: plan.approvedVariantId,
        hasOpenFollowUps: openFollowUps.length > 0,
        hasRunningResearchBatch,
        questionsEditable: plan.status === 'awaiting_answers',
        readyToImplement: plan.status === 'approved' && openFollowUps.length === 0,
        canGenerateDraft: canGenerateDraft(plan) && !hasRunningResearchBatch,
        canRevise:
            !hasRunningResearchBatch &&
            (plan.status === 'draft' ||
                plan.status === 'approved' ||
                plan.status === 'implemented' ||
                plan.status === 'failed' ||
                plan.status === 'cancelled'),
        canApprove:
            !hasRunningResearchBatch &&
            (plan.status === 'draft' || plan.status === 'failed' || plan.status === 'cancelled') &&
            openFollowUps.length === 0,
        canImplement: !hasRunningResearchBatch && plan.status === 'approved' && openFollowUps.length === 0,
        canCancel:
            plan.status === 'awaiting_answers' ||
            plan.status === 'draft' ||
            plan.status === 'approved' ||
            plan.status === 'failed',
        canEnterAdvancedPlanning:
            !hasRunningResearchBatch && planningDepth === 'simple' && plan.status !== 'implementing',
    };
}

export function resolveModeExecutionPlanResearchArtifactState(input: {
    activePlan: ModeExecutionPlanView | undefined;
}): ModeExecutionPlanResearchArtifactState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    const plan = input.activePlan;
    const researchBatches = Array.isArray(plan.researchBatches) ? plan.researchBatches : [];
    const currentRevisionBatches = researchBatches
        .filter((batch) => batch.planRevisionId === plan.currentRevisionId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const historicalBatches = researchBatches
        .filter((batch) => batch.planRevisionId !== plan.currentRevisionId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const activeBatch = currentRevisionBatches.find((batch) => batch.status === 'running');
    const hasRunningResearchBatch = Boolean(activeBatch);
    const isEditableAdvancedPlan =
        plan.planningDepth === 'advanced' && (plan.status === 'awaiting_answers' || plan.status === 'draft');

    return {
        currentRevisionBatches,
        historicalBatches,
        evidenceAttachments: Array.isArray(plan.evidenceAttachments) ? plan.evidenceAttachments : [],
        ...(plan.researchRecommendation ? { recommendation: plan.researchRecommendation } : {}),
        ...(plan.researchCapacity ? { capacity: plan.researchCapacity } : {}),
        ...(activeBatch ? { activeBatch } : {}),
        hasRunningResearchBatch,
        canStartResearch: isEditableAdvancedPlan && !hasRunningResearchBatch,
        canAbortActiveResearchBatch: hasRunningResearchBatch,
    };
}

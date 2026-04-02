import type {
    OrchestratorExecutionStrategy,
    PlanStatus,
    RuntimeProviderId,
    TopLevelTab,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { RuntimeRunOptions } from '@/app/backend/runtime/contracts/types/session';

export type PlanQuestionCategory =
    | 'goal'
    | 'deliverable'
    | 'constraints'
    | 'environment'
    | 'validation'
    | 'missing_context';

export interface PlanQuestion {
    id: string;
    question: string;
    category: PlanQuestionCategory;
    required: boolean;
    placeholderText?: string;
    helpText?: string;
    answer?: string;
}

export type PlanPlanningDepth = 'simple' | 'advanced';

export interface PlanDraftItemInput {
    description: string;
}

export interface PlanPhaseOutlineInput {
    id: string;
    sequence: number;
    title: string;
    goalMarkdown: string;
    exitCriteriaMarkdown: string;
}

export type PlanPhaseOutlineView = PlanPhaseOutlineInput;

export interface PlanAdvancedSnapshotInput {
    evidenceMarkdown: string;
    observationsMarkdown: string;
    rootCauseMarkdown: string;
    phases: PlanPhaseOutlineInput[];
}

export interface PlanAdvancedSnapshotView extends PlanAdvancedSnapshotInput {
    createdAt: string;
}

export type PlanResearchBatchStatus = 'running' | 'completed' | 'failed' | 'aborted';

export type PlanResearchWorkerStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted';

export interface PlanResearchCapacityView {
    availableParallelism: number;
    recommendedWorkerCount: number;
    hardMaxWorkerCount: number;
}

export type PlanResearchRecommendationPriority = 'low' | 'medium' | 'high';

export interface PlanResearchRecommendationView {
    recommended: boolean;
    priority: PlanResearchRecommendationPriority;
    reasons: string[];
    suggestedWorkerCount: number;
}

export interface PlanResearchWorkerView {
    id: EntityId<'prw'>;
    batchId: EntityId<'prb'>;
    sequence: number;
    label: string;
    promptMarkdown: string;
    status: PlanResearchWorkerStatus;
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    activeRunId?: EntityId<'run'>;
    runId?: EntityId<'run'>;
    resultSummaryMarkdown?: string;
    resultDetailsMarkdown?: string;
    errorMessage?: string;
    createdAt: string;
    completedAt?: string;
    abortedAt?: string;
}

export interface PlanResearchBatchView {
    id: EntityId<'prb'>;
    planId: EntityId<'plan'>;
    planRevisionId: EntityId<'prev'>;
    variantId: EntityId<'pvar'>;
    promptMarkdown: string;
    requestedWorkerCount: number;
    recommendedWorkerCount: number;
    hardMaxWorkerCount: number;
    status: PlanResearchBatchStatus;
    workers: PlanResearchWorkerView[];
    createdAt: string;
    completedAt?: string;
    abortedAt?: string;
}

export interface PlanEvidenceAttachmentView {
    id: EntityId<'pea'>;
    planRevisionId: EntityId<'prev'>;
    sourceKind: 'planner_worker';
    researchBatchId: EntityId<'prb'>;
    researchWorkerId: EntityId<'prw'>;
    label: string;
    summaryMarkdown: string;
    detailsMarkdown: string;
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    createdAt: string;
}

export interface PlanCreateVariantInput extends PlanGetInput {
    sourceRevisionId: EntityId<'prev'>;
}

export interface PlanActivateVariantInput extends PlanGetInput {
    variantId: EntityId<'pvar'>;
}

export interface PlanResumeFromRevisionInput extends PlanGetInput {
    sourceRevisionId: EntityId<'prev'>;
    variantId?: EntityId<'pvar'>;
}

export interface PlanRaiseFollowUpInput extends PlanGetInput {
    kind: 'missing_context' | 'missing_file';
    promptMarkdown: string;
    sourceRevisionId?: EntityId<'prev'>;
}

export interface PlanResolveFollowUpInput extends PlanGetInput {
    followUpId: EntityId<'pfu'>;
    status: 'resolved' | 'dismissed';
    responseMarkdown?: string;
}

export interface PlanStartInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    prompt: string;
    planningDepth?: PlanPlanningDepth;
    workspaceFingerprint?: string;
}

export interface PlanStartResearchBatchInput extends PlanGetInput {
    promptMarkdown: string;
    workerCount: number;
    runtimeOptions: RuntimeRunOptions;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
}

export interface PlanAbortResearchBatchInput extends PlanGetInput {
    researchBatchId: EntityId<'prb'>;
}

export interface PlanGetInput extends ProfileInput {
    planId: EntityId<'plan'>;
}

export interface PlanGetActiveInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
}

export interface PlanAnswerQuestionInput extends PlanGetInput {
    questionId: string;
    answer: string;
}

export interface PlanReviseInput extends PlanGetInput {
    summaryMarkdown: string;
    items: PlanDraftItemInput[];
    advancedSnapshot?: PlanAdvancedSnapshotInput;
}

export type PlanEnterAdvancedPlanningInput = PlanGetInput;

export interface PlanApproveInput extends PlanGetInput {
    revisionId: EntityId<'prev'>;
}

export interface PlanGenerateDraftInput extends PlanGetInput {
    runtimeOptions: RuntimeRunOptions;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
}

export type PlanCancelInput = PlanGetInput;

export interface PlanVariantView {
    id: EntityId<'pvar'>;
    name: string;
    createdFromRevisionId?: EntityId<'prev'>;
    currentRevisionId: EntityId<'prev'>;
    currentRevisionNumber: number;
    isCurrent: boolean;
    isApproved: boolean;
    createdAt: string;
    archivedAt?: string;
}

export interface PlanFollowUpView {
    id: EntityId<'pfu'>;
    planId: EntityId<'plan'>;
    variantId: EntityId<'pvar'>;
    sourceRevisionId?: EntityId<'prev'>;
    kind: 'missing_context' | 'missing_file';
    status: 'open' | 'resolved' | 'dismissed';
    promptMarkdown: string;
    responseMarkdown?: string;
    createdByKind: 'user' | 'system';
    createdAt: string;
    resolvedAt?: string;
    dismissedAt?: string;
}

export interface PlanHistoryEntryAction {
    kind: 'resume_from_here' | 'branch_from_here' | 'view_follow_up';
    label: string;
    revisionId?: EntityId<'prev'> | undefined;
    variantId?: EntityId<'pvar'> | undefined;
    followUpId?: EntityId<'pfu'> | undefined;
}

export interface PlanHistoryEntry {
    id: string;
    kind:
        | 'plan_started'
        | 'revision_created'
        | 'revision_approved'
        | 'implementation_started'
        | 'implementation_completed'
        | 'implementation_failed'
        | 'plan_cancelled'
        | 'variant_created'
        | 'variant_activated'
        | 'plan_resumed'
        | 'follow_up_raised'
        | 'follow_up_resolved';
    title: string;
    detail?: string;
    createdAt: string;
    revisionId?: EntityId<'prev'> | undefined;
    revisionNumber?: number | undefined;
    variantId?: EntityId<'pvar'> | undefined;
    variantName?: string | undefined;
    followUpId?: EntityId<'pfu'> | undefined;
    followUpKind?: 'missing_context' | 'missing_file' | undefined;
    actions?: PlanHistoryEntryAction[] | undefined;
}

export interface PlanRecoveryBannerAction {
    kind: 'resume_editing' | 'resolve_follow_up' | 'switch_to_approved_variant';
    label: string;
    revisionId?: EntityId<'prev'> | undefined;
    variantId?: EntityId<'pvar'> | undefined;
    followUpId?: EntityId<'pfu'> | undefined;
}

export interface PlanRecoveryBanner {
    tone: 'info' | 'warning' | 'destructive';
    title: string;
    message: string;
    actions: PlanRecoveryBannerAction[];
}

export interface PlanImplementInput extends PlanGetInput {
    runtimeOptions: RuntimeRunOptions;
    executionStrategy?: OrchestratorExecutionStrategy;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
}

export interface PlanRecordView {
    id: EntityId<'plan'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    planningDepth?: PlanPlanningDepth;
    status: PlanStatus;
    sourcePrompt: string;
    summaryMarkdown: string;
    advancedSnapshot?: PlanAdvancedSnapshotView;
    researchBatches?: PlanResearchBatchView[];
    evidenceAttachments?: PlanEvidenceAttachmentView[];
    researchRecommendation?: PlanResearchRecommendationView;
    researchCapacity?: PlanResearchCapacityView;
    currentRevisionId: EntityId<'prev'>;
    currentRevisionNumber: number;
    currentVariantId: EntityId<'pvar'>;
    currentVariantName: string;
    approvedRevisionId?: EntityId<'prev'>;
    approvedRevisionNumber?: number;
    approvedVariantId?: EntityId<'pvar'>;
    approvedVariantName?: string;
    questions: PlanQuestion[];
    variants: PlanVariantView[];
    followUps: PlanFollowUpView[];
    history: PlanHistoryEntry[];
    recoveryBanner?: PlanRecoveryBanner;
    items: Array<{
        id: EntityId<'step'>;
        sequence: number;
        description: string;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
        runId?: EntityId<'run'>;
        errorMessage?: string;
    }>;
    workspaceFingerprint?: string;
    implementationRunId?: EntityId<'run'>;
    orchestratorRunId?: EntityId<'orch'>;
    approvedAt?: string;
    implementedAt?: string;
    createdAt: string;
    updatedAt: string;
}

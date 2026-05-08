import type {
    OrchestratorExecutionStrategy,
    OrchestratorLazyCapabilityGroup,
    OrchestratorLazyCheckpointKind,
    OrchestratorLazyCheckpointStatus,
    OrchestratorLazyDecisionStatus,
    OrchestratorLazyExecutionKind,
    OrchestratorLazyExecutionPhaseKind,
    OrchestratorLazyObjectiveSegmentKind,
    OrchestratorLazyObjectiveStatus,
    OrchestratorLazyPackageAssessmentStatus,
    OrchestratorLazyPackagePolicy,
    OrchestratorLazyResearchDepth,
    OrchestratorLazyTaskStatus,
    OrchestratorLazyWorkingArtifactKind,
    OrchestratorRunStatus,
    OrchestratorSwarmContextEntryKind,
    OrchestratorSwarmLaneStatus,
    OrchestratorSwarmRole,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { RuntimeRunOptions } from '@/app/backend/runtime/contracts/types/session';

export interface OrchestratorStartInput extends ProfileInput {
    planId: EntityId<'plan'>;
    planPhaseId?: string;
    planPhaseRevisionId?: string;
    runtimeOptions: RuntimeRunOptions;
    executionStrategy?: OrchestratorExecutionStrategy;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
    lazyObjective?: OrchestratorLazyObjectiveInput;
}

export interface OrchestratorLazyObjectiveInput {
    objectiveMarkdown: string;
    successCriteriaMarkdown?: string;
    constraintsMarkdown?: string;
    evidenceRequirementsMarkdown?: string;
    allowedCapabilityGroups: OrchestratorLazyCapabilityGroup[];
    researchDepth: OrchestratorLazyResearchDepth;
    packagePolicy: OrchestratorLazyPackagePolicy;
}

export interface OrchestratorLazyStartInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
    objectiveMarkdown: string;
    successCriteriaMarkdown?: string;
    constraintsMarkdown?: string;
    evidenceRequirementsMarkdown?: string;
    allowedCapabilityGroups: OrchestratorLazyCapabilityGroup[];
    researchDepth: OrchestratorLazyResearchDepth;
    packagePolicy: OrchestratorLazyPackagePolicy;
    runtimeOptions: RuntimeRunOptions;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
}

export interface OrchestratorLazyCheckpointResolutionInput extends ProfileInput {
    checkpointId: EntityId<'lchk'>;
    status: Extract<OrchestratorLazyCheckpointStatus, 'resolved' | 'cancelled'>;
    responseMarkdown?: string;
}

export interface OrchestratorRunByIdInput extends ProfileInput {
    orchestratorRunId: EntityId<'orch'>;
}

export interface OrchestratorRunBySessionInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
}

export interface OrchestratorSwarmLaneView {
    id: EntityId<'olane'>;
    orchestratorRunId: EntityId<'orch'>;
    stepId?: EntityId<'step'>;
    sequence: number;
    role: OrchestratorSwarmRole;
    status: OrchestratorSwarmLaneStatus;
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    activeRunId?: EntityId<'run'>;
    runId?: EntityId<'run'>;
    promptMarkdown: string;
    resultSummaryMarkdown?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorSwarmContextEntryView {
    id: EntityId<'octx'>;
    orchestratorRunId: EntityId<'orch'>;
    sourceLaneId?: EntityId<'olane'>;
    sequence: number;
    entryKind: OrchestratorSwarmContextEntryKind;
    contentMarkdown: string;
    createdAt: string;
}

export interface OrchestratorLazyObjectiveView {
    id: EntityId<'lobj'>;
    orchestratorRunId: EntityId<'orch'>;
    objectiveMarkdown: string;
    successCriteriaMarkdown?: string;
    constraintsMarkdown?: string;
    evidenceRequirementsMarkdown?: string;
    allowedCapabilityGroups: OrchestratorLazyCapabilityGroup[];
    researchDepth: OrchestratorLazyResearchDepth;
    packagePolicy: OrchestratorLazyPackagePolicy;
    status: OrchestratorLazyObjectiveStatus;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorLazyObjectiveSegmentView {
    id: EntityId<'lseg'>;
    orchestratorRunId: EntityId<'orch'>;
    objectiveId: EntityId<'lobj'>;
    sequence: number;
    kind: OrchestratorLazyObjectiveSegmentKind;
    contentMarkdown: string;
    createdAt: string;
}

export interface OrchestratorLazyTaskView {
    id: EntityId<'ltask'>;
    orchestratorRunId: EntityId<'orch'>;
    parentTaskId?: EntityId<'ltask'>;
    stepId?: EntityId<'step'>;
    sequence: number;
    title: string;
    descriptionMarkdown: string;
    executionKind: OrchestratorLazyExecutionKind;
    status: OrchestratorLazyTaskStatus;
    dependencyTaskIds: Array<EntityId<'ltask'>>;
    verificationMarkdown?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorLazyInteractionCheckpointView {
    id: EntityId<'lchk'>;
    orchestratorRunId: EntityId<'orch'>;
    taskId?: EntityId<'ltask'>;
    kind: OrchestratorLazyCheckpointKind;
    status: OrchestratorLazyCheckpointStatus;
    promptMarkdown: string;
    choicesJson?: string;
    responseMarkdown?: string;
    resumeToken?: string;
    createdAt: string;
    resolvedAt?: string;
    cancelledAt?: string;
}

export interface OrchestratorLazyTechDecisionView {
    id: EntityId<'ldec'>;
    orchestratorRunId: EntityId<'orch'>;
    taskId?: EntityId<'ltask'>;
    title: string;
    decisionMarkdown: string;
    rationaleMarkdown: string;
    status: OrchestratorLazyDecisionStatus;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorLazyPackageAssessmentView {
    id: EntityId<'lpkg'>;
    orchestratorRunId: EntityId<'orch'>;
    taskId?: EntityId<'ltask'>;
    packageName: string;
    ecosystem?: string;
    requestedVersion?: string;
    assessmentMarkdown: string;
    status: OrchestratorLazyPackageAssessmentStatus;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorLazyWorkingArtifactView {
    id: EntityId<'lart'>;
    orchestratorRunId: EntityId<'orch'>;
    taskId?: EntityId<'ltask'>;
    kind: OrchestratorLazyWorkingArtifactKind;
    title: string;
    contentMarkdown: string;
    sourceRunId?: EntityId<'run'>;
    createdAt: string;
}

export interface OrchestratorLazyExecutionPhaseView {
    id: EntityId<'lphase'>;
    orchestratorRunId: EntityId<'orch'>;
    taskId?: EntityId<'ltask'>;
    sequence: number;
    phaseKind: OrchestratorLazyExecutionPhaseKind;
    executionKind?: OrchestratorLazyExecutionKind;
    status: OrchestratorLazyTaskStatus;
    childRunId?: EntityId<'run'>;
    summaryMarkdown?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorLazyWalkthroughView {
    id: EntityId<'lwalk'>;
    orchestratorRunId: EntityId<'orch'>;
    contentMarkdown: string;
    validationSummaryMarkdown?: string;
    riskMarkdown?: string;
    createdAt: string;
}

export interface OrchestratorLazyProjectionView {
    objective?: OrchestratorLazyObjectiveView;
    objectiveSegments: OrchestratorLazyObjectiveSegmentView[];
    taskTree: OrchestratorLazyTaskView[];
    checkpoints: OrchestratorLazyInteractionCheckpointView[];
    techDecisions: OrchestratorLazyTechDecisionView[];
    packageAssessments: OrchestratorLazyPackageAssessmentView[];
    workingArtifacts: OrchestratorLazyWorkingArtifactView[];
    executionPhases: OrchestratorLazyExecutionPhaseView[];
    walkthrough?: OrchestratorLazyWalkthroughView;
}

export interface OrchestratorStepView {
    id: EntityId<'step'>;
    sequence: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    activeRunId?: EntityId<'run'>;
    runId?: EntityId<'run'>;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorRunView {
    id: EntityId<'orch'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    planId: EntityId<'plan'>;
    planRevisionId: EntityId<'prev'>;
    planPhaseId?: string;
    planPhaseRevisionId?: string;
    status: OrchestratorRunStatus;
    executionStrategy: OrchestratorExecutionStrategy;
    activeStepIndex?: number;
    startedAt: string;
    completedAt?: string;
    abortedAt?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
    steps: OrchestratorStepView[];
    swarmLanes: OrchestratorSwarmLaneView[];
    swarmContextEntries: OrchestratorSwarmContextEntryView[];
    lazy?: OrchestratorLazyProjectionView;
}

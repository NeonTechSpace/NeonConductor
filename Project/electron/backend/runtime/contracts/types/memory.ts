import type {
    MemoryCreatedByKind,
    MemoryRetentionClass,
    MemoryScopeKind,
    MemoryState,
    MemoryType,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type {
    PromotionProvenance,
    PromotionSource,
    PromotionSourceSummary,
} from '@/app/backend/runtime/contracts/types/promotion';

import type { RuntimeProviderId } from '@/shared/contracts';

export interface MemoryRecord {
    id: EntityId<'mem'>;
    profileId: string;
    memoryType: MemoryType;
    scopeKind: MemoryScopeKind;
    state: MemoryState;
    createdByKind: MemoryCreatedByKind;
    title: string;
    canonicalBody: MemoryCanonicalBody;
    bodyMarkdown: string;
    summaryText?: string;
    metadata: Record<string, unknown>;
    memoryRetentionClass: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    retentionSupersedenceRationale?: string;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    temporalSubjectKey?: string;
    supersededByMemoryId?: EntityId<'mem'>;
    createdAt: string;
    updatedAt: string;
}

export const memoryCanonicalBodySectionKinds = ['summary', 'fact', 'event', 'procedure', 'note'] as const;
export type MemoryCanonicalBodySectionKind = (typeof memoryCanonicalBodySectionKinds)[number];

export interface MemoryCanonicalBodySection {
    id: string;
    kind: MemoryCanonicalBodySectionKind;
    heading: string;
    items: string[];
}

export interface MemoryCanonicalBody {
    formatVersion: 1;
    sections: MemoryCanonicalBodySection[];
}

export const memoryRevisionReasons = ['correction', 'refinement', 'deprecation', 'runtime_refresh'] as const;
export type MemoryRevisionReason = (typeof memoryRevisionReasons)[number];

export interface MemoryRevisionRecord {
    id: EntityId<'mrev'>;
    profileId: string;
    previousMemoryId: EntityId<'mem'>;
    replacementMemoryId: EntityId<'mem'>;
    revisionReason: MemoryRevisionReason;
    createdAt: string;
}

export const memoryConsolidationSources = ['episodic_pattern', 'manual_seed'] as const;
export type MemoryConsolidationSource = (typeof memoryConsolidationSources)[number];

export const memoryConsolidationStates = ['candidate', 'materialized', 'superseded', 'rejected'] as const;
export type MemoryConsolidationState = (typeof memoryConsolidationStates)[number];

export interface MemoryConsolidationRecord {
    id: EntityId<'mcon'>;
    profileId: string;
    subjectKey: string;
    targetMemoryType: Extract<MemoryType, 'semantic' | 'procedural'>;
    scopeKind: MemoryScopeKind;
    sourceConsolidation: MemoryConsolidationSource;
    state: MemoryConsolidationState;
    candidateTitle: string;
    candidateBodyMarkdown: string;
    candidateSummaryText?: string;
    evidenceMemoryIds: EntityId<'mem'>[];
    materializedMemoryId?: EntityId<'mem'>;
    sourceDigest: string;
    createdAt: string;
    updatedAt: string;
}

export const memoryEvidenceKinds = ['run', 'message', 'message_part', 'tool_result_artifact'] as const;
export type MemoryEvidenceKind = (typeof memoryEvidenceKinds)[number];

export interface MemoryEvidenceRecord {
    id: EntityId<'mev'>;
    profileId: string;
    memoryId: EntityId<'mem'>;
    sequence: number;
    kind: MemoryEvidenceKind;
    label: string;
    excerptText?: string;
    sourceRunId?: EntityId<'run'>;
    sourceMessageId?: EntityId<'msg'>;
    sourceMessagePartId?: EntityId<'part'>;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface MemoryEvidenceSummary {
    id: EntityId<'mev'>;
    kind: MemoryEvidenceKind;
    label: string;
    excerptText?: string;
    sourceRunId?: EntityId<'run'>;
    sourceMessageId?: EntityId<'msg'>;
    sourceMessagePartId?: EntityId<'part'>;
}

export interface MemoryEvidenceCreateInput {
    kind: MemoryEvidenceKind;
    label: string;
    excerptText?: string;
    sourceRunId?: EntityId<'run'>;
    sourceMessageId?: EntityId<'msg'>;
    sourceMessagePartId?: EntityId<'part'>;
    metadata?: Record<string, unknown>;
}

export interface MemoryEmbeddingIndexRecord {
    id: EntityId<'mvec'>;
    profileId: string;
    memoryId: EntityId<'mem'>;
    providerId: RuntimeProviderId;
    modelId: string;
    sourceDigest: string;
    indexedText: string;
    embedding: number[];
    dimensions: number;
    createdAt: string;
    updatedAt: string;
}

export const memoryTemporalFactStatuses = ['current', 'superseded', 'disabled', 'conflicted'] as const;
export type MemoryTemporalFactStatus = (typeof memoryTemporalFactStatuses)[number];

export const memoryCausalRelationTypes = [
    'derived_from',
    'caused_by',
    'supersedes',
    'observed_in_run',
    'observed_in_thread',
    'observed_in_workspace',
] as const;
export type MemoryCausalRelationType =
    | 'derived_from'
    | 'caused_by'
    | 'supersedes'
    | 'observed_in_run'
    | 'observed_in_thread'
    | 'observed_in_workspace';

export const memoryDerivedEntityKinds = ['memory', 'run', 'thread', 'workspace'] as const;
export type MemoryDerivedEntityKind = (typeof memoryDerivedEntityKinds)[number];

export interface MemoryTemporalFactRecord {
    id: EntityId<'mfact'>;
    profileId: string;
    subjectKey: string;
    factKind: MemoryType;
    value: Record<string, unknown>;
    status: MemoryTemporalFactStatus;
    validFrom: string;
    validTo?: string;
    sourceMemoryId: EntityId<'mem'>;
    sourceRunId?: EntityId<'run'>;
    derivationVersion: number;
    confidence?: number;
    createdAt: string;
    updatedAt: string;
}

export interface MemoryCausalLinkRecord {
    id: EntityId<'mlink'>;
    profileId: string;
    sourceEntityKind: MemoryDerivedEntityKind;
    sourceEntityId: string;
    targetEntityKind: MemoryDerivedEntityKind;
    targetEntityId: string;
    relationType: MemoryCausalRelationType;
    sourceMemoryId: EntityId<'mem'>;
    sourceRunId?: EntityId<'run'>;
    createdAt: string;
    updatedAt: string;
}

export const memoryGraphEdgeKinds = [
    'same_subject',
    'same_run',
    'same_thread',
    'same_workspace',
    'revision_predecessor',
    'revision_successor',
    'evidence_overlap',
] as const;
export type MemoryGraphEdgeKind = (typeof memoryGraphEdgeKinds)[number];

export interface MemoryGraphEdgeRecord {
    id: EntityId<'medge'>;
    profileId: string;
    sourceMemoryId: EntityId<'mem'>;
    targetMemoryId: EntityId<'mem'>;
    edgeKind: MemoryGraphEdgeKind;
    weight: number;
    derivationVersion: number;
    createdAt: string;
    updatedAt: string;
}

export interface MemoryStrengthSummary {
    recencyScore: number;
    evidenceCount: number;
    reuseCount: number;
    importanceScore: number;
    confidenceScore: number;
}

export interface MemoryDerivedSummary {
    temporalStatus?: MemoryTemporalFactStatus;
    temporalSubjectKey?: string;
    hasTemporalHistory: boolean;
    currentTruthMemoryId?: EntityId<'mem'>;
    conflictingCurrentMemoryIds: EntityId<'mem'>[];
    predecessorMemoryIds: EntityId<'mem'>[];
    successorMemoryId?: EntityId<'mem'>;
    incomingRevisionReason?: MemoryRevisionReason;
    outgoingRevisionReason?: MemoryRevisionReason;
    strength?: MemoryStrengthSummary;
    graphNeighborCount: number;
    linkedRunIds: EntityId<'run'>[];
    linkedThreadIds: EntityId<'thr'>[];
    linkedWorkspaceFingerprints: string[];
}

export type RetrievedMemoryMatchReason =
    | 'exact_run'
    | 'exact_thread'
    | 'exact_workspace'
    | 'exact_global'
    | 'structured'
    | 'derived_temporal'
    | 'derived_causal'
    | 'graph_expanded'
    | 'semantic'
    | 'prompt';

export interface RetrievedMemoryRecord {
    memoryId: EntityId<'mem'>;
    title: string;
    memoryType: MemoryType;
    scopeKind: MemoryScopeKind;
    matchReason: RetrievedMemoryMatchReason;
    order: number;
    sourceMemoryId?: EntityId<'mem'>;
    annotations?: string[];
    derivedSummary?: MemoryDerivedSummary;
    supportingEvidence: MemoryEvidenceSummary[];
}

export interface RetrievedMemorySummary {
    records: RetrievedMemoryRecord[];
    injectedTextLength: number;
}

export interface MemoryCreateInput extends ProfileInput {
    memoryType: MemoryType;
    scopeKind: MemoryScopeKind;
    createdByKind: MemoryCreatedByKind;
    title: string;
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    temporalSubjectKey?: string;
    evidence?: MemoryEvidenceCreateInput[];
}

export type MemoryPromotionScopeKind = Extract<MemoryScopeKind, 'global' | 'workspace' | 'thread'>;

export interface MemoryPromotionDraft {
    target: 'memory';
    memoryType: MemoryType;
    scopeKind: MemoryPromotionScopeKind;
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
}

export interface MemoryPreparePromotionInput extends ProfileInput {
    source: PromotionSource;
    workspaceFingerprint?: string;
}

export interface MemoryApplyPromotionInput extends ProfileInput {
    source: PromotionSource;
    sourceDigest: string;
    draft: MemoryPromotionDraft;
}

export interface MemoryPreparePromotionResult {
    source: PromotionSourceSummary;
    draft: MemoryPromotionDraft;
    provenance: PromotionProvenance;
}

export interface MemoryApplyPromotionResult {
    promoted: {
        target: 'memory';
        memoryId: EntityId<'mem'>;
        title: string;
        memoryType: MemoryType;
        scopeKind: MemoryScopeKind;
    };
    memory: MemoryRecord;
}

export interface MemoryListInput extends ProfileInput {
    memoryType?: MemoryType;
    scopeKind?: MemoryScopeKind;
    state?: MemoryState;
    memoryRetentionClass?: MemoryRetentionClass;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
}

export interface MemoryByIdInput extends ProfileInput {
    memoryId: EntityId<'mem'>;
}

export type MemoryDisableInput = MemoryByIdInput;

export type MemoryReviewDetailsInput = MemoryByIdInput;

export type MemoryReviewActionKind = 'update' | 'supersede' | 'forget';
export type MemoryOperatorRevisionReason = Exclude<MemoryRevisionReason, 'runtime_refresh'>;

export interface MemoryReviewDetailsResult {
    memory: MemoryRecord;
    evidence: MemoryEvidenceRecord[];
    revisions: MemoryRevisionRecord[];
}

interface MemoryReviewActionBaseInput extends MemoryByIdInput {
    expectedUpdatedAt: string;
}

export interface MemoryReviewUpdateActionInput extends MemoryReviewActionBaseInput {
    action: 'update';
    title: string;
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown: string;
    summaryText?: string;
}

export interface MemoryReviewSupersedeActionInput extends MemoryReviewActionBaseInput {
    action: 'supersede';
    revisionReason: MemoryOperatorRevisionReason;
    title: string;
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown: string;
    summaryText?: string;
}

export interface MemoryReviewForgetActionInput extends MemoryReviewActionBaseInput {
    action: 'forget';
}

export type MemoryApplyReviewActionInput =
    | MemoryReviewUpdateActionInput
    | MemoryReviewSupersedeActionInput
    | MemoryReviewForgetActionInput;

export interface MemoryApplyReviewActionResult {
    action: MemoryReviewActionKind;
    memory: MemoryRecord;
    previousMemory?: MemoryRecord;
    evidence: MemoryEvidenceRecord[];
    revisions: MemoryRevisionRecord[];
}

export interface MemorySupersedeInput extends MemoryByIdInput {
    createdByKind: MemoryCreatedByKind;
    title: string;
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    retentionSupersedenceRationale?: string;
    revisionReason: MemoryRevisionReason;
    evidence?: MemoryEvidenceCreateInput[];
}

export interface MemoryProjectionContextInput extends ProfileInput {
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    includeBroaderScopes?: boolean;
}

export interface MemoryProjectionPaths {
    globalMemoryRoot: string;
    workspaceMemoryRoot?: string;
}

export type MemoryProjectionTarget = 'global' | 'workspace';
export type MemoryProjectionSyncState = 'not_projected' | 'in_sync' | 'edited' | 'parse_error';
export type MemoryEditReviewAction = 'update' | 'disable' | 'supersede';
export type MemoryEditReviewDecision = 'accept' | 'reject';

export interface ProjectedMemoryRecord {
    memory: MemoryRecord;
    projectionTarget: MemoryProjectionTarget;
    absolutePath: string;
    relativePath: string;
    syncState: MemoryProjectionSyncState;
    fileExists: boolean;
    fileUpdatedAt?: string;
    observedContentHash?: string;
    parseError?: string;
    derivedSummary?: MemoryDerivedSummary;
}

export interface MemoryEditProposal {
    memory: MemoryRecord;
    projectionTarget: MemoryProjectionTarget;
    absolutePath: string;
    relativePath: string;
    observedContentHash: string;
    fileUpdatedAt: string;
    reviewAction: MemoryEditReviewAction;
    proposedState: MemoryState;
    proposedTitle: string;
    proposedCanonicalBody: MemoryCanonicalBody;
    proposedBodyMarkdown: string;
    proposedSummaryText?: string;
    proposedMetadata: Record<string, unknown>;
}

export interface MemoryProjectionStatusResult {
    paths: MemoryProjectionPaths;
    projectedMemories: ProjectedMemoryRecord[];
}

export interface MemoryScanProjectionEditsResult {
    paths: MemoryProjectionPaths;
    proposals: MemoryEditProposal[];
    parseErrors: ProjectedMemoryRecord[];
}

export type MemorySyncProjectionResult = MemoryProjectionStatusResult;

export interface ApplyMemoryEditProposalInput extends MemoryProjectionContextInput {
    memoryId: EntityId<'mem'>;
    observedContentHash: string;
    decision: MemoryEditReviewDecision;
}

export interface ApplyMemoryEditProposalResult {
    decision: MemoryEditReviewDecision;
    appliedAction?: MemoryEditReviewAction;
    memory: MemoryRecord;
    previousMemory?: MemoryRecord;
    projection: ProjectedMemoryRecord;
}

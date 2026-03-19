import type {
    MemoryCreatedByKind,
    MemoryScopeKind,
    MemoryState,
    MemoryType,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface MemoryRecord {
    id: EntityId<'mem'>;
    profileId: string;
    memoryType: MemoryType;
    scopeKind: MemoryScopeKind;
    state: MemoryState;
    createdByKind: MemoryCreatedByKind;
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    metadata: Record<string, unknown>;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    supersededByMemoryId?: EntityId<'mem'>;
    createdAt: string;
    updatedAt: string;
}

export const memoryTemporalFactStatuses = ['current', 'superseded', 'disabled'] as const;
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

export interface MemoryDerivedSummary {
    temporalStatus?: MemoryTemporalFactStatus;
    hasTemporalHistory: boolean;
    predecessorMemoryIds: EntityId<'mem'>[];
    successorMemoryId?: EntityId<'mem'>;
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
    bodyMarkdown: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
}

export interface MemoryListInput extends ProfileInput {
    memoryType?: MemoryType;
    scopeKind?: MemoryScopeKind;
    state?: MemoryState;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
}

export interface MemoryByIdInput extends ProfileInput {
    memoryId: EntityId<'mem'>;
}

export type MemoryDisableInput = MemoryByIdInput;

export interface MemorySupersedeInput extends MemoryByIdInput {
    createdByKind: MemoryCreatedByKind;
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
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

export interface MemorySyncProjectionResult extends MemoryProjectionStatusResult {}

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

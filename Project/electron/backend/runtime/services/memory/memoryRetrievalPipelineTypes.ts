import type { MemoryRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
    MemoryDerivedSummary,
    MemoryEvidenceSummary,
    RetrievedMemoryMatchReason,
    RetrievedMemoryRecord,
    RetrievedMemorySummary,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import type { RetrievedMemoryDecision } from '@/app/backend/runtime/services/memory/retrievedMemoryExplanationBuilder';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

export interface MemoryRetrievalStageInput {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    prompt: string;
    workspaceFingerprint?: string;
    runId?: EntityId<'run'>;
}

export type MemoryRetrievalTier = 'exact' | 'structured' | 'derived' | 'semantic' | 'prompt';
export type MemoryRetrievalDecisionFamily =
    | 'exact_run'
    | 'exact_thread'
    | 'exact_workspace'
    | 'structured'
    | 'derived_temporal'
    | 'derived_causal'
    | 'semantic'
    | 'exact_global'
    | 'prompt';

export interface ResolvedMemoryRetrievalContext {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    prompt: string;
    promptTerms: string[];
    activeMemories: MemoryRecord[];
    threadIds: EntityId<'thr'>[];
    workspaceFingerprint?: string;
    runId?: EntityId<'run'>;
}

export interface MemoryRetrievalCandidate {
    memory: MemoryRecord;
    matchReason: RetrievedMemoryMatchReason;
    tier: MemoryRetrievalTier;
    priority: number;
    structuredHitCount?: number;
    sourceMemoryId?: EntityId<'mem'>;
    annotations?: string[];
}

export interface MemoryRetrievalExpansionCandidate {
    memory: MemoryRecord;
    matchReason: Extract<RetrievedMemoryMatchReason, 'derived_temporal' | 'derived_causal'>;
    tier: Extract<MemoryRetrievalTier, 'derived'>;
    sourceMemoryId?: EntityId<'mem'>;
    annotations?: string[];
}

export interface MemoryRetrievalSemanticCandidate {
    memory: MemoryRecord;
    matchReason: Extract<RetrievedMemoryMatchReason, 'semantic'>;
    tier: 'semantic';
    similarity: number;
}

export interface MemoryRetrievalExpansionResult {
    baseCandidates: MemoryRetrievalCandidate[];
    derivedCandidates: MemoryRetrievalExpansionCandidate[];
}

export interface RankedMemoryRetrievalDecision extends RetrievedMemoryDecision {
    tier: MemoryRetrievalTier;
    family: MemoryRetrievalDecisionFamily;
    familyRank: number;
    structuredHitCount: number;
    promptMatchCount: number;
    semanticSimilarity: number;
    sourceDecisionRank: number;
    recencyKey: string;
    redundancyKey: string;
    score: number;
}

export interface MemoryRetrievalAssemblyInput {
    profileId: string;
    decisions: RankedMemoryRetrievalDecision[];
    evidenceByMemoryId: Map<EntityId<'mem'>, MemoryEvidenceSummary[]>;
    derivedSummaryByMemoryId: Map<string, MemoryDerivedSummary>;
}

export interface MemoryRetrievalSemanticStageInput {
    profileId: string;
    prompt: string;
    activeMemories: MemoryRecord[];
    excludedMemoryIds: Set<EntityId<'mem'>>;
}

export interface MemoryRetrievalSemanticStageResult {
    semanticCandidates: MemoryRetrievalSemanticCandidate[];
}

export interface MemoryRetrievalAssemblyResult {
    summary?: RetrievedMemorySummary;
    records: RetrievedMemoryRecord[];
    messages: RunContextMessage[];
}

export interface MemoryRetrievalEvidenceStageInput {
    profileId: string;
    decisions: RankedMemoryRetrievalDecision[];
}

export interface MemoryRetrievalEvidenceStageResult {
    evidenceByMemoryId: Map<EntityId<'mem'>, MemoryEvidenceSummary[]>;
}

export interface MemoryRetrievalSelectionStageInput {
    decisions: RankedMemoryRetrievalDecision[];
    derivedSummaryByMemoryId: Map<string, MemoryDerivedSummary>;
}

export interface MemoryRetrievalSelectionStageResult {
    decisions: RankedMemoryRetrievalDecision[];
}

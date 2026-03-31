import type { MemoryRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
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

export type MemoryRetrievalTier = 'exact' | 'structured' | 'derived' | 'prompt';

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

export interface MemoryRetrievalExpansionResult {
    baseCandidates: MemoryRetrievalCandidate[];
    derivedCandidates: MemoryRetrievalExpansionCandidate[];
}

export interface RankedMemoryRetrievalDecision extends RetrievedMemoryDecision {
    tier: MemoryRetrievalTier;
    score: number;
}

export interface MemoryRetrievalAssemblyInput {
    profileId: string;
    decisions: RankedMemoryRetrievalDecision[];
}

export interface MemoryRetrievalAssemblyResult {
    summary?: RetrievedMemorySummary;
    records: RetrievedMemoryRecord[];
    messages: RunContextMessage[];
}

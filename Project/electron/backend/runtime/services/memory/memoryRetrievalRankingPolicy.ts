import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { EntityId, RetrievedMemoryMatchReason } from '@/app/backend/runtime/contracts';
import {
    countPromptTermMatches,
    scopePriority,
} from '@/app/backend/runtime/services/memory/memoryRetrievalHelpers';
import {
    buildRetrievedMemoryExplanation,
} from '@/app/backend/runtime/services/memory/retrievedMemoryExplanationBuilder';
import type {
    MemoryRetrievalCandidate,
    MemoryRetrievalExpansionCandidate,
    RankedMemoryRetrievalDecision,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';

export interface MemoryRetrievalRankingInput {
    baseCandidates: MemoryRetrievalCandidate[];
    activeMemories: MemoryRecord[];
    promptTerms: string[];
    derivedCandidates: MemoryRetrievalExpansionCandidate[];
}

function withPriority(
    memory: MemoryRecord,
    matchReason: RetrievedMemoryMatchReason,
    tier: RankedMemoryRetrievalDecision['tier'],
    priority: number,
    sourceMemoryId?: EntityId<'mem'>,
    annotations?: string[],
    promptMatchCount?: number
): RankedMemoryRetrievalDecision {
    return {
        memory,
        matchReason,
        tier,
        score: -priority,
        priority,
        ...(sourceMemoryId ? { sourceMemoryId } : {}),
        ...(annotations && annotations.length > 0 ? { annotations } : {}),
        explanation: buildRetrievedMemoryExplanation({
            matchReason,
            priority,
            ...(promptMatchCount !== undefined ? { promptMatchCount } : {}),
        }),
    };
}

export function rankRetrievedMemoryCandidates(input: MemoryRetrievalRankingInput): RankedMemoryRetrievalDecision[] {
    const candidateMemoryIds = new Set(input.baseCandidates.map((candidate) => candidate.memory.id));
    const combinedCandidates: RankedMemoryRetrievalDecision[] = [
        ...input.baseCandidates.map((candidate) =>
            withPriority(
                candidate.memory,
                candidate.matchReason,
                candidate.tier,
                candidate.priority,
                candidate.sourceMemoryId,
                candidate.annotations
            )
        ),
    ];

    for (const derivedCandidate of input.derivedCandidates) {
        if (candidateMemoryIds.has(derivedCandidate.memory.id)) {
            continue;
        }

        combinedCandidates.push(
            withPriority(
                derivedCandidate.memory,
                derivedCandidate.matchReason,
                derivedCandidate.tier,
                derivedCandidate.matchReason === 'derived_temporal' ? 15 : 16,
                derivedCandidate.sourceMemoryId,
                derivedCandidate.annotations
            )
        );
        candidateMemoryIds.add(derivedCandidate.memory.id);
    }

    for (const memory of input.activeMemories) {
        if (candidateMemoryIds.has(memory.id)) {
            continue;
        }

        const promptMatchCount = countPromptTermMatches(memory, input.promptTerms);
        if (promptMatchCount <= 0) {
            continue;
        }

        combinedCandidates.push(
            withPriority(
                memory,
                'prompt',
                'prompt',
                20 + scopePriority(memory.scopeKind) * 10 - promptMatchCount,
                undefined,
                undefined,
                promptMatchCount
            )
        );
    }

    return combinedCandidates.sort((left, right) => {
        if (left.priority !== right.priority) {
            return left.priority - right.priority;
        }
        if (left.memory.updatedAt !== right.memory.updatedAt) {
            return right.memory.updatedAt.localeCompare(left.memory.updatedAt);
        }

        return left.memory.id.localeCompare(right.memory.id);
    });
}

import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { EntityId, RetrievedMemoryMatchReason } from '@/app/backend/runtime/contracts';
import {
    countPromptTermMatches,
    normalizeSearchText,
    scopePriority,
} from '@/app/backend/runtime/services/memory/memoryRetrievalHelpers';
import {
    buildRetrievedMemoryExplanation,
} from '@/app/backend/runtime/services/memory/retrievedMemoryExplanationBuilder';
import type {
    MemoryRetrievalCandidate,
    MemoryRetrievalDecisionFamily,
    MemoryRetrievalExpansionCandidate,
    MemoryRetrievalSemanticCandidate,
    RankedMemoryRetrievalDecision,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';

export interface MemoryRetrievalRankingInput {
    baseCandidates: MemoryRetrievalCandidate[];
    activeMemories: MemoryRecord[];
    promptTerms: string[];
    derivedCandidates: MemoryRetrievalExpansionCandidate[];
    semanticCandidates: MemoryRetrievalSemanticCandidate[];
}

function getFamilyRank(matchReason: RetrievedMemoryMatchReason): number {
    switch (matchReason) {
        case 'exact_run':
            return 1;
        case 'exact_thread':
            return 2;
        case 'exact_workspace':
            return 3;
        case 'structured':
            return 4;
        case 'derived_temporal':
            return 5;
        case 'derived_causal':
            return 6;
        case 'semantic':
            return 7;
        case 'exact_global':
            return 8;
        case 'prompt':
            return 9;
    }
}

function getDecisionFamily(matchReason: RetrievedMemoryMatchReason): MemoryRetrievalDecisionFamily {
    return matchReason;
}

function getRecencyValue(updatedAt: string): number {
    const timestamp = Date.parse(updatedAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildRedundancyKey(memory: MemoryRecord): string {
    const normalizedTitle = normalizeSearchText(memory.title);
    const normalizedDetails = normalizeSearchText([memory.summaryText ?? '', memory.bodyMarkdown].join(' ')).slice(0, 160);
    return `${normalizedTitle}::${normalizedDetails}`;
}

function compareDecisions(left: RankedMemoryRetrievalDecision, right: RankedMemoryRetrievalDecision): number {
    if (left.familyRank !== right.familyRank) {
        return left.familyRank - right.familyRank;
    }

    switch (left.family) {
        case 'structured':
            if (left.structuredHitCount !== right.structuredHitCount) {
                return right.structuredHitCount - left.structuredHitCount;
            }
            if (scopePriority(left.memory.scopeKind) !== scopePriority(right.memory.scopeKind)) {
                return scopePriority(left.memory.scopeKind) - scopePriority(right.memory.scopeKind);
            }
            break;
        case 'derived_temporal':
        case 'derived_causal':
            if (left.sourceDecisionRank !== right.sourceDecisionRank) {
                return left.sourceDecisionRank - right.sourceDecisionRank;
            }
            break;
        case 'semantic':
            if (left.semanticSimilarity !== right.semanticSimilarity) {
                return right.semanticSimilarity - left.semanticSimilarity;
            }
            break;
        case 'prompt':
            if (left.promptMatchCount !== right.promptMatchCount) {
                return right.promptMatchCount - left.promptMatchCount;
            }
            if (scopePriority(left.memory.scopeKind) !== scopePriority(right.memory.scopeKind)) {
                return scopePriority(left.memory.scopeKind) - scopePriority(right.memory.scopeKind);
            }
            break;
        default:
            break;
    }

    if (left.recencyKey !== right.recencyKey) {
        return right.recencyKey.localeCompare(left.recencyKey);
    }

    return left.memory.id.localeCompare(right.memory.id);
}

function computeDecisionScore(input: {
    familyRank: number;
    structuredHitCount: number;
    promptMatchCount: number;
    semanticSimilarity: number;
    sourceDecisionRank: number;
    recencyValue: number;
}): number {
    const familyComponent = (10 - input.familyRank) * 1_000_000_000;
    const structuredComponent = input.structuredHitCount * 1_000_000;
    const promptComponent = input.promptMatchCount * 100_000;
    const semanticComponent = Math.round(input.semanticSimilarity * 10_000) * 100;
    const sourceComponent = Math.max(0, 10_000 - input.sourceDecisionRank) * 10;
    return familyComponent + structuredComponent + promptComponent + semanticComponent + sourceComponent + input.recencyValue;
}

function withDecisionFeatures(
    memory: MemoryRecord,
    matchReason: RetrievedMemoryMatchReason,
    tier: RankedMemoryRetrievalDecision['tier'],
    input?: {
        sourceMemoryId?: EntityId<'mem'>;
        annotations?: string[];
        structuredHitCount?: number;
        promptMatchCount?: number;
        semanticSimilarity?: number;
        sourceDecisionRank?: number;
    }
): RankedMemoryRetrievalDecision {
    const family = getDecisionFamily(matchReason);
    const familyRank = getFamilyRank(matchReason);
    const structuredHitCount = input?.structuredHitCount ?? 0;
    const promptMatchCount = input?.promptMatchCount ?? 0;
    const semanticSimilarity = input?.semanticSimilarity ?? 0;
    const sourceDecisionRank = input?.sourceDecisionRank ?? Number.MAX_SAFE_INTEGER;
    const recencyKey = memory.updatedAt;
    const score = computeDecisionScore({
        familyRank,
        structuredHitCount,
        promptMatchCount,
        semanticSimilarity,
        sourceDecisionRank,
        recencyValue: getRecencyValue(memory.updatedAt),
    });
    return {
        memory,
        matchReason,
        tier,
        family,
        familyRank,
        structuredHitCount,
        promptMatchCount,
        semanticSimilarity,
        sourceDecisionRank,
        recencyKey,
        redundancyKey: buildRedundancyKey(memory),
        score,
        priority: familyRank,
        ...(input?.sourceMemoryId ? { sourceMemoryId: input.sourceMemoryId } : {}),
        ...(input?.annotations && input.annotations.length > 0 ? { annotations: input.annotations } : {}),
        explanation: buildRetrievedMemoryExplanation({
            matchReason,
            familyRank,
            ...(promptMatchCount > 0 ? { promptMatchCount } : {}),
        }),
    };
}

export function rankRetrievedMemoryCandidates(input: MemoryRetrievalRankingInput): RankedMemoryRetrievalDecision[] {
    const candidateMemoryIds = new Set(input.baseCandidates.map((candidate) => candidate.memory.id));
    const combinedCandidates: RankedMemoryRetrievalDecision[] = [
        ...input.baseCandidates.map((candidate) =>
            withDecisionFeatures(
                candidate.memory,
                candidate.matchReason,
                candidate.tier,
                {
                    ...(candidate.sourceMemoryId ? { sourceMemoryId: candidate.sourceMemoryId } : {}),
                    ...(candidate.annotations ? { annotations: candidate.annotations } : {}),
                    ...(candidate.structuredHitCount ? { structuredHitCount: candidate.structuredHitCount } : {}),
                }
            )
        ),
    ];
    const baseDecisionRankByMemoryId = new Map(
        [...combinedCandidates]
            .sort(compareDecisions)
            .map((decision, index) => [decision.memory.id, index + 1] as const)
    );

    for (const derivedCandidate of input.derivedCandidates) {
        if (candidateMemoryIds.has(derivedCandidate.memory.id)) {
            continue;
        }

        combinedCandidates.push(
            withDecisionFeatures(
                derivedCandidate.memory,
                derivedCandidate.matchReason,
                derivedCandidate.tier,
                {
                    ...(derivedCandidate.sourceMemoryId ? { sourceMemoryId: derivedCandidate.sourceMemoryId } : {}),
                    ...(derivedCandidate.annotations ? { annotations: derivedCandidate.annotations } : {}),
                    sourceDecisionRank:
                        derivedCandidate.sourceMemoryId
                            ? (baseDecisionRankByMemoryId.get(derivedCandidate.sourceMemoryId) ?? Number.MAX_SAFE_INTEGER)
                            : Number.MAX_SAFE_INTEGER,
                }
            )
        );
        candidateMemoryIds.add(derivedCandidate.memory.id);
    }

    for (const memory of input.activeMemories) {
        if (candidateMemoryIds.has(memory.id)) {
            continue;
        }

        const semanticCandidate = input.semanticCandidates.find((candidate) => candidate.memory.id === memory.id);
        if (semanticCandidate) {
            combinedCandidates.push(
                withDecisionFeatures(
                    semanticCandidate.memory,
                    semanticCandidate.matchReason,
                    semanticCandidate.tier,
                    {
                        semanticSimilarity: semanticCandidate.similarity,
                    }
                )
            );
            candidateMemoryIds.add(memory.id);
            continue;
        }

        const promptMatchCount = countPromptTermMatches(memory, input.promptTerms);
        if (promptMatchCount <= 0) {
            continue;
        }

        combinedCandidates.push(
            withDecisionFeatures(
                memory,
                'prompt',
                'prompt',
                {
                    promptMatchCount,
                }
            )
        );
    }

    return combinedCandidates.sort(compareDecisions);
}

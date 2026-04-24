import { describe, expect, it } from 'vitest';

import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { MemoryDerivedSummary } from '@/app/backend/runtime/contracts';
import { createMemoryCanonicalBodyFromMarkdown } from '@/app/backend/runtime/services/memory/memoryCanonicalBody';
import type { RankedMemoryRetrievalDecision } from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import { rerankMemoryRetrievalQuality } from '@/app/backend/runtime/services/memory/memoryRetrievalQualityRerankStage';

function createMemory(overrides: Partial<MemoryRecord>): MemoryRecord {
    return {
        id: 'mem_default',
        profileId: 'profile_test',
        memoryType: 'semantic',
        scopeKind: 'global',
        state: 'active',
        createdByKind: 'user',
        title: 'Memory',
        canonicalBody: createMemoryCanonicalBodyFromMarkdown(overrides.bodyMarkdown ?? 'Body'),
        bodyMarkdown: 'Body',
        metadata: {},
        memoryRetentionClass: 'profile',
        createdAt: '2026-03-31T10:00:00.000Z',
        updatedAt: '2026-03-31T10:00:00.000Z',
        ...overrides,
    };
}

function familyRank(matchReason: RankedMemoryRetrievalDecision['matchReason']): number {
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
        case 'graph_expanded':
            return 7;
        case 'semantic':
            return 8;
        case 'exact_global':
            return 9;
        case 'prompt':
            return 10;
    }
}

function createDecision(
    overrides: Partial<RankedMemoryRetrievalDecision> & Pick<RankedMemoryRetrievalDecision, 'memory' | 'matchReason' | 'tier'>
): RankedMemoryRetrievalDecision {
    return {
        memory: overrides.memory,
        matchReason: overrides.matchReason,
        tier: overrides.tier,
        family: overrides.matchReason,
        familyRank: familyRank(overrides.matchReason),
        structuredHitCount: overrides.structuredHitCount ?? 0,
        promptMatchCount: overrides.promptMatchCount ?? 0,
        graphExpansionScore: overrides.graphExpansionScore ?? 0,
        graphHopCount: overrides.graphHopCount ?? 0,
        semanticSimilarity: overrides.semanticSimilarity ?? 0,
        sourceDecisionRank: overrides.sourceDecisionRank ?? Number.MAX_SAFE_INTEGER,
        recencyKey: overrides.memory.updatedAt,
        redundancyKey: overrides.redundancyKey ?? `${overrides.memory.title}::${overrides.memory.bodyMarkdown}`,
        score: overrides.score ?? 1,
        priority: overrides.priority ?? familyRank(overrides.matchReason),
        ...(overrides.sourceMemoryId ? { sourceMemoryId: overrides.sourceMemoryId } : {}),
        ...(overrides.annotations ? { annotations: overrides.annotations } : {}),
        ...(overrides.selectionExemptionReason
            ? { selectionExemptionReason: overrides.selectionExemptionReason }
            : {}),
        explanation: overrides.explanation ?? {
            selectedSourceLabel: overrides.matchReason,
            selectionReason: 'selection',
            rankingReason: 'ranking',
        },
    };
}

describe('rerankMemoryRetrievalQuality', () => {
    it('preserves exact run and thread anchors before quality-ranked broad candidates', () => {
        const exactThread = createDecision({
            memory: createMemory({ id: 'mem_thread', scopeKind: 'thread', title: 'Thread anchor' }),
            matchReason: 'exact_thread',
            tier: 'exact',
        });
        const semantic = createDecision({
            memory: createMemory({ id: 'mem_semantic', title: 'Strong semantic' }),
            matchReason: 'semantic',
            tier: 'semantic',
            semanticSimilarity: 0.99,
        });
        const exactRun = createDecision({
            memory: createMemory({ id: 'mem_run', scopeKind: 'run', title: 'Run anchor' }),
            matchReason: 'exact_run',
            tier: 'exact',
        });

        const reranked = rerankMemoryRetrievalQuality({
            decisions: [semantic, exactThread, exactRun],
            derivedSummaryByMemoryId: new Map(),
            temporalIntent: 'current',
        }).decisions;

        expect(reranked.map((decision) => decision.memory.id)).toEqual(['mem_run', 'mem_thread', 'mem_semantic']);
    });

    it('ranks mixed-pool quality candidates above broad exact-global and prompt fallbacks', () => {
        const prompt = createDecision({
            memory: createMemory({ id: 'mem_prompt', title: 'Prompt fallback' }),
            matchReason: 'prompt',
            tier: 'prompt',
            promptMatchCount: 5,
        });
        const exactGlobal = createDecision({
            memory: createMemory({ id: 'mem_global', title: 'Global fallback' }),
            matchReason: 'exact_global',
            tier: 'exact',
        });
        const semantic = createDecision({
            memory: createMemory({ id: 'mem_semantic', title: 'Semantic candidate' }),
            matchReason: 'semantic',
            tier: 'semantic',
            semanticSimilarity: 0.9,
        });
        const graph = createDecision({
            memory: createMemory({ id: 'mem_graph', title: 'Graph candidate' }),
            matchReason: 'graph_expanded',
            tier: 'graph',
            graphExpansionScore: 0.84,
            graphHopCount: 1,
        });

        const reranked = rerankMemoryRetrievalQuality({
            decisions: [prompt, exactGlobal, semantic, graph],
            derivedSummaryByMemoryId: new Map([
                [
                    'mem_semantic',
                    {
                        hasTemporalHistory: false,
                        conflictingCurrentMemoryIds: [],
                        predecessorMemoryIds: [],
                        graphNeighborCount: 0,
                        linkedRunIds: [],
                        linkedThreadIds: [],
                        linkedWorkspaceFingerprints: [],
                        strength: {
                            recencyScore: 1,
                            evidenceCount: 4,
                            reuseCount: 3,
                            importanceScore: 0.9,
                            confidenceScore: 0.92,
                        },
                    } satisfies MemoryDerivedSummary,
                ],
            ]),
            temporalIntent: 'current',
        }).decisions;

        expect(reranked.slice(0, 2).map((decision) => decision.memory.id)).toEqual(['mem_semantic', 'mem_graph']);
        expect(reranked.slice(2).map((decision) => decision.memory.id)).toEqual(['mem_global', 'mem_prompt']);
    });

    it('promotes conflicted records when the prompt asks for conflict handling', () => {
        const ordinaryStructured = createDecision({
            memory: createMemory({ id: 'mem_structured', title: 'Structured' }),
            matchReason: 'structured',
            tier: 'structured',
            structuredHitCount: 2,
        });
        const conflict = createDecision({
            memory: createMemory({ id: 'mem_conflict', title: 'Conflict' }),
            matchReason: 'derived_temporal',
            tier: 'derived',
            selectionExemptionReason: 'conflict',
        });

        const reranked = rerankMemoryRetrievalQuality({
            decisions: [ordinaryStructured, conflict],
            derivedSummaryByMemoryId: new Map(),
            temporalIntent: 'conflict',
        }).decisions;

        expect(reranked[0]?.memory.id).toBe('mem_conflict');
    });
});

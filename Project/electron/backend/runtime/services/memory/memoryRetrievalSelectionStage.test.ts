import { describe, expect, it } from 'vitest';

import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { MemoryDerivedSummary } from '@/app/backend/runtime/contracts';
import type { RankedMemoryRetrievalDecision } from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import { selectRetrievedMemoryCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalSelectionStage';

function createMemory(overrides: Partial<MemoryRecord>): MemoryRecord {
    return {
        id: 'mem_default',
        profileId: 'profile_test',
        memoryType: 'semantic',
        scopeKind: 'global',
        state: 'active',
        createdByKind: 'user',
        title: 'Memory',
        bodyMarkdown: 'Body',
        metadata: {},
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
        ...overrides,
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
        redundancyKey:
            overrides.redundancyKey ??
            `${overrides.memory.title.toLowerCase()}::${overrides.memory.bodyMarkdown.toLowerCase().slice(0, 160)}`,
        score: overrides.score ?? 1,
        priority: overrides.priority ?? familyRank(overrides.matchReason),
        explanation: overrides.explanation ?? {
            selectedSourceLabel: overrides.matchReason,
            selectionReason: 'selection',
            rankingReason: 'ranking',
        },
    };
}

function createEmptyDerivedSummaryMap(): Map<string, MemoryDerivedSummary> {
    return new Map();
}

describe('selectRetrievedMemoryCandidates', () => {
    it('keeps exact_run and exact_thread anchors even when newer broad candidates exist', () => {
        const exactRun = createDecision({
            memory: createMemory({
                id: 'mem_exact_run',
                scopeKind: 'run',
                runId: 'run_test',
                title: 'Exact run',
            }),
            matchReason: 'exact_run',
            tier: 'exact',
        });
        const exactThread = createDecision({
            memory: createMemory({
                id: 'mem_exact_thread',
                scopeKind: 'thread',
                threadId: 'thr_test',
                title: 'Exact thread',
            }),
            matchReason: 'exact_thread',
            tier: 'exact',
        });
        const semantic = createDecision({
            memory: createMemory({
                id: 'mem_semantic',
                title: 'New semantic',
                updatedAt: '2026-03-31T10:00:09.000Z',
            }),
            matchReason: 'semantic',
            tier: 'semantic',
            semanticSimilarity: 0.98,
        });
        const exactGlobal = createDecision({
            memory: createMemory({
                id: 'mem_global',
                title: 'New global',
                updatedAt: '2026-03-31T10:00:08.000Z',
            }),
            matchReason: 'exact_global',
            tier: 'exact',
        });

        const selected = selectRetrievedMemoryCandidates({
            decisions: [semantic, exactGlobal, exactRun, exactThread],
            derivedSummaryByMemoryId: createEmptyDerivedSummaryMap(),
            temporalIntent: 'current',
        }).decisions;

        expect(selected.slice(0, 2).map((decision) => decision.memory.id)).toEqual([
            'mem_exact_run',
            'mem_exact_thread',
        ]);
    });

    it('drops exact_global when stronger contextual records already fill the selection budget', () => {
        const selected = selectRetrievedMemoryCandidates({
            decisions: [
                createDecision({
                    memory: createMemory({ id: 'mem_thread', scopeKind: 'thread', threadId: 'thr_test', title: 'Thread' }),
                    matchReason: 'exact_thread',
                    tier: 'exact',
                }),
                createDecision({
                    memory: createMemory({
                        id: 'mem_workspace',
                        scopeKind: 'workspace',
                        workspaceFingerprint: 'wsf_test',
                        title: 'Workspace',
                    }),
                    matchReason: 'exact_workspace',
                    tier: 'exact',
                }),
                createDecision({
                    memory: createMemory({ id: 'mem_structured', title: 'Structured' }),
                    matchReason: 'structured',
                    tier: 'structured',
                    structuredHitCount: 3,
                }),
                createDecision({
                    memory: createMemory({ id: 'mem_derived', title: 'Derived' }),
                    matchReason: 'derived_temporal',
                    tier: 'derived',
                    sourceDecisionRank: 1,
                }),
                createDecision({
                    memory: createMemory({ id: 'mem_global', title: 'Global' }),
                    matchReason: 'exact_global',
                    tier: 'exact',
                }),
            ],
            derivedSummaryByMemoryId: createEmptyDerivedSummaryMap(),
            temporalIntent: 'current',
        }).decisions;

        expect(selected).toHaveLength(4);
        expect(selected.some((decision) => decision.memory.id === 'mem_global')).toBe(false);
    });

    it('keeps at most one prompt fallback and suppresses near-duplicate broad candidates', () => {
        const selected = selectRetrievedMemoryCandidates({
            decisions: [
                createDecision({
                    memory: createMemory({ id: 'mem_anchor', scopeKind: 'thread', threadId: 'thr_test', title: 'Anchor' }),
                    matchReason: 'exact_thread',
                    tier: 'exact',
                }),
                createDecision({
                    memory: createMemory({ id: 'mem_prompt_1', title: 'Prompt one', bodyMarkdown: 'zebra fallback body' }),
                    matchReason: 'prompt',
                    tier: 'prompt',
                    promptMatchCount: 3,
                }),
                createDecision({
                    memory: createMemory({ id: 'mem_prompt_2', title: 'Prompt two', bodyMarkdown: 'second zebra fallback' }),
                    matchReason: 'prompt',
                    tier: 'prompt',
                    promptMatchCount: 2,
                }),
                createDecision({
                    memory: createMemory({ id: 'mem_semantic_1', title: 'Duplicate', bodyMarkdown: 'same body' }),
                    matchReason: 'semantic',
                    tier: 'semantic',
                    semanticSimilarity: 0.92,
                    redundancyKey: 'duplicate::same',
                }),
                createDecision({
                    memory: createMemory({ id: 'mem_semantic_2', title: 'Duplicate', bodyMarkdown: 'same body' }),
                    matchReason: 'semantic',
                    tier: 'semantic',
                    semanticSimilarity: 0.9,
                    redundancyKey: 'duplicate::same',
                }),
            ],
            derivedSummaryByMemoryId: createEmptyDerivedSummaryMap(),
            temporalIntent: 'current',
        }).decisions;

        expect(selected.filter((decision) => decision.family === 'prompt')).toHaveLength(1);
        expect(selected.filter((decision) => decision.redundancyKey === 'duplicate::same')).toHaveLength(1);
    });

    it('collapses supersession-chain predecessors when a selected successor is already present', () => {
        const successor = createDecision({
            memory: createMemory({ id: 'mem_successor', title: 'Successor' }),
            matchReason: 'structured',
            tier: 'structured',
            structuredHitCount: 2,
        });
        const predecessor = createDecision({
            memory: createMemory({ id: 'mem_predecessor', title: 'Predecessor' }),
            matchReason: 'derived_temporal',
            tier: 'derived',
            sourceDecisionRank: 1,
        });

        const selected = selectRetrievedMemoryCandidates({
            decisions: [successor, predecessor],
            derivedSummaryByMemoryId: new Map([
                [
                    'mem_predecessor',
                    {
                        hasTemporalHistory: true,
                        conflictingCurrentMemoryIds: [],
                        predecessorMemoryIds: [],
                        graphNeighborCount: 0,
                        successorMemoryId: 'mem_successor',
                        linkedRunIds: [],
                        linkedThreadIds: [],
                        linkedWorkspaceFingerprints: [],
                    },
                ],
            ]),
            temporalIntent: 'current',
        }).decisions;

        expect(selected.map((decision) => decision.memory.id)).toEqual(['mem_successor']);
    });
});

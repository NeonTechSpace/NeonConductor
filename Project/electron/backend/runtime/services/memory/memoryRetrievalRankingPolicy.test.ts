import { describe, expect, it } from 'vitest';

import type { MemoryRecord } from '@/app/backend/persistence/types';

import { rankRetrievedMemoryCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalRankingPolicy';

function createMemory(overrides: Partial<MemoryRecord>): MemoryRecord {
    return {
        id: 'mem_test',
        profileId: 'profile_test',
        memoryType: 'procedural',
        scopeKind: 'thread',
        state: 'active',
        createdByKind: 'user',
        title: 'Memory',
        bodyMarkdown: 'Body',
        metadata: {},
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:00:00.000Z',
        ...overrides,
    };
}

describe('rankRetrievedMemoryCandidates', () => {
    it('keeps exact scope candidates ahead of derived and prompt matches and explains the selection', () => {
        const exact = createMemory({
            id: 'mem_exact',
            scopeKind: 'thread',
            threadId: 'thr_test',
            updatedAt: '2026-03-27T10:00:00.000Z',
            title: 'Exact thread memory',
        });
        const derived = createMemory({
            id: 'mem_derived',
            scopeKind: 'run',
            runId: 'run_test',
            updatedAt: '2026-03-27T10:00:01.000Z',
            title: 'Derived run memory',
        });
        const promptMatch = createMemory({
            id: 'mem_prompt',
            scopeKind: 'global',
            updatedAt: '2026-03-27T10:00:02.000Z',
            title: 'Zebra fallback memory',
            bodyMarkdown: 'Use zebra when asked.',
        });

        const decisions = rankRetrievedMemoryCandidates({
            baseCandidates: [
                {
                    memory: exact,
                    matchReason: 'exact_thread',
                    tier: 'exact',
                    priority: 1,
                },
            ],
            activeMemories: [exact, derived, promptMatch],
            promptTerms: ['zebra'],
            derivedCandidates: [
                {
                    memory: derived,
                    matchReason: 'derived_temporal',
                    tier: 'derived',
                    sourceMemoryId: exact.id,
                    annotations: ['Current fact has temporal history.'],
                },
            ],
            semanticCandidates: [],
        });

        expect(decisions.map((decision) => decision.memory.id)).toEqual(['mem_exact', 'mem_derived', 'mem_prompt']);
        expect(decisions.map((decision) => decision.tier)).toEqual(['exact', 'derived', 'prompt']);
        expect(decisions[0]?.explanation.selectedSourceLabel).toBe('Exact thread');
        expect(decisions[0]?.explanation.selectionReason).toContain('matched this memory directly');
        expect(decisions[1]?.explanation.selectedSourceLabel).toBe('Derived temporal');
        expect(decisions[2]?.explanation.rankingReason).toContain('Prompt matches');
    });

    it('ranks semantic matches below exact and derived results but above prompt-only fallback', () => {
        const exact = createMemory({
            id: 'mem_exact',
            scopeKind: 'thread',
            threadId: 'thr_test',
            title: 'Exact thread memory',
        });
        const semantic = createMemory({
            id: 'mem_semantic',
            scopeKind: 'global',
            title: 'Related architectural memory',
            bodyMarkdown: 'No direct term overlap.',
        });
        const promptMatch = createMemory({
            id: 'mem_prompt',
            scopeKind: 'global',
            title: 'Prompt fallback memory',
            bodyMarkdown: 'Contains zebra keyword.',
        });

        const decisions = rankRetrievedMemoryCandidates({
            baseCandidates: [
                {
                    memory: exact,
                    matchReason: 'exact_thread',
                    tier: 'exact',
                    priority: 1,
                },
            ],
            activeMemories: [exact, semantic, promptMatch],
            promptTerms: ['zebra'],
            derivedCandidates: [],
            semanticCandidates: [
                {
                    memory: semantic,
                    matchReason: 'semantic',
                    tier: 'semantic',
                    similarity: 0.93,
                },
            ],
        });

        expect(decisions.map((decision) => decision.memory.id)).toEqual(['mem_exact', 'mem_semantic', 'mem_prompt']);
        expect(decisions.map((decision) => decision.tier)).toEqual(['exact', 'semantic', 'prompt']);
        expect(decisions[1]?.matchReason).toBe('semantic');
    });

    it('ranks structured matches ahead of semantic, exact_global, and prompt candidates', () => {
        const structured = createMemory({
            id: 'mem_structured',
            title: 'Structured memory',
        });
        const semantic = createMemory({
            id: 'mem_semantic',
            title: 'Semantic memory',
        });
        const global = createMemory({
            id: 'mem_global',
            scopeKind: 'global',
            title: 'Global memory',
        });
        const prompt = createMemory({
            id: 'mem_prompt',
            scopeKind: 'global',
            title: 'Prompt memory',
            bodyMarkdown: 'Contains zebra keyword.',
        });

        const decisions = rankRetrievedMemoryCandidates({
            baseCandidates: [
                {
                    memory: global,
                    matchReason: 'exact_global',
                    tier: 'exact',
                    priority: 3,
                },
                {
                    memory: structured,
                    matchReason: 'structured',
                    tier: 'structured',
                    priority: 12,
                    structuredHitCount: 3,
                },
            ],
            activeMemories: [structured, semantic, global, prompt],
            promptTerms: ['zebra'],
            derivedCandidates: [],
            semanticCandidates: [
                {
                    memory: semantic,
                    matchReason: 'semantic',
                    tier: 'semantic',
                    similarity: 0.91,
                },
            ],
        });

        expect(decisions.map((decision) => decision.memory.id)).toEqual([
            'mem_structured',
            'mem_semantic',
            'mem_global',
            'mem_prompt',
        ]);
    });
});

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
        });

        expect(decisions.map((decision) => decision.memory.id)).toEqual(['mem_exact', 'mem_derived', 'mem_prompt']);
        expect(decisions.map((decision) => decision.tier)).toEqual(['exact', 'derived', 'prompt']);
        expect(decisions[0]?.explanation.selectedSourceLabel).toBe('Exact thread');
        expect(decisions[0]?.explanation.selectionReason).toContain('matched this memory directly');
        expect(decisions[1]?.explanation.selectedSourceLabel).toBe('Derived temporal');
        expect(decisions[2]?.explanation.rankingReason).toContain('Prompt matches');
    });
});

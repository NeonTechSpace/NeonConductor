import { describe, expect, it, vi } from 'vitest';

import { memoryEvidenceStore } from '@/app/backend/persistence/stores';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import { okOp } from '@/app/backend/runtime/services/common/operationalError';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { createMemoryCanonicalBodyFromMarkdown } from '@/app/backend/runtime/services/memory/memoryCanonicalBody';
import { assembleMemoryRetrievalResult } from '@/app/backend/runtime/services/memory/memoryRetrievalAssemblyStage';
import { collectMemoryRetrievalCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalCandidateCollector';
import { resolveMemoryRetrievalContext } from '@/app/backend/runtime/services/memory/memoryRetrievalContextResolver';
import { loadMemoryRetrievalEvidence } from '@/app/backend/runtime/services/memory/memoryRetrievalEvidenceStage';
import { expandMemoryRetrievalCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalExpansionStage';
import type { RankedMemoryRetrievalDecision } from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import { rankRetrievedMemoryCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalRankingPolicy';
import {
    createCaller,
    createSessionInScope,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

function createMemoryRecord(overrides: Partial<MemoryRecord>): MemoryRecord {
    return {
        id: requireEntityId('mem_stage_default', 'mem', 'Expected memory id.'),
        profileId: runtimeContractProfileId,
        memoryType: 'semantic',
        scopeKind: 'thread',
        state: 'active',
        createdByKind: 'user',
        title: 'Stage memory',
        canonicalBody: createMemoryCanonicalBodyFromMarkdown(overrides.bodyMarkdown ?? 'Stage body.'),
        bodyMarkdown: 'Stage body.',
        metadata: {},
        memoryRetentionClass: 'task',
        createdAt: '2026-03-31T10:00:00.000Z',
        updatedAt: '2026-03-31T10:00:00.000Z',
        ...overrides,
    };
}

function createRankedDecision(
    overrides: Partial<RankedMemoryRetrievalDecision> & Pick<RankedMemoryRetrievalDecision, 'memory' | 'matchReason' | 'tier'>
): RankedMemoryRetrievalDecision {
    const family = overrides.matchReason;
    const familyRank =
        family === 'exact_run'
            ? 1
            : family === 'exact_thread'
              ? 2
              : family === 'exact_workspace'
                ? 3
                : family === 'structured'
                  ? 4
                    : family === 'derived_temporal'
                    ? 5
                    : family === 'derived_causal'
                      ? 6
                      : family === 'graph_expanded'
                        ? 7
                        : family === 'semantic'
                          ? 8
                          : family === 'exact_global'
                            ? 9
                            : 10;

    return {
        ...overrides,
        memory: overrides.memory,
        matchReason: overrides.matchReason,
        tier: overrides.tier,
        family,
        familyRank,
        structuredHitCount: 0,
        promptMatchCount: 0,
        graphExpansionScore: 0,
        graphHopCount: 0,
        semanticSimilarity: 0,
        sourceDecisionRank: Number.MAX_SAFE_INTEGER,
        recencyKey: overrides.memory.updatedAt,
        redundancyKey: `${overrides.memory.title}::${overrides.memory.bodyMarkdown}`.toLowerCase(),
        score: 1,
        priority: familyRank,
        explanation: {
            selectedSourceLabel: 'Exact global',
            selectionReason: 'Global scope matched this memory directly.',
            rankingReason: 'Exact scope outranks broader matches.',
        },
    };
}

describe('memory retrieval stages', () => {
    const profileId = runtimeContractProfileId;

    it('resolves retrieval context before base candidate collection', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_stage_context',
            title: 'Retrieval stage context thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected retrieval stage thread id.');

        await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Stage context memory',
            bodyMarkdown: 'Use the stage context memory.',
        });

        const context = await resolveMemoryRetrievalContext({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            prompt: 'Use the stage context memory for this task.',
        });
        const collected = await collectMemoryRetrievalCandidates(context);

        expect(context.workspaceFingerprint).toBe('wsf_memory_retrieval_stage_context');
        expect(context.threadIds).toEqual([threadId]);
        expect(context.promptTerms).toContain('stage');
        expect(context.activeMemories.some((memory) => memory.threadId === threadId)).toBe(true);
        expect(collected.baseCandidates.map((candidate) => candidate.matchReason)).toContain('exact_thread');
    });

    it('deduplicates derived expansion and annotates base candidates with temporal history', async () => {
        const exactMemory = createMemoryRecord({
            id: requireEntityId('mem_exact_stage', 'mem', 'Expected exact memory id.'),
            title: 'Exact memory',
            bodyMarkdown: 'Exact body.',
            threadId: requireEntityId('thr_stage', 'thr', 'Expected thread id.'),
        });
        const derivedOnlyMemory = createMemoryRecord({
            id: requireEntityId('mem_derived_stage', 'mem', 'Expected derived memory id.'),
            title: 'Derived memory',
            bodyMarkdown: 'Derived body.',
            threadId: requireEntityId('thr_stage', 'thr', 'Expected thread id.'),
        });

        const expansionResult = okOp({
            candidates: [
                {
                    memory: exactMemory,
                    matchReason: 'derived_temporal' as const,
                    sourceMemoryId: exactMemory.id,
                    annotations: ['Duplicate should be filtered.'],
                },
                {
                    memory: derivedOnlyMemory,
                    matchReason: 'derived_temporal' as const,
                    sourceMemoryId: exactMemory.id,
                    annotations: ['Prior truth from temporal memory history.'],
                },
            ],
            summaries: new Map([
                [
                    exactMemory.id,
                    {
                        hasTemporalHistory: true,
                        conflictingCurrentMemoryIds: [],
                        predecessorMemoryIds: [],
                        graphNeighborCount: 0,
                        linkedRunIds: [],
                        linkedThreadIds: [],
                        linkedWorkspaceFingerprints: [],
                    },
                ],
            ]),
        });
        expansionResult.match(
            () => undefined,
            () => undefined
        );
        const expandSpy = vi.spyOn(advancedMemoryDerivationService, 'expandMatchedMemories').mockResolvedValue(expansionResult);

        try {
            const expanded = await expandMemoryRetrievalCandidates({
                context: {
                    profileId,
                    sessionId: requireEntityId('sess_stage', 'sess', 'Expected session id.'),
                    topLevelTab: 'agent',
                    modeKey: 'code',
                    prompt: 'What changed before?',
                    promptTerms: ['changed', 'before'],
                    activeMemories: [exactMemory, derivedOnlyMemory],
                    threadIds: [requireEntityId('thr_stage', 'thr', 'Expected thread id.')],
                },
                baseCandidates: [
                    {
                        memory: exactMemory,
                        matchReason: 'exact_thread',
                        tier: 'exact',
                        priority: 1,
                    },
                ],
            });

            expect(expanded.baseCandidates[0]?.annotations).toEqual(['Current fact has temporal history.']);
            expect(expanded.derivedCandidates.map((candidate) => candidate.memory.id)).toEqual(['mem_derived_stage']);
            expect(expanded.derivedCandidates[0]?.tier).toBe('derived');
        } finally {
            expandSpy.mockRestore();
        }
    });

    it('uses updated-at tie-breaking inside the same scoring tier', () => {
        const exactOlder = createMemoryRecord({
            id: requireEntityId('mem_exact_older', 'mem', 'Expected exact older memory id.'),
            memoryType: 'procedural',
            title: 'Exact older',
            bodyMarkdown: 'Older exact memory.',
            threadId: requireEntityId('thr_stage', 'thr', 'Expected thread id.'),
            updatedAt: '2026-03-31T10:00:00.000Z',
        });
        const exactNewer = createMemoryRecord({
            ...exactOlder,
            id: requireEntityId('mem_exact_newer', 'mem', 'Expected exact newer memory id.'),
            title: 'Exact newer',
            updatedAt: '2026-03-31T10:00:01.000Z',
        });

        const decisions = rankRetrievedMemoryCandidates({
            baseCandidates: [
                {
                    memory: exactOlder,
                    matchReason: 'exact_thread',
                    tier: 'exact',
                    priority: 1,
                },
                {
                    memory: exactNewer,
                    matchReason: 'exact_thread',
                    tier: 'exact',
                    priority: 1,
                },
            ],
            activeMemories: [exactOlder, exactNewer],
            promptTerms: [],
            derivedCandidates: [],
            graphCandidates: [],
            semanticCandidates: [],
        });

        expect(decisions.map((decision) => decision.memory.id)).toEqual(['mem_exact_newer', 'mem_exact_older']);
        expect(decisions[0]?.tier).toBe('exact');
        expect(decisions[0]?.familyRank).toBe(2);
    });

    it('assembles final records and messages from ranked decisions', async () => {
        const rankedDecision = createRankedDecision({
            memory: createMemoryRecord({
                id: requireEntityId('mem_assembled', 'mem', 'Expected assembled memory id.'),
                title: 'Assembled memory',
                bodyMarkdown: 'Assembly body.',
                scopeKind: 'global',
            }),
            matchReason: 'exact_global' as const,
            tier: 'exact' as const,
        });

        try {
            const evidence = await loadMemoryRetrievalEvidence({
                profileId,
                decisions: [rankedDecision],
            });
            const assembled = await assembleMemoryRetrievalResult({
                profileId,
                decisions: [rankedDecision],
                evidenceByMemoryId: evidence.evidenceByMemoryId,
                derivedSummaryByMemoryId: new Map(),
            });

            expect(assembled.records.map((record) => record.title)).toEqual(['Assembled memory']);
            expect(assembled.summary?.records[0]?.matchReason).toBe('exact_global');
            expect(assembled.summary?.records[0]?.supportingEvidence).toEqual([]);
            expect(assembled.messages).toHaveLength(1);
        } finally {
            // no-op
        }
    });

    it('keeps assembled summaries aligned with records that actually fit the injected message', async () => {
        const overflowingDecision = createRankedDecision({
            memory: createMemoryRecord({
                id: requireEntityId('mem_overflowing_title', 'mem', 'Expected overflowing memory id.'),
                title: 'Overflow '.repeat(520),
                bodyMarkdown: 'This entry should not fit because the title alone exhausts the retrieval budget.',
                scopeKind: 'global',
            }),
            matchReason: 'prompt',
            tier: 'prompt',
        });
        const fittingDecision = createRankedDecision({
            memory: createMemoryRecord({
                id: requireEntityId('mem_fitting_summary', 'mem', 'Expected fitting memory id.'),
                title: 'Fitting memory',
                bodyMarkdown: 'This entry fits the retrieved-memory budget.',
                scopeKind: 'global',
            }),
            matchReason: 'prompt',
            tier: 'prompt',
        });

        const assembled = await assembleMemoryRetrievalResult({
            profileId,
            decisions: [overflowingDecision, fittingDecision],
            evidenceByMemoryId: new Map(),
            derivedSummaryByMemoryId: new Map(),
        });

        expect(assembled.records.map((record) => record.memoryId)).toEqual(['mem_fitting_summary']);
        expect(assembled.summary?.records.map((record) => record.memoryId)).toEqual(['mem_fitting_summary']);
        expect(JSON.stringify(assembled.messages)).not.toContain('mem_overflowing_title');
    });

    it('fails soft when the evidence-loading stage cannot read evidence', async () => {
        const evidenceSpy = vi
            .spyOn(memoryEvidenceStore, 'listByMemoryIds')
            .mockRejectedValue(new Error('Evidence stage failed.'));

        try {
            const result = await loadMemoryRetrievalEvidence({
                profileId,
                decisions: [
                    createRankedDecision({
                        memory: createMemoryRecord({
                            id: requireEntityId('mem_evidence_stage', 'mem', 'Expected evidence stage memory id.'),
                        }),
                        matchReason: 'exact_global',
                        tier: 'exact',
                    }),
                ],
            });

            expect(result.evidenceByMemoryId.size).toBe(0);
        } finally {
            evidenceSpy.mockRestore();
        }
    });
});

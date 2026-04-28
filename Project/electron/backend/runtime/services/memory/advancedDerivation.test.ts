import { describe, expect, it } from 'vitest';

import { memoryDerivedStore, memoryRetrievalUsageStore, memoryStore, runStore } from '@/app/backend/persistence/stores';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { memoryRetrievalService } from '@/app/backend/runtime/services/memory/retrieval';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('advancedMemoryDerivationService', () => {
    const profileId = runtimeContractProfileId;

    it('derives temporal history from supersede chains without changing canonical memory', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_history',
            title: 'Advanced memory history thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected advanced history thread id.');

        const original = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'API base URL',
            bodyMarkdown: 'Use the legacy base URL.',
        });
        const superseded = await caller.memory.supersede({
            profileId,
            memoryId: original.memory.id,
            createdByKind: 'user',
            title: 'API base URL',
            bodyMarkdown: 'Use the new base URL.',
            revisionReason: 'correction',
        });

        const summariesResult = await advancedMemoryDerivationService.getDerivedSummaries(profileId, [
            superseded.previous.id,
            superseded.replacement.id,
        ]);
        expect(summariesResult.isOk()).toBe(true);
        if (summariesResult.isErr()) {
            throw new Error(summariesResult.error.message);
        }

        const previousSummary = summariesResult.value.get(superseded.previous.id);
        const replacementSummary = summariesResult.value.get(superseded.replacement.id);
        expect(previousSummary?.successorMemoryId).toBe(superseded.replacement.id);
        expect(replacementSummary?.predecessorMemoryIds).toEqual([superseded.previous.id]);
        expect(replacementSummary?.hasTemporalHistory).toBe(true);

        const canonicalMemories = await caller.memory.list({
            profileId,
            threadId,
        });
        expect(new Set(canonicalMemories.memories.map((memory) => memory.id))).toEqual(
            new Set([superseded.replacement.id, superseded.previous.id])
        );
    });

    it('adds prior truth and explicit run provenance through derived retrieval when the prompt asks for history or cause', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_retrieval',
            title: 'Advanced retrieval thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected advanced retrieval thread id.');

        const original = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Deployment endpoint',
            bodyMarkdown: 'Use the old deployment endpoint.',
        });
        await caller.memory.supersede({
            profileId,
            memoryId: original.memory.id,
            createdByKind: 'user',
            title: 'Deployment endpoint',
            bodyMarkdown: 'Use the new deployment endpoint.',
            revisionReason: 'correction',
        });

        const threadHistory = await memoryRetrievalService.retrieveRelevantMemory({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'wsf_memory_advanced_retrieval',
            prompt: 'What changed before on the deployment endpoint?',
        });
        expect(threadHistory.summary?.records.map((record) => record.title)).toEqual([
            'Deployment endpoint',
            'Deployment endpoint',
        ]);
        expect(threadHistory.summary?.records[0]?.matchReason).toBe('exact_thread');
        expect(threadHistory.summary?.records[0]?.derivedSummary?.hasTemporalHistory).toBe(true);
        expect(threadHistory.summary?.records[1]?.matchReason).toBe('derived_temporal');

        const originSession = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_retrieval',
            title: 'Advanced retrieval origin thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const originThreadId = requireEntityId(originSession.thread.id, 'thr', 'Expected advanced origin thread id.');
        const run = await runStore.create({
            profileId,
            sessionId: originSession.session.id,
            prompt: 'Why was the deployment endpoint changed?',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });

        await caller.memory.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'system',
            runId: run.id,
            title: 'Completed run: deployment migration',
            bodyMarkdown: 'Runtime-generated run outcome memory for the migration.',
            metadata: {
                source: 'runtime_run_outcome',
                extractionVersion: 1,
                runId: run.id,
                sessionId: originSession.session.id,
                threadId: originThreadId,
                runStatus: 'completed',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                hasAssistantText: false,
                toolCallCount: 0,
                toolErrorCount: 0,
            },
        });
        const causalSession = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_retrieval',
            title: 'Advanced retrieval cause thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const causalThreadId = requireEntityId(causalSession.thread.id, 'thr', 'Expected advanced cause thread id.');
        const causalSourceMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: causalThreadId,
            title: 'Deployment migration note',
            bodyMarkdown: 'Migration happened to move traffic safely.',
            metadata: {
                runId: run.id,
            },
        });

        const runCause = await memoryRetrievalService.retrieveRelevantMemory({
            profileId,
            sessionId: causalSession.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'wsf_memory_advanced_retrieval',
            prompt: 'Why did this deployment migration happen?',
        });
        expect(runCause.summary?.records.some((record) => record.memoryId === causalSourceMemory.memory.id)).toBe(true);
        expect(runCause.summary?.records.some((record) => record.matchReason === 'derived_causal')).toBe(true);
    });

    it('rebuilds the derived layer idempotently without duplicating rows', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_rebuild',
            title: 'Advanced rebuild thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected advanced rebuild thread id.');

        const memory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Rebuild memory',
            bodyMarkdown: 'Rebuild the derived layer safely.',
        });

        const firstRebuild = await advancedMemoryDerivationService.rebuildProfile(profileId);
        expect(firstRebuild.isOk()).toBe(true);
        const secondRebuild = await advancedMemoryDerivationService.rebuildProfile(profileId);
        expect(secondRebuild.isOk()).toBe(true);

        const facts = await memoryDerivedStore.listTemporalFactsBySourceMemoryIds(profileId, [memory.memory.id]);
        const links = await memoryDerivedStore.listCausalLinksBySourceMemoryIds(profileId, [memory.memory.id]);
        expect(facts).toHaveLength(1);
        expect(links.some((link) => link.relationType === 'observed_in_thread')).toBe(true);
    });

    it('marks competing active memories for the same subject as conflicted and exposes revision reasons', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_conflict',
            title: 'Advanced conflict thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected advanced conflict thread id.');

        const original = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            temporalSubjectKey: 'subject::deployment-endpoint',
            title: 'Deployment endpoint',
            bodyMarkdown: 'Use endpoint A.',
        });
        const corrected = await caller.memory.supersede({
            profileId,
            memoryId: original.memory.id,
            createdByKind: 'user',
            title: 'Deployment endpoint',
            bodyMarkdown: 'Use endpoint B.',
            revisionReason: 'correction',
        });
        await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            temporalSubjectKey: 'subject::deployment-endpoint',
            title: 'Deployment endpoint alternative',
            bodyMarkdown: 'Use endpoint C.',
        });

        const summariesResult = await advancedMemoryDerivationService.getDerivedSummaries(profileId, [
            original.memory.id,
            corrected.replacement.id,
        ]);
        expect(summariesResult.isOk()).toBe(true);
        if (summariesResult.isErr()) {
            throw new Error(summariesResult.error.message);
        }

        const originalSummary = summariesResult.value.get(original.memory.id);
        const correctedSummary = summariesResult.value.get(corrected.replacement.id);
        expect(originalSummary?.outgoingRevisionReason).toBe('correction');
        expect(correctedSummary?.incomingRevisionReason).toBe('correction');
        expect(correctedSummary?.temporalStatus).toBe('conflicted');
        expect(correctedSummary?.conflictingCurrentMemoryIds.length).toBe(2);
        expect(correctedSummary?.currentTruthMemoryId).toBeUndefined();
    });

    it('builds graph edges and strength summaries for related memories', async () => {
        const caller = createCaller();
        const current = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_graph',
            title: 'Advanced graph thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const other = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_graph_other',
            title: 'Advanced graph other thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const currentThreadId = requireEntityId(current.thread.id, 'thr', 'Expected current graph thread id.');
        const otherThreadId = requireEntityId(other.thread.id, 'thr', 'Expected other graph thread id.');
        const currentRun = await runStore.create({
            profileId,
            sessionId: current.session.id,
            prompt: 'Current graph run.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });
        const otherRun = await runStore.create({
            profileId,
            sessionId: other.session.id,
            prompt: 'Other graph run.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });

        const original = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: currentThreadId,
            temporalSubjectKey: 'subject::graph-strategy',
            title: 'Graph strategy',
            bodyMarkdown: 'Use strategy A.',
            evidence: [
                {
                    kind: 'run',
                    label: 'Source evidence',
                    sourceRunId: currentRun.id,
                },
            ],
        });
        const replacement = await caller.memory.supersede({
            profileId,
            memoryId: original.memory.id,
            createdByKind: 'user',
            title: 'Graph strategy',
            bodyMarkdown: 'Use strategy B.',
            revisionReason: 'correction',
            evidence: [
                {
                    kind: 'run',
                    label: 'Replacement evidence',
                    sourceRunId: currentRun.id,
                },
            ],
        });
        const related = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'system',
            threadId: otherThreadId,
            temporalSubjectKey: 'subject::graph-strategy',
            title: 'Secondary graph strategy',
            bodyMarkdown: 'Use strategy C.',
            evidence: [
                {
                    kind: 'run',
                    label: 'Related evidence',
                    sourceRunId: otherRun.id,
                },
            ],
        });
        await memoryRetrievalUsageStore.incrementMany({
            profileId,
            memoryIds: [replacement.replacement.id, replacement.replacement.id],
        });

        const graphEdges = await memoryDerivedStore.listGraphEdgesBySourceMemoryIds(profileId, [
            replacement.replacement.id,
        ]);
        expect(graphEdges.some((edge) => edge.edgeKind === 'same_subject' && edge.targetMemoryId === related.memory.id)).toBe(
            true
        );
        expect(graphEdges.some((edge) => edge.edgeKind === 'revision_predecessor' && edge.targetMemoryId === original.memory.id)).toBe(
            true
        );

        const summariesResult = await advancedMemoryDerivationService.getDerivedSummaries(profileId, [
            replacement.replacement.id,
            related.memory.id,
        ]);
        expect(summariesResult.isOk()).toBe(true);
        if (summariesResult.isErr()) {
            throw new Error(summariesResult.error.message);
        }

        const replacementSummary = summariesResult.value.get(replacement.replacement.id);
        expect(replacementSummary?.graphNeighborCount).toBeGreaterThan(0);
        expect(replacementSummary?.strength?.evidenceCount).toBeGreaterThan(0);
        expect(replacementSummary?.strength?.reuseCount).toBeGreaterThan(0);
        expect(replacementSummary?.strength?.confidenceScore).toBeGreaterThan(0);
    });

    it('derives consolidation-source graph edges only from active validated metadata sources', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_advanced_consolidation_graph',
            title: 'Advanced consolidation graph thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected consolidation graph thread id.');
        const firstRun = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Capture first consolidation source.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });
        const secondRun = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Capture second consolidation source.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });
        const disabledRun = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Capture disabled consolidation source.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });

        const firstSource = await caller.memory.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'system',
            runId: firstRun.id,
            temporalSubjectKey: 'subject::advanced-consolidation-source',
            title: 'First consolidation source',
            bodyMarkdown: 'First active source memory.',
            evidence: [
                {
                    kind: 'run',
                    label: 'First source evidence',
                    sourceRunId: firstRun.id,
                },
            ],
        });
        const secondSource = await caller.memory.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'system',
            runId: secondRun.id,
            temporalSubjectKey: 'subject::advanced-consolidation-source',
            title: 'Second consolidation source',
            bodyMarkdown: 'Second active source memory.',
            evidence: [
                {
                    kind: 'run',
                    label: 'Second source evidence',
                    sourceRunId: secondRun.id,
                },
            ],
        });
        const disabledSource = await memoryStore.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            state: 'disabled',
            createdByKind: 'system',
            runId: disabledRun.id,
            threadId,
            workspaceFingerprint: 'wsf_memory_advanced_consolidation_graph',
            temporalSubjectKey: 'subject::advanced-consolidation-source',
            title: 'Disabled consolidation source',
            bodyMarkdown: 'Disabled source memory.',
        });
        const consolidated = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'system',
            threadId,
            workspaceFingerprint: 'wsf_memory_advanced_consolidation_graph',
            temporalSubjectKey: 'subject::advanced-consolidated-memory',
            title: 'Advanced consolidated workflow',
            bodyMarkdown: 'Use the consolidated workflow.',
            metadata: {
                source: 'memory_consolidation',
                clusterMemoryIds: [firstSource.memory.id, secondSource.memory.id, disabledSource.id, 'not_a_memory'],
            },
        });

        const rebuilt = await advancedMemoryDerivationService.rebuildProfile(profileId);
        expect(rebuilt.isOk()).toBe(true);

        const consolidatedEdges = await memoryDerivedStore.listGraphEdgesBySourceMemoryIds(profileId, [
            consolidated.memory.id,
        ]);
        expect(
            consolidatedEdges.some(
                (edge) => edge.edgeKind === 'consolidation_source' && edge.targetMemoryId === firstSource.memory.id
            )
        ).toBe(true);
        expect(
            consolidatedEdges.some(
                (edge) => edge.edgeKind === 'consolidation_source' && edge.targetMemoryId === secondSource.memory.id
            )
        ).toBe(true);
        expect(
            consolidatedEdges.some(
                (edge) => edge.edgeKind === 'consolidation_source' && edge.targetMemoryId === disabledSource.id
            )
        ).toBe(false);

        const firstSourceEdges = await memoryDerivedStore.listGraphEdgesBySourceMemoryIds(profileId, [
            firstSource.memory.id,
        ]);
        expect(
            firstSourceEdges.some(
                (edge) => edge.edgeKind === 'consolidation_source' && edge.targetMemoryId === consolidated.memory.id
            )
        ).toBe(true);
    });
});

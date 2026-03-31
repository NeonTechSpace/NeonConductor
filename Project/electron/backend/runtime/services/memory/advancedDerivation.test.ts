import { describe, expect, it } from 'vitest';

import { memoryDerivedStore, runStore } from '@/app/backend/persistence/stores';
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
        });

        const threadHistory = await memoryRetrievalService.retrieveRelevantMemory({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'wsf_memory_advanced_retrieval',
            prompt: 'What changed before on the deployment endpoint?',
        });
        expect(threadHistory.summary?.records.map((record) => record.title)).toEqual(['Deployment endpoint']);
        expect(threadHistory.summary?.records[0]?.matchReason).toBe('exact_thread');
        expect(threadHistory.summary?.records[0]?.derivedSummary?.hasTemporalHistory).toBe(true);

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
});

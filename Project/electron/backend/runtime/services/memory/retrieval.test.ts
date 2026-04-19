import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { memoryEvidenceStore, memoryStore, runStore } from '@/app/backend/persistence/stores';
import { createDefaultPreparedContextModeOverrides, type ModeDefinition } from '@/app/backend/runtime/contracts';
import { errOp } from '@/app/backend/runtime/services/common/operationalError';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { memoryRetrievalService } from '@/app/backend/runtime/services/memory/retrieval';
import { memorySemanticIndexService } from '@/app/backend/runtime/services/memory/memorySemanticIndexService';
import { memoryService } from '@/app/backend/runtime/services/memory/service';
import { buildRunContext } from '@/app/backend/runtime/services/runExecution/contextBuilder';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

function createHandledErrOp(code: 'request_failed', message: string) {
    const result = errOp(code, message);
    result.match(
        () => undefined,
        () => undefined
    );
    return result;
}

function createResolvedMode(modeKey: string, topLevelTab: 'chat' | 'agent' | 'orchestrator'): { mode: ModeDefinition } {
    return {
        mode: {
            id: `mode_${topLevelTab}_${modeKey}`,
            profileId: runtimeContractProfileId,
            topLevelTab,
            modeKey,
            authoringRole:
                topLevelTab === 'chat'
                    ? 'chat'
                    : topLevelTab === 'orchestrator'
                      ? 'orchestrator_primary'
                      : 'single_task_agent',
            roleTemplate:
                topLevelTab === 'chat'
                    ? 'chat/default'
                    : topLevelTab === 'orchestrator'
                      ? modeKey === 'orchestrate'
                          ? 'orchestrator_primary/orchestrate'
                          : 'orchestrator_primary/debug'
                      : modeKey === 'plan'
                        ? 'single_task_agent/plan'
                        : modeKey === 'ask'
                          ? 'single_task_agent/ask'
                          : 'single_task_agent/apply',
            internalModelRole: modeKey === 'plan' ? 'planner' : topLevelTab === 'chat' ? 'chat' : 'apply',
            delegatedOnly: false,
            sessionSelectable: true,
            label: `${topLevelTab} ${modeKey}`,
            prompt: {},
            promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
            executionPolicy: {
                authoringRole:
                    topLevelTab === 'chat'
                        ? 'chat'
                        : topLevelTab === 'orchestrator'
                          ? 'orchestrator_primary'
                          : 'single_task_agent',
                roleTemplate:
                    topLevelTab === 'chat'
                        ? 'chat/default'
                        : topLevelTab === 'orchestrator'
                          ? modeKey === 'orchestrate'
                              ? 'orchestrator_primary/orchestrate'
                              : 'orchestrator_primary/debug'
                          : modeKey === 'plan'
                            ? 'single_task_agent/plan'
                            : modeKey === 'ask'
                              ? 'single_task_agent/ask'
                              : 'single_task_agent/apply',
                internalModelRole: modeKey === 'plan' ? 'planner' : topLevelTab === 'chat' ? 'chat' : 'apply',
                delegatedOnly: false,
                sessionSelectable: true,
            },
            source: 'system',
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assetKey: `${topLevelTab}-${modeKey}`,
            sourceKind: 'system_seed',
            scope: 'system',
            tags: [] as string[],
            precedence: 0,
        },
    };
}

describe('memoryRetrievalService', () => {
    const profileId = runtimeContractProfileId;

    it('orders exact scope matches before prompt matches and excludes disabled or superseded memory', async () => {
        const caller = createCaller();
        const current = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_current',
            title: 'Current retrieval thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const currentThreadId = requireEntityId(current.thread.id, 'thr', 'Expected current retrieval thread id.');
        const other = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_other',
            title: 'Other retrieval thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const otherThreadId = requireEntityId(other.thread.id, 'thr', 'Expected other retrieval thread id.');
        const supportingRun = await runStore.create({
            profileId,
            sessionId: current.session.id,
            prompt: 'Supporting retrieval evidence',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: true,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
            },
            transport: {},
        });

        await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: currentThreadId,
            title: 'Current thread memory',
            bodyMarkdown: 'Use the current-thread procedure.',
            evidence: [
                {
                    kind: 'run',
                    label: 'Supporting run evidence',
                    sourceRunId: supportingRun.id,
                },
            ],
        });
        await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'workspace',
            createdByKind: 'user',
            workspaceFingerprint: 'wsf_memory_retrieval_current',
            title: 'Workspace memory',
            bodyMarkdown: 'Workspace truth.',
        });
        await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Global memory',
            bodyMarkdown: 'Global default.',
        });
        const disabledMemory = await memoryStore.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            state: 'disabled',
            createdByKind: 'user',
            threadId: currentThreadId,
            title: 'Disabled memory',
            bodyMarkdown: 'Should never be retrieved.',
        });
        const supersededOriginal = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: otherThreadId,
            title: 'Superseded zebra memory',
            bodyMarkdown: 'Old zebra instruction.',
        });
        await caller.memory.supersede({
            profileId,
            memoryId: supersededOriginal.memory.id,
            createdByKind: 'user',
            title: 'Superseded zebra memory v2',
            bodyMarkdown: 'New zebra instruction.',
            revisionReason: 'correction',
        });
        const promptMatch = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: otherThreadId,
            title: 'Zebra fallback procedure',
            bodyMarkdown: 'Use the zebra fallback when asked.',
        });

        const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
            profileId,
            sessionId: current.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'wsf_memory_retrieval_current',
            prompt: 'Please use the zebra procedure for this task.',
        });

        expect(retrieved.summary?.records.slice(0, 3).map((record) => record.title)).toEqual([
            'Current thread memory',
            'Workspace memory',
            'Global memory',
        ]);
        expect(retrieved.summary?.records[0]?.supportingEvidence[0]?.label).toBe('Supporting run evidence');
        expect(retrieved.summary?.records.some((record) => record.memoryId === disabledMemory.id)).toBe(false);
        expect(retrieved.summary?.records.some((record) => record.memoryId === supersededOriginal.memory.id)).toBe(
            false
        );
        expect(retrieved.summary?.records.some((record) => record.memoryId === promptMatch.memory.id)).toBe(true);
        expect(retrieved.summary?.records.length).toBeLessThanOrEqual(4);
    });

    it('includes retrieved memory in the built run context and digest', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Digest retrieval thread',
            kind: 'local',
            topLevelTab: 'chat',
        });

        const memory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Digest memory',
            bodyMarkdown: 'First digest body.',
        });

        const firstContext = await buildRunContext({
            profileId,
            sessionId: created.session.id,
            prompt: 'Use the available memory.',
            topLevelTab: 'chat',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            resolvedMode: createResolvedMode('chat', 'chat'),
        });
        expect(firstContext.isOk()).toBe(true);
        if (firstContext.isErr() || !firstContext.value) {
            throw new Error(firstContext.isErr() ? firstContext.error.message : 'Expected first run context.');
        }
        expect(firstContext.value.retrievedMemory?.records.map((record) => record.title)).toEqual(['Digest memory']);
        expect(
            firstContext.value.messages.some((message) => JSON.stringify(message).includes('Retrieved memory'))
        ).toBe(true);

        const updated = await memoryService.updateMemory({
            profileId,
            memoryId: memory.memory.id,
            title: 'Digest memory updated',
            bodyMarkdown: 'Second digest body.',
        });
        expect(updated.isOk()).toBe(true);

        const secondContext = await buildRunContext({
            profileId,
            sessionId: created.session.id,
            prompt: 'Use the available memory.',
            topLevelTab: 'chat',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            resolvedMode: createResolvedMode('chat', 'chat'),
        });
        expect(secondContext.isOk()).toBe(true);
        if (secondContext.isErr() || !secondContext.value) {
            throw new Error(secondContext.isErr() ? secondContext.error.message : 'Expected second run context.');
        }
        expect(secondContext.value.digest).not.toBe(firstContext.value.digest);
        expect(secondContext.value.retrievedMemory?.records[0]?.title).toBe('Digest memory updated');
    });

    it('does not mutate pending projection edits while retrieving memory', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_projection_safety',
            title: 'Projection safety thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected projection safety thread id.');
        const memory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Projection safety memory',
            bodyMarkdown: 'Original body.',
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint: 'wsf_memory_retrieval_projection_safety',
            threadId,
        });
        const projected = synced.projectedMemories.find((record) => record.memory.id === memory.memory.id);
        if (!projected) {
            throw new Error('Expected projected memory for retrieval safety test.');
        }

        const editedContent =
            `---\n` +
            `id: "${memory.memory.id}"\n` +
            `memoryType: "procedural"\n` +
            `scopeKind: "thread"\n` +
            `state: "active"\n` +
            `title: "Projection safety memory edited"\n` +
            `threadId: "${threadId}"\n` +
            `workspaceFingerprint: "wsf_memory_retrieval_projection_safety"\n` +
            `metadata: {"edited":true}\n` +
            `---\n` +
            `Edited body that retrieval must not touch.\n`;
        writeFileSync(projected.absolutePath, editedContent, 'utf8');

        const beforeRetrieval = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint: 'wsf_memory_retrieval_projection_safety',
            threadId,
        });
        expect(beforeRetrieval.proposals).toHaveLength(1);

        const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'wsf_memory_retrieval_projection_safety',
            prompt: 'Use the projection safety memory.',
        });
        expect(retrieved.summary?.records.some((record) => record.memoryId === memory.memory.id)).toBe(true);

        const afterRetrieval = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint: 'wsf_memory_retrieval_projection_safety',
            threadId,
        });
        expect(afterRetrieval.proposals).toHaveLength(1);
        expect(afterRetrieval.proposals[0]?.proposedTitle).toBe('Projection safety memory edited');
    });

    it('falls back to scoped retrieval when the derived layer fails', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_fail_soft',
            title: 'Derived fail-soft thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected derived fail-soft thread id.');

        const scopedMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Fail-soft scoped memory',
            bodyMarkdown: 'Use the scoped memory even if derivation breaks.',
        });

        const expandSpy = vi.spyOn(advancedMemoryDerivationService, 'expandMatchedMemories').mockImplementation(() =>
            Promise.resolve(createHandledErrOp('request_failed', 'Derived retrieval failed.'))
        );
        const summariesSpy = vi.spyOn(advancedMemoryDerivationService, 'getDerivedSummaries').mockImplementation(() =>
            Promise.resolve(createHandledErrOp('request_failed', 'Derived summaries failed.'))
        );

        try {
            const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'wsf_memory_retrieval_fail_soft',
                prompt: 'Use the fail-soft scoped memory.',
            });

            expect(retrieved.summary?.records.map((record) => record.memoryId)).toContain(scopedMemory.memory.id);
            expect(retrieved.summary?.records.some((record) => record.matchReason === 'derived_temporal')).toBe(false);
        } finally {
            expandSpy.mockRestore();
            summariesSpy.mockRestore();
        }
    });

    it('returns semantic matches when other retrieval signals do not match and keeps semantic above prompt fallback', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Semantic retrieval thread',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const unrelated = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Unrelated semantic thread',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const unrelatedThreadId = requireEntityId(unrelated.thread.id, 'thr', 'Expected unrelated semantic thread id.');

        const semanticMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: unrelatedThreadId,
            title: 'Architectural retrieval note',
            bodyMarkdown: 'This describes retrieval architecture without direct prompt overlap.',
        });
        await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: unrelatedThreadId,
            title: 'Prompt fallback memory',
            bodyMarkdown: 'Use zebra fallback in the rare zebra case.',
        });

        const semanticSpy = vi.spyOn(memorySemanticIndexService, 'collectSemanticCandidates').mockResolvedValue([
            {
                memory: semanticMemory.memory,
                matchReason: 'semantic',
                tier: 'semantic',
                similarity: 0.94,
            },
        ]);

        try {
            const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'chat',
                modeKey: 'chat',
                prompt: 'Need architectural guidance about memory retrieval.',
            });

            expect(retrieved.summary?.records[0]?.memoryId).toBe(semanticMemory.memory.id);
            expect(retrieved.summary?.records[0]?.matchReason).toBe('semantic');
            expect(retrieved.summary?.records.some((record) => record.matchReason === 'prompt')).toBe(true);
            const promptIndex = retrieved.summary?.records.findIndex((record) => record.matchReason === 'prompt') ?? -1;
            expect(promptIndex).toBeGreaterThan(0);
        } finally {
            semanticSpy.mockRestore();
        }
    });

    it('fails soft when the semantic stage throws unexpectedly', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Semantic fail-soft thread',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const unrelated = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Prompt fallback source thread',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const unrelatedThreadId = requireEntityId(
            unrelated.thread.id,
            'thr',
            'Expected prompt fallback source thread id.'
        );

        const promptMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: unrelatedThreadId,
            title: 'Prompt fallback memory',
            bodyMarkdown: 'Use zebra fallback when the zebra prompt appears.',
        });

        const semanticSpy = vi
            .spyOn(memorySemanticIndexService, 'collectSemanticCandidates')
            .mockRejectedValue(new Error('semantic stage broke'));

        try {
            const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'chat',
                modeKey: 'chat',
                prompt: 'Need the zebra fallback.',
            });

            expect(retrieved.summary?.records[0]?.memoryId).toBe(promptMemory.memory.id);
            expect(retrieved.summary?.records[0]?.matchReason).toBe('prompt');
        } finally {
            semanticSpy.mockRestore();
        }
    });

    it('fails soft when evidence loading fails and still returns retrieved records', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Evidence fail-soft thread',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const supportingRun = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Evidence fail-soft run',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: true,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
            },
            transport: {},
        });

        const memory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Evidence-backed memory',
            bodyMarkdown: 'Evidence-backed body.',
            evidence: [
                {
                    kind: 'run',
                    label: 'Supporting run evidence',
                    sourceRunId: supportingRun.id,
                },
            ],
        });
        const evidenceSpy = vi
            .spyOn(memoryEvidenceStore, 'listByMemoryIds')
            .mockRejectedValue(new Error('Evidence load failed.'));

        try {
            const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'chat',
                modeKey: 'chat',
                prompt: 'Use the evidence-backed memory.',
            });

            expect(retrieved.summary?.records.some((record) => record.memoryId === memory.memory.id)).toBe(true);
            expect(
                retrieved.summary?.records.find((record) => record.memoryId === memory.memory.id)?.supportingEvidence
            ).toEqual([]);
        } finally {
            evidenceSpy.mockRestore();
        }
    });

    it('surfaces conflicting current truths for the same temporal subject when the prompt asks about conflict', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_conflict',
            title: 'Conflict retrieval thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected conflict retrieval thread id.');

        const first = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            temporalSubjectKey: 'subject::api-endpoint',
            title: 'Endpoint A',
            bodyMarkdown: 'Use endpoint A.',
        });
        const second = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            temporalSubjectKey: 'subject::api-endpoint',
            title: 'Endpoint B',
            bodyMarkdown: 'Use endpoint B.',
        });

        const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'wsf_memory_retrieval_conflict',
            prompt: 'There is a conflict about endpoint A. Which value disagrees?',
        });

        expect(retrieved.summary?.records.map((record) => record.memoryId)).toEqual(
            expect.arrayContaining([first.memory.id, second.memory.id])
        );
        expect(
            retrieved.summary?.records.filter(
                (record) => record.derivedSummary?.temporalStatus === 'conflicted'
            ).length
        ).toBeGreaterThanOrEqual(2);
    });

    it('surfaces graph-expanded neighbors from strong anchors before broad fallback', async () => {
        const caller = createCaller();
        const current = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_graph',
            title: 'Graph retrieval thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const currentThreadId = requireEntityId(current.thread.id, 'thr', 'Expected graph retrieval thread id.');
        const unrelated = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_retrieval_graph_other',
            title: 'Graph retrieval unrelated thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const unrelatedThreadId = requireEntityId(unrelated.thread.id, 'thr', 'Expected unrelated graph thread id.');
        const supportingRun = await runStore.create({
            profileId,
            sessionId: current.session.id,
            prompt: 'Graph retrieval shared evidence run.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });

        await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId: currentThreadId,
            title: 'Primary graph anchor',
            bodyMarkdown: 'Graph anchor memory for deployment.',
            evidence: [
                {
                    kind: 'run',
                    label: 'Shared evidence run',
                    sourceRunId: supportingRun.id,
                },
            ],
        });
        const graphNeighbor = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'system',
            threadId: unrelatedThreadId,
            title: 'Release follow-up note',
            bodyMarkdown: 'Use the secondary rollout checklist before publishing.',
            evidence: [
                {
                    kind: 'run',
                    label: 'Shared evidence run',
                    sourceRunId: supportingRun.id,
                },
            ],
        });
        await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Deployment prompt fallback',
            bodyMarkdown: 'Use the deployment fallback when the task says deployment.',
        });

        const retrieved = await memoryRetrievalService.retrieveRelevantMemory({
            profileId,
            sessionId: current.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'wsf_memory_retrieval_graph',
            prompt: 'Use the primary graph anchor for this deployment task.',
        });

        const graphExpandedRecord = retrieved.summary?.records.find((record) => record.memoryId === graphNeighbor.memory.id);
        const graphExpandedIndex =
            retrieved.summary?.records.findIndex((record) => record.matchReason === 'graph_expanded') ?? -1;
        const promptIndex = retrieved.summary?.records.findIndex((record) => record.matchReason === 'prompt') ?? -1;
        expect(graphExpandedRecord?.matchReason).toBe('graph_expanded');
        expect(retrieved.summary?.records.some((record) => record.matchReason === 'graph_expanded')).toBe(true);
        expect(graphExpandedIndex).toBeGreaterThanOrEqual(0);
        expect(promptIndex === -1 || graphExpandedIndex < promptIndex).toBe(true);
    });
});

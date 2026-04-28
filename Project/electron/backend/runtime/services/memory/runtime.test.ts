import { describe, expect, it, vi } from 'vitest';

import {
    messageStore,
    memoryEvidenceStore,
    memoryStore,
    runStore,
    runUsageStore,
    sessionStore,
    toolResultArtifactStore,
} from '@/app/backend/persistence/stores';
import { okOp } from '@/app/backend/runtime/services/common/operationalError';
import * as plainTextGeneration from '@/app/backend/runtime/services/common/plainTextGeneration';
import { memoryConsolidationService } from '@/app/backend/runtime/services/memory/memoryConsolidationService';
import { memoryRuntimeService } from '@/app/backend/runtime/services/memory/runtime';
import { utilityModelService } from '@/app/backend/runtime/services/profile/utilityModel';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

function createHandledOkOp<T>(value: T) {
    const result = okOp(value);
    result.match(
        () => undefined,
        () => undefined
    );
    return result;
}

describe('memoryRuntimeService', () => {
    const profileId = runtimeContractProfileId;

    it('creates one automatic episodic memory for a completed run and noops on unchanged recapture', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_runtime_completed',
            title: 'Memory runtime completed',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected completed runtime thread id.');
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Summarize the finished implementation.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });
        await runStore.finalize(run.id, {
            status: 'completed',
        });
        await sessionStore.markRunTerminal(profileId, created.session.id, 'completed');

        const assistantMessage = await messageStore.createMessage({
            profileId,
            sessionId: created.session.id,
            runId: run.id,
            role: 'assistant',
        });
        await messageStore.createPart({
            messageId: assistantMessage.id,
            partType: 'text',
            payload: {
                text: 'Finished the implementation and verified the tests.',
            },
        });
        const toolResultPart = await messageStore.createPart({
            messageId: assistantMessage.id,
            partType: 'tool_result',
            payload: {
                callId: 'call_1',
                toolName: 'run_command',
                outputText: 'ok',
                isError: false,
            },
        });
        await toolResultArtifactStore.create({
            messagePartId: toolResultPart.id,
            profileId,
            sessionId: created.session.id,
            runId: run.id,
            toolName: 'run_command',
            artifactKind: 'command_output',
            contentType: 'text/plain',
            rawText: 'ok',
            totalBytes: 2,
            totalLines: 1,
            previewText: 'ok',
            previewStrategy: 'head_only',
            metadata: {},
        });
        await runUsageStore.upsert({
            runId: run.id,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            billedVia: 'openai_api',
            inputTokens: 14,
            outputTokens: 28,
            totalTokens: 42,
        });

        const firstCapture = await memoryRuntimeService.captureFinishedRunMemory({
            profileId,
            runId: run.id,
        });
        expect(firstCapture.isOk()).toBe(true);
        if (firstCapture.isErr()) {
            throw new Error(firstCapture.error.message);
        }
        const firstMemory = firstCapture.value.memory;
        if (!firstMemory) {
            throw new Error('Expected first automatic memory.');
        }
        expect(firstCapture.value.action).toBe('created');
        expect(firstMemory.scopeKind).toBe('run');
        expect(firstMemory.memoryType).toBe('episodic');
        expect(firstMemory.createdByKind).toBe('system');
        expect(firstMemory.runId).toBe(run.id);
        expect(firstMemory.threadId).toBe(threadId);
        expect(firstMemory.metadata).toMatchObject({
            source: 'runtime_run_outcome',
            runStatus: 'completed',
            runId: run.id,
            sessionId: created.session.id,
            threadId,
        });
        expect(firstMemory.bodyMarkdown).toContain('Finished the implementation and verified the tests.');
        const firstEvidence = await memoryEvidenceStore.listByMemoryId(profileId, firstMemory.id);
        expect(firstEvidence.map((evidence) => evidence.kind)).toEqual(['run', 'message_part', 'tool_result_artifact']);

        const secondCapture = await memoryRuntimeService.captureFinishedRunMemory({
            profileId,
            runId: run.id,
        });
        expect(secondCapture.isOk()).toBe(true);
        if (secondCapture.isErr()) {
            throw new Error(secondCapture.error.message);
        }
        expect(secondCapture.value.action).toBe('noop');

        const memories = await memoryStore.listByProfile({
            profileId,
            runId: run.id,
        });
        const automaticMemories = memories.filter((memory) => memory.metadata['source'] === 'runtime_run_outcome');
        expect(automaticMemories).toHaveLength(1);
    });

    it('supersedes stale automatic runtime memory when finished-run facts improve later', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_runtime_supersede',
            title: 'Memory runtime supersede',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Capture the run outcome.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });
        await runStore.finalize(run.id, {
            status: 'completed',
        });
        await sessionStore.markRunTerminal(profileId, created.session.id, 'completed');

        const initialCapture = await memoryRuntimeService.captureFinishedRunMemory({
            profileId,
            runId: run.id,
        });
        expect(initialCapture.isOk()).toBe(true);
        if (initialCapture.isErr() || !initialCapture.value.memory) {
            throw new Error(
                initialCapture.isErr() ? initialCapture.error.message : 'Expected created automatic memory.'
            );
        }

        await runUsageStore.upsert({
            runId: run.id,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            billedVia: 'openai_api',
            totalTokens: 96,
            outputTokens: 61,
        });

        const refreshedCapture = await memoryRuntimeService.captureFinishedRunMemory({
            profileId,
            runId: run.id,
        });
        expect(refreshedCapture.isOk()).toBe(true);
        if (refreshedCapture.isErr()) {
            throw new Error(refreshedCapture.error.message);
        }
        expect(refreshedCapture.value.action).toBe('superseded');
        expect(refreshedCapture.value.previousMemory?.id).toBe(initialCapture.value.memory.id);
        const refreshedMemory = refreshedCapture.value.memory;
        const previousMemory = refreshedCapture.value.previousMemory;
        if (!refreshedMemory || !previousMemory) {
            throw new Error('Expected refreshed and previous automatic memory.');
        }
        expect(refreshedMemory.bodyMarkdown).toContain('total 96 tokens');
        const replacementEvidence = await memoryEvidenceStore.listByMemoryId(profileId, refreshedMemory.id);
        const previousEvidence = await memoryEvidenceStore.listByMemoryId(profileId, previousMemory.id);
        expect(replacementEvidence.length).toBeGreaterThan(0);
        expect(previousEvidence.length).toBeGreaterThan(0);

        const memories = await memoryStore.listByProfile({
            profileId,
            runId: run.id,
        });
        const automaticMemories = memories.filter((memory) => memory.metadata['source'] === 'runtime_run_outcome');
        expect(automaticMemories).toHaveLength(2);
        expect(automaticMemories.filter((memory) => memory.state === 'active')).toHaveLength(1);
        expect(automaticMemories.filter((memory) => memory.state === 'superseded')).toHaveLength(1);
    });

    it('skips automatic memory for aborted runs and does not touch user-authored memory', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_runtime_aborted',
            title: 'Memory runtime aborted',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Abort this run.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });
        await runStore.finalize(run.id, {
            status: 'aborted',
        });
        await sessionStore.markRunTerminal(profileId, created.session.id, 'aborted');

        const userMemory = await caller.memory.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'user',
            runId: run.id,
            title: 'User-authored run note',
            bodyMarkdown: 'Keep this untouched.',
        });

        const capture = await memoryRuntimeService.captureFinishedRunMemory({
            profileId,
            runId: run.id,
        });
        expect(capture.isOk()).toBe(true);
        if (capture.isErr()) {
            throw new Error(capture.error.message);
        }
        expect(capture.value.action).toBe('skipped');

        const memories = await memoryStore.listByProfile({
            profileId,
            runId: run.id,
        });
        expect(memories).toHaveLength(1);
        expect(memories[0]?.id).toBe(userMemory.memory.id);
        expect(memories[0]?.createdByKind).toBe('user');
    });

    it('materializes a consolidated memory from repeated episodic run memories after safe capture', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_runtime_consolidation',
            title: 'Memory runtime consolidation',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected consolidation thread id.');
        const utilitySpy = vi.spyOn(utilityModelService, 'getUtilityModelPreference').mockResolvedValue({
            selection: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
        });
        const generationSpy = vi.spyOn(plainTextGeneration, 'generatePlainTextFromMessages');
        generationSpy.mockImplementation(() =>
            Promise.resolve(
                createHandledOkOp(
                    JSON.stringify({
                        targetMemoryType: 'procedural',
                        title: 'Preferred deployment workflow',
                        summaryText: 'Repeated run outcomes converge on one workflow.',
                        bodyMarkdown: 'Always validate the deployment workflow before publishing.',
                        temporalSubjectKey: 'subject::preferred-deployment-workflow',
                        confidenceLabel: 'high',
                    })
                )
            )
        );

        try {
            for (const runIndex of [1, 2]) {
                const run = await runStore.create({
                    profileId,
                    sessionId: created.session.id,
                    prompt: 'Capture the deployment workflow outcome.',
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                    authMethod: 'api_key',
                    runtimeOptions: defaultRuntimeOptions,
                    cache: { applied: false },
                    transport: {},
                });
                await runStore.finalize(run.id, {
                    status: 'completed',
                });
                await sessionStore.markRunTerminal(profileId, created.session.id, 'completed');
                const assistantMessage = await messageStore.createMessage({
                    profileId,
                    sessionId: created.session.id,
                    runId: run.id,
                    role: 'assistant',
                });
                await messageStore.createPart({
                    messageId: assistantMessage.id,
                    partType: 'text',
                    payload: {
                        text: `Workflow capture ${String(runIndex)} completed successfully.`,
                    },
                });

                await memoryRuntimeService.captureFinishedRunMemorySafely({
                    profileId,
                    runId: run.id,
                });
            }

            const consolidatedMemories = (await memoryStore.listByProfile({
                profileId,
                memoryType: 'procedural',
                scopeKind: 'thread',
            })).filter((memory) => memory.metadata['source'] === 'memory_consolidation');
            expect(consolidatedMemories).toHaveLength(1);
            const [consolidatedMemory] = consolidatedMemories;
            if (!consolidatedMemory) {
                throw new Error('Expected materialized consolidated memory.');
            }
            expect(consolidatedMemory.createdByKind).toBe('system');
            expect(consolidatedMemory.threadId).toBe(threadId);
            expect(consolidatedMemory.temporalSubjectKey).toBe('subject::preferred-deployment-workflow');
            const evidence = await memoryEvidenceStore.listByMemoryId(profileId, consolidatedMemory.id);
            expect(evidence.length).toBeGreaterThanOrEqual(2);
        } finally {
            generationSpy.mockRestore();
            utilitySpy.mockRestore();
        }
    });

    it('excludes inactive sources from consolidation clusters and does not reuse disabled materialized memory', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_runtime_consolidation_active_sources',
            title: 'Memory runtime active-source consolidation',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected active-source consolidation thread id.');
        const utilitySpy = vi.spyOn(utilityModelService, 'getUtilityModelPreference').mockResolvedValue({
            selection: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
        });
        const generationSpy = vi.spyOn(plainTextGeneration, 'generatePlainTextFromMessages');
        generationSpy.mockImplementation(() =>
            Promise.resolve(
                createHandledOkOp(
                    JSON.stringify({
                        targetMemoryType: 'procedural',
                        title: 'Active source workflow',
                        summaryText: 'Only active source memories should drive this consolidation.',
                        bodyMarkdown: 'Use only active source memories when consolidating repeated run outcomes.',
                        temporalSubjectKey: 'subject::active-source-workflow',
                        confidenceLabel: 'high',
                    })
                )
            )
        );

        try {
            const firstRun = await runStore.create({
                profileId,
                sessionId: created.session.id,
                prompt: 'Capture active source workflow.',
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
                prompt: 'Capture refreshed source workflow.',
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
                prompt: 'Capture disabled source workflow.',
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
                temporalSubjectKey: 'subject::active-source-workflow',
                title: 'First active workflow source',
                bodyMarkdown: 'First active source body.',
                evidence: [
                    {
                        kind: 'run',
                        label: 'First source evidence A',
                        sourceRunId: firstRun.id,
                    },
                    {
                        kind: 'run',
                        label: 'First source evidence B',
                        sourceRunId: firstRun.id,
                    },
                ],
            });
            const staleSource = await caller.memory.create({
                profileId,
                memoryType: 'episodic',
                scopeKind: 'run',
                createdByKind: 'system',
                runId: secondRun.id,
                temporalSubjectKey: 'subject::active-source-workflow',
                title: 'Stale workflow source',
                bodyMarkdown: 'Stale source body.',
                evidence: [
                    {
                        kind: 'run',
                        label: 'Stale source evidence A',
                        sourceRunId: secondRun.id,
                    },
                    {
                        kind: 'run',
                        label: 'Stale source evidence B',
                        sourceRunId: secondRun.id,
                    },
                ],
            });
            const refreshedSource = await caller.memory.supersede({
                profileId,
                memoryId: staleSource.memory.id,
                createdByKind: 'system',
                title: 'Refreshed workflow source',
                bodyMarkdown: 'Refreshed source body.',
                revisionReason: 'refinement',
                evidence: [
                    {
                        kind: 'run',
                        label: 'Refreshed source evidence A',
                        sourceRunId: secondRun.id,
                    },
                    {
                        kind: 'run',
                        label: 'Refreshed source evidence B',
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
                workspaceFingerprint: 'wsf_memory_runtime_consolidation_active_sources',
                temporalSubjectKey: 'subject::active-source-workflow',
                title: 'Disabled workflow source',
                bodyMarkdown: 'Disabled source body.',
            });

            const firstRecord = await memoryConsolidationService.consolidateFromRunMemory({
                profileId,
                memoryId: refreshedSource.replacement.id,
            });
            expect(firstRecord?.state).toBe('materialized');
            expect(firstRecord?.materializedMemoryId).toBeDefined();
            const firstMaterializedMemory = firstRecord?.materializedMemoryId
                ? await memoryStore.getById(profileId, firstRecord.materializedMemoryId)
                : null;
            const clusterMemoryIds = firstMaterializedMemory?.metadata['clusterMemoryIds'];
            expect(Array.isArray(clusterMemoryIds)).toBe(true);
            if (!Array.isArray(clusterMemoryIds) || !firstRecord?.materializedMemoryId) {
                throw new Error('Expected materialized consolidation metadata.');
            }
            expect(clusterMemoryIds).toEqual(
                expect.arrayContaining([firstSource.memory.id, refreshedSource.replacement.id])
            );
            expect(clusterMemoryIds).not.toContain(staleSource.memory.id);
            expect(clusterMemoryIds).not.toContain(disabledSource.id);

            const disabledMaterialized = await memoryStore.disable(profileId, firstRecord.materializedMemoryId);
            expect(disabledMaterialized?.state).toBe('disabled');

            const secondRecord = await memoryConsolidationService.consolidateFromRunMemory({
                profileId,
                memoryId: refreshedSource.replacement.id,
            });
            expect(secondRecord?.state).toBe('materialized');
            expect(secondRecord?.materializedMemoryId).toBeDefined();
            expect(secondRecord?.materializedMemoryId).not.toBe(firstRecord.materializedMemoryId);
            const secondMaterializedMemory = secondRecord?.materializedMemoryId
                ? await memoryStore.getById(profileId, secondRecord.materializedMemoryId)
                : null;
            expect(secondMaterializedMemory?.state).toBe('active');
        } finally {
            generationSpy.mockRestore();
            utilitySpy.mockRestore();
        }
    });
});

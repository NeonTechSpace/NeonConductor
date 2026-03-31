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
        expect(firstCapture.value.action).toBe('created');
        expect(firstCapture.value.memory?.scopeKind).toBe('run');
        expect(firstCapture.value.memory?.memoryType).toBe('episodic');
        expect(firstCapture.value.memory?.createdByKind).toBe('system');
        expect(firstCapture.value.memory?.runId).toBe(run.id);
        expect(firstCapture.value.memory?.threadId).toBe(threadId);
        expect(firstCapture.value.memory?.metadata).toMatchObject({
            source: 'runtime_run_outcome',
            runStatus: 'completed',
            runId: run.id,
            sessionId: created.session.id,
            threadId,
        });
        expect(firstCapture.value.memory?.bodyMarkdown).toContain(
            'Finished the implementation and verified the tests.'
        );
        const firstEvidence = await memoryEvidenceStore.listByMemoryId(profileId, firstCapture.value.memory!.id);
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
        expect(refreshedCapture.value.memory?.bodyMarkdown).toContain('total 96 tokens');
        const replacementEvidence = await memoryEvidenceStore.listByMemoryId(profileId, refreshedCapture.value.memory!.id);
        const previousEvidence = await memoryEvidenceStore.listByMemoryId(
            profileId,
            refreshedCapture.value.previousMemory!.id
        );
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
        generationSpy.mockResolvedValue(
            okOp(
                JSON.stringify({
                    targetMemoryType: 'procedural',
                    title: 'Preferred deployment workflow',
                    summaryText: 'Repeated run outcomes converge on one workflow.',
                    bodyMarkdown: 'Always validate the deployment workflow before publishing.',
                    temporalSubjectKey: 'subject::preferred-deployment-workflow',
                    confidenceLabel: 'high',
                })
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
            expect(consolidatedMemories[0]?.createdByKind).toBe('system');
            expect(consolidatedMemories[0]?.threadId).toBe(threadId);
            expect(consolidatedMemories[0]?.temporalSubjectKey).toBe('subject::preferred-deployment-workflow');
            const evidence = await memoryEvidenceStore.listByMemoryId(profileId, consolidatedMemories[0]!.id);
            expect(evidence.length).toBeGreaterThanOrEqual(2);
        } finally {
            generationSpy.mockRestore();
            utilitySpy.mockRestore();
        }
    });
});

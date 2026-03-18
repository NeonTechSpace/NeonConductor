import { describe, expect, it } from 'vitest';

import { messageStore, memoryStore, runStore, runUsageStore, sessionStore } from '@/app/backend/persistence/stores';
import { memoryRuntimeService } from '@/app/backend/runtime/services/memory/runtime';
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
        await messageStore.createPart({
            messageId: assistantMessage.id,
            partType: 'tool_result',
            payload: {
                callId: 'call_1',
                toolName: 'run_command',
                outputText: 'ok',
                isError: false,
            },
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
        expect(firstCapture.value.memory?.bodyMarkdown).toContain('Finished the implementation and verified the tests.');

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
            throw new Error(initialCapture.isErr() ? initialCapture.error.message : 'Expected created automatic memory.');
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
});

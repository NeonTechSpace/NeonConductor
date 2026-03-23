import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    requireEntityId,
    waitForRunStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import { permissionStore, threadStore } from '@/app/backend/persistence/stores';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';

registerRuntimeContractHooks();

function buildTinyPngBase64(): string {
    return Buffer.from(
        Uint8Array.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00,
            0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0xfc, 0xff, 0x1f, 0x00, 0x02, 0xeb, 0x01, 0xf6, 0xcf, 0x28,
            0x14, 0xac, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ])
    ).toString('base64');
}

describe('runtime contracts: conversation and runs', () => {
    const profileId = runtimeContractProfileId;

    it('persists image attachments, exposes media reads, and replays multimodal context', async () => {
        const caller = createCaller();
        const requestBodies: Array<Record<string, unknown>> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string, init?: RequestInit) => {
                if (typeof init?.body === 'string') {
                    requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
                }

                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        output: [
                            {
                                type: 'message',
                                content: [
                                    {
                                        type: 'output_text',
                                        text: 'Vision response',
                                    },
                                ],
                            },
                        ],
                        usage: {
                            input_tokens: 14,
                            output_tokens: 9,
                            total_tokens: 23,
                        },
                    }),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-vision-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Vision Thread',
            kind: 'local',
        });

        const pngBytesBase64 = buildTinyPngBase64();
        const firstRun = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Describe this image',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            attachments: [
                {
                    clientId: 'img-test-1',
                    mimeType: 'image/png',
                    bytesBase64: pngBytesBase64,
                    width: 1,
                    height: 1,
                    sha256: 'test-image-sha256',
                },
            ],
        });
        expect(firstRun.accepted).toBe(true);
        if (!firstRun.accepted) {
            throw new Error('Expected first multimodal run to start.');
        }
        expect(firstRun.initialMessages.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
        expect(firstRun.initialMessages.messageParts.some((part) => part.partType === 'image')).toBe(true);
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const firstMessages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
            runId: firstRun.runId,
        });
        const imagePart = firstMessages.messageParts.find((part) => part.partType === 'image');
        expect(imagePart).toBeDefined();
        if (!imagePart) {
            throw new Error('Expected persisted image message part.');
        }
        expect(imagePart.payload['mediaId']).toEqual(expect.stringMatching(/^media_/));

        const mediaId = requireEntityId(
            typeof imagePart.payload['mediaId'] === 'string' ? imagePart.payload['mediaId'] : undefined,
            'media',
            'Expected persisted media id.'
        );

        const media = await caller.session.getMessageMedia({
            profileId,
            mediaId,
        });
        expect(media.found).toBe(true);
        if (!media.found) {
            throw new Error('Expected persisted message media.');
        }
        expect(media.mimeType).toBe('image/png');
        expect(media.bytes).toEqual(Uint8Array.from(Buffer.from(pngBytesBase64, 'base64')));
        expect(media.byteSize).toBeGreaterThan(0);

        const contextState = await caller.context.getResolvedState({
            profileId,
            sessionId: created.session.id,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            topLevelTab: 'chat',
            modeKey: 'chat',
        });
        expect(contextState.policy.disabledReason).toBe('multimodal_counting_unavailable');
        expect(contextState.compactable).toBe(false);

        const secondRun = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Now continue without another image',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(secondRun.accepted).toBe(true);
        if (!secondRun.accepted) {
            throw new Error('Expected second multimodal replay run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const firstRequestInput = Array.isArray(requestBodies[0]?.['input']) ? requestBodies[0]['input'] : [];
        const secondRequestInput = Array.isArray(requestBodies[1]?.['input']) ? requestBodies[1]['input'] : [];
        const firstRequestContent = firstRequestInput.flatMap((message) =>
            typeof message === 'object' && message !== null && Array.isArray((message as { content?: unknown }).content)
                ? (message as { content: unknown[] }).content
                : []
        );
        const secondRequestContent = secondRequestInput.flatMap((message) =>
            typeof message === 'object' && message !== null && Array.isArray((message as { content?: unknown }).content)
                ? (message as { content: unknown[] }).content
                : []
        );

        expect(
            firstRequestContent.some(
                (entry) =>
                    typeof entry === 'object' && entry !== null && (entry as { type?: unknown }).type === 'input_image'
            )
        ).toBe(true);
        expect(
            secondRequestContent.some(
                (entry) =>
                    typeof entry === 'object' && entry !== null && (entry as { type?: unknown }).type === 'input_image'
            )
        ).toBe(true);
    });

    it('defaults mutating workspace threads to sticky sandboxes and lazily materializes them on first run', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-sandbox-default-'));

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    choices: [
                        {
                            message: {
                                content: 'sandboxed run complete',
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 20,
                        total_tokens: 30,
                    },
                }),
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-sandbox-default-key',
        });
        expect(configured.success).toBe(true);

        const agentThread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Agent sandbox default',
        });
        const orchestratorThread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'orchestrator',
            scope: 'workspace',
            workspacePath,
            title: 'Orchestrator sandbox default',
        });
        const chatThread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'chat',
            scope: 'workspace',
            workspacePath,
            title: 'Chat local default',
        });

        expect(agentThread.thread.executionEnvironmentMode).toBe('new_sandbox');
        expect(orchestratorThread.thread.executionEnvironmentMode).toBe('new_sandbox');
        expect(chatThread.thread.executionEnvironmentMode).toBe('local');
        expect(agentThread.thread.sandboxId).toBeUndefined();

        const session = await caller.session.create({
            profileId,
            threadId: requireEntityId(agentThread.thread.id, 'thr', 'Expected agent thread id.'),
            kind: 'local',
        });
        expect(session.created).toBe(true);
        if (!session.created) {
            throw new Error('Expected sandbox-default session creation.');
        }

        const started = await caller.session.startRun({
            profileId,
            sessionId: session.session.id,
            prompt: 'Create the sandbox now',
            topLevelTab: 'agent',
            modeKey: 'code',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error(`Expected sandbox-default run start, received "${started.reason}".`);
        }
        expect(started.thread?.executionEnvironmentMode).toBe('sandbox');
        expect(started.thread?.sandboxId).toEqual(expect.stringMatching(/^sb_/));
        await waitForRunStatus(caller, profileId, session.session.id, 'completed');

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('fails closed when managed sandbox materialization is unavailable', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-sandbox-fail-closed-'));

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-sandbox-fail-closed-key',
        });
        expect(configured.success).toBe(true);

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Sandbox fail closed',
        });
        expect(thread.thread.executionEnvironmentMode).toBe('new_sandbox');

        const session = await caller.session.create({
            profileId,
            threadId: requireEntityId(thread.thread.id, 'thr', 'Expected sandbox fail-closed thread id.'),
            kind: 'local',
        });
        expect(session.created).toBe(true);
        if (!session.created) {
            throw new Error('Expected sandbox fail-closed session creation.');
        }

        rmSync(workspacePath, { recursive: true, force: true });

        const started = await caller.session.startRun({
            profileId,
            sessionId: session.session.id,
            prompt: 'This should fail before touching the workspace',
            topLevelTab: 'agent',
            modeKey: 'code',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected sandbox materialization failure to reject the run.');
        }
        expect(started.reason).toBe('rejected');
        expect(started.code).toBe('provider_request_unavailable');
        expect(started.message).toContain('Managed sandbox');
    });

    it('supports session lifecycle with run execution, abort, and revert', async () => {
        const caller = createCaller();
        const completionFetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    choices: [
                        {
                            message: {
                                content: 'First completion response',
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 20,
                        total_tokens: 30,
                    },
                }),
            })
            .mockImplementationOnce((_url: string, init?: RequestInit) => {
                const signal = init?.signal;
                return new Promise((_, reject) => {
                    const onAbort = () => {
                        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
                    };

                    signal?.addEventListener('abort', onAbort, { once: true });
                });
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    choices: [
                        {
                            message: {
                                content: 'Agent completion response',
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 8,
                        completion_tokens: 12,
                        total_tokens: 20,
                    },
                }),
            });
        vi.stubGlobal('fetch', completionFetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Lifecycle Thread',
            kind: 'local',
        });
        const sessionId = created.session.id;

        const initialStatus = await caller.session.status({ profileId, sessionId });
        expect(initialStatus.found).toBe(true);
        if (!initialStatus.found) {
            throw new Error('Expected session to exist.');
        }
        expect(initialStatus.session.runStatus).toBe('idle');

        const firstRun = await caller.session.startRun({
            profileId,
            sessionId,
            prompt: 'First prompt',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(firstRun.accepted).toBe(true);
        if (!firstRun.accepted) {
            throw new Error('Expected first run start to succeed.');
        }
        await waitForRunStatus(caller, profileId, sessionId, 'completed');

        const completedStatus = await caller.session.status({ profileId, sessionId });
        expect(completedStatus.found).toBe(true);
        if (!completedStatus.found) {
            throw new Error('Expected session to exist after prompt.');
        }
        expect(completedStatus.session.runStatus).toBe('completed');
        expect(completedStatus.session.turnCount).toBe(1);

        const messages = await caller.session.listMessages({
            profileId,
            sessionId,
            runId: firstRun.runId,
        });
        expect(messages.messages.length).toBe(2);
        expect(messages.messageParts.some((part) => part.partType === 'text')).toBe(true);

        const secondRun = await caller.session.startRun({
            profileId,
            sessionId,
            prompt: 'Second prompt',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(secondRun.accepted).toBe(true);
        if (!secondRun.accepted) {
            throw new Error('Expected second run start to succeed.');
        }

        const aborted = await caller.session.abort({ profileId, sessionId });
        expect(aborted.aborted).toBe(true);

        await waitForRunStatus(caller, profileId, sessionId, 'aborted');
        const afterAbort = await caller.session.status({ profileId, sessionId });
        expect(afterAbort.found).toBe(true);
        if (!afterAbort.found) {
            throw new Error('Expected session to exist after abort.');
        }
        expect(afterAbort.session.runStatus).toBe('aborted');
        expect(afterAbort.session.turnCount).toBe(2);

        const chatRevert = await caller.session.revert({ profileId, sessionId, topLevelTab: 'chat' });
        expect(chatRevert.reverted).toBe(false);

        const mismatchedRevert = await caller.session.revert({ profileId, sessionId, topLevelTab: 'agent' });
        expect(mismatchedRevert.reverted).toBe(false);

        const createdAgent = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_revert_agent_scope',
            title: 'Agent Revert Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const agentRun = await caller.session.startRun({
            profileId,
            sessionId: createdAgent.session.id,
            prompt: 'Agent revert prompt',
            topLevelTab: 'agent',
            modeKey: 'code',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(agentRun.accepted).toBe(true);
        if (!agentRun.accepted) {
            throw new Error('Expected agent run start before revert.');
        }
        await waitForRunStatus(caller, profileId, createdAgent.session.id, 'completed');

        const reverted = await caller.session.revert({
            profileId,
            sessionId: createdAgent.session.id,
            topLevelTab: 'agent',
        });
        expect(reverted.reverted).toBe(true);
        if (!reverted.reverted) {
            throw new Error('Expected agent revert to succeed.');
        }
        expect(reverted.session.turnCount).toBe(0);
        expect(reverted.session.runStatus).toBe('idle');
    });

    it('supports session edit truncate and branch across all tabs with chat-only replay', async () => {
        const caller = createCaller();
        const requestBodies: Array<Record<string, unknown>> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string, init?: RequestInit) => {
                const body = init?.body;
                if (typeof body === 'string') {
                    requestBodies.push(JSON.parse(body) as Record<string, unknown>);
                }

                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'ok',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 20,
                            total_tokens: 30,
                        },
                    }),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-edit-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Edit + Branch Thread',
            kind: 'local',
        });
        const sessionId = created.session.id;

        const firstRun = await caller.session.startRun({
            profileId,
            sessionId,
            prompt: 'first',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(firstRun.accepted).toBe(true);
        if (!firstRun.accepted) {
            throw new Error('Expected first run to start.');
        }
        await waitForRunStatus(caller, profileId, sessionId, 'completed');

        const secondRun = await caller.session.startRun({
            profileId,
            sessionId,
            prompt: 'second',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(secondRun.accepted).toBe(true);
        if (!secondRun.accepted) {
            throw new Error('Expected second run to start.');
        }
        await waitForRunStatus(caller, profileId, sessionId, 'completed');

        const beforeEditMessages = await caller.session.listMessages({ profileId, sessionId });
        const beforeEditUserMessages = beforeEditMessages.messages.filter((message) => message.role === 'user');
        const secondUserMessage = beforeEditUserMessages.at(1);
        if (!secondUserMessage) {
            throw new Error('Expected second user message.');
        }

        const truncated = await caller.session.edit({
            profileId,
            sessionId,
            topLevelTab: 'chat',
            modeKey: 'chat',
            messageId: secondUserMessage.id,
            replacementText: 'second edited in chat tab',
            editMode: 'truncate',
            autoStartRun: true,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(truncated.edited).toBe(true);
        if (!truncated.edited) {
            throw new Error(`Expected truncate edit to succeed, received reason "${truncated.reason}".`);
        }
        expect(truncated.sessionId).toBe(sessionId);
        if (truncated.started && truncated.runId) {
            await waitForRunStatus(caller, profileId, sessionId, 'completed');
        }

        const statusAfterTruncate = await caller.session.status({ profileId, sessionId });
        expect(statusAfterTruncate.found).toBe(true);
        if (!statusAfterTruncate.found) {
            throw new Error('Expected session after truncate edit.');
        }
        expect(statusAfterTruncate.session.turnCount).toBe(2);

        const afterEditMessages = await caller.session.listMessages({ profileId, sessionId });
        const afterEditUserMessages = afterEditMessages.messages.filter((message) => message.role === 'user');
        const latestUserMessage = afterEditUserMessages.at(-1);
        if (!latestUserMessage) {
            throw new Error('Expected latest user message after truncate.');
        }

        const mismatchedAgentEdit = await caller.session.edit({
            profileId,
            sessionId,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: latestUserMessage.id,
            replacementText: 'branch prompt for agent tab',
            editMode: 'branch',
            autoStartRun: true,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(mismatchedAgentEdit.edited).toBe(false);
        if (mismatchedAgentEdit.edited) {
            throw new Error('Expected cross-tab edit to fail.');
        }
        expect(mismatchedAgentEdit.reason).toBe('thread_tab_mismatch');

        const mismatchedOrchestratorEdit = await caller.session.edit({
            profileId,
            sessionId,
            topLevelTab: 'orchestrator',
            modeKey: 'orchestrate',
            messageId: latestUserMessage.id,
            replacementText: 'branch prompt for orchestrator tab',
            editMode: 'branch',
            autoStartRun: true,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(mismatchedOrchestratorEdit.edited).toBe(false);
        if (mismatchedOrchestratorEdit.edited) {
            throw new Error('Expected cross-tab edit to fail.');
        }
        expect(mismatchedOrchestratorEdit.reason).toBe('thread_tab_mismatch');

        const branchedChat = await caller.session.edit({
            profileId,
            sessionId,
            topLevelTab: 'chat',
            modeKey: 'chat',
            messageId: latestUserMessage.id,
            replacementText: 'branch prompt for chat tab',
            editMode: 'branch',
            autoStartRun: true,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(branchedChat.edited).toBe(true);
        if (!branchedChat.edited) {
            throw new Error(`Expected chat branch edit to succeed, received reason "${branchedChat.reason}".`);
        }
        expect(branchedChat.sessionId).not.toBe(sessionId);
        expect(branchedChat.started).toBe(true);
        if (branchedChat.started) {
            await waitForRunStatus(caller, profileId, branchedChat.sessionId, 'completed');
        }
        if (!branchedChat.threadId) {
            throw new Error('Expected chat branch to create a new thread.');
        }

        const branchChatRuns = await caller.session.listRuns({
            profileId,
            sessionId: branchedChat.sessionId,
        });
        expect(branchChatRuns.runs.length).toBe(2);

        const sourceRuns = await caller.session.listRuns({
            profileId,
            sessionId,
        });
        expect(sourceRuns.runs.length).toBe(2);

        const createdAgent = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_edit_agent_scope',
            title: 'Agent branch thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const agentFirstRun = await caller.session.startRun({
            profileId,
            sessionId: createdAgent.session.id,
            prompt: 'agent first',
            topLevelTab: 'agent',
            modeKey: 'code',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(agentFirstRun.accepted).toBe(true);
        if (!agentFirstRun.accepted) {
            throw new Error('Expected agent first run.');
        }
        await waitForRunStatus(caller, profileId, createdAgent.session.id, 'completed');
        const agentMessages = await caller.session.listMessages({ profileId, sessionId: createdAgent.session.id });
        const agentUserMessage = agentMessages.messages.find((message) => message.role === 'user');
        if (!agentUserMessage) {
            throw new Error('Expected agent user message.');
        }
        const branchedAgent = await caller.session.edit({
            profileId,
            sessionId: createdAgent.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: agentUserMessage.id,
            replacementText: 'agent branch prompt',
            editMode: 'branch',
            autoStartRun: true,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(branchedAgent.edited).toBe(true);
        if (!branchedAgent.edited) {
            throw new Error('Expected agent branch edit.');
        }
        if (branchedAgent.started) {
            await waitForRunStatus(caller, profileId, branchedAgent.sessionId, 'completed');
        }

        const createdOrchestrator = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_edit_orchestrator_scope',
            title: 'Orchestrator branch thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });
        const orchestratorFirstRun = await caller.session.startRun({
            profileId,
            sessionId: createdOrchestrator.session.id,
            prompt: 'orchestrator first',
            topLevelTab: 'orchestrator',
            modeKey: 'orchestrate',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(orchestratorFirstRun.accepted).toBe(true);
        if (!orchestratorFirstRun.accepted) {
            throw new Error('Expected orchestrator first run.');
        }
        await waitForRunStatus(caller, profileId, createdOrchestrator.session.id, 'completed');
        const orchestratorMessages = await caller.session.listMessages({
            profileId,
            sessionId: createdOrchestrator.session.id,
        });
        const orchestratorUserMessage = orchestratorMessages.messages.find((message) => message.role === 'user');
        if (!orchestratorUserMessage) {
            throw new Error('Expected orchestrator user message.');
        }
        const branchedOrchestrator = await caller.session.edit({
            profileId,
            sessionId: createdOrchestrator.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'orchestrate',
            messageId: orchestratorUserMessage.id,
            replacementText: 'orchestrator branch prompt',
            editMode: 'branch',
            autoStartRun: true,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(branchedOrchestrator.edited).toBe(true);
        if (!branchedOrchestrator.edited) {
            throw new Error('Expected orchestrator branch edit.');
        }
        if (branchedOrchestrator.started) {
            await waitForRunStatus(caller, profileId, branchedOrchestrator.sessionId, 'completed');
        }

        const secondChatBody = requestBodies[1];
        const secondChatInput = Array.isArray(secondChatBody?.['input']) ? secondChatBody['input'] : [];
        expect(secondChatInput.length).toBeGreaterThan(1);

        const agentBranchBody = requestBodies[3];
        const agentBranchInput = Array.isArray(agentBranchBody?.['input']) ? agentBranchBody['input'] : [];
        expect(agentBranchInput.length).toBeGreaterThan(0);

        const orchestratorBranchBody = requestBodies[5];
        const orchestratorBranchInput = Array.isArray(orchestratorBranchBody?.['input'])
            ? orchestratorBranchBody['input']
            : [];
        expect(orchestratorBranchInput.length).toBeGreaterThan(0);
    });

    it('branches directly from assistant messages without starting a new run', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'assistant response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 8,
                            completion_tokens: 12,
                            total_tokens: 20,
                        },
                    }),
                })
            )
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-direct-branch-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Direct branch thread',
            kind: 'local',
        });

        const firstRun = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'first',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(firstRun.accepted).toBe(true);
        if (!firstRun.accepted) {
            throw new Error('Expected first run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const secondRun = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'second',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(secondRun.accepted).toBe(true);
        if (!secondRun.accepted) {
            throw new Error('Expected second run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const sourceMessages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
        });
        const assistantMessage = sourceMessages.messages.filter((message) => message.role === 'assistant').at(-1);
        if (!assistantMessage) {
            throw new Error('Expected assistant message to branch from.');
        }

        const branched = await caller.session.branchFromMessage({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'chat',
            messageId: assistantMessage.id,
        });
        expect(branched.branched).toBe(true);
        if (!branched.branched) {
            throw new Error(`Expected direct branch to succeed, received "${branched.reason}".`);
        }
        expect(branched.sessionId).not.toBe(created.session.id);

        const branchRuns = await caller.session.listRuns({
            profileId,
            sessionId: branched.sessionId,
        });
        expect(branchRuns.runs).toHaveLength(2);

        const branchMessages = await caller.session.listMessages({
            profileId,
            sessionId: branched.sessionId,
        });
        expect(branchMessages.messages).toHaveLength(4);

        const branchStatus = await caller.session.status({
            profileId,
            sessionId: branched.sessionId,
        });
        expect(branchStatus.found).toBe(true);
        if (!branchStatus.found) {
            throw new Error('Expected direct branch session to exist.');
        }
        expect(branchStatus.activeRunId).toBeNull();
        expect(branchStatus.session.turnCount).toBe(2);
    });

    it('creates an isolated fresh sandbox target for workflow-capable branches even with no workflow selected', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'assistant response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 8,
                            completion_tokens: 12,
                            total_tokens: 20,
                        },
                    }),
                })
            )
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-branch-workflow-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_branch_workflow_noop',
            title: 'Workflow Branch Agent Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const workspaceFingerprint = 'ws_branch_workflow_noop';

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Create branchable history',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected source run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const sourceThreadRecord = await threadStore.getBySessionId(profileId, created.session.id);
        expect(sourceThreadRecord?.thread.sandboxId).toBeDefined();
        const sourceMessages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
        });
        const branchMessage = sourceMessages.messages.filter((message) => message.role === 'assistant').at(-1);
        if (!branchMessage) {
            throw new Error('Expected assistant message for branch target.');
        }

        const branched = await caller.session.branchFromMessageWithWorkflow({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: branchMessage.id,
        });
        expect(branched.branched).toBe(true);
        if (!branched.branched) {
            throw new Error(`Expected workflow branch to succeed, received "${branched.reason}".`);
        }
        expect(branched.workflowExecution.status).toBe('not_requested');
        expect(branched.thread.sandboxId).toBeDefined();
        expect(branched.thread.sandboxId).not.toBe(sourceThreadRecord?.thread.sandboxId);
    });

    it('creates a permission request for branch workflows that need shell approval and keeps the branch', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'assistant response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 8,
                            completion_tokens: 12,
                            total_tokens: 20,
                        },
                    }),
                })
            )
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-branch-workflow-approval-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_branch_workflow_approval',
            title: 'Workflow Branch Approval Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const workspaceFingerprint = 'ws_branch_workflow_approval';

        const run = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Need a workflow branch',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(run.accepted).toBe(true);
        if (!run.accepted) {
            throw new Error('Expected source run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const workflow = await caller.workflow.create({
            profileId,
            workspaceFingerprint,
            label: 'Install deps',
            command: 'pnpm install',
            enabled: true,
        });
        const messages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
        });
        const branchMessage = messages.messages.filter((message) => message.role === 'assistant').at(-1);
        if (!branchMessage) {
            throw new Error('Expected assistant message for branch target.');
        }

        const branched = await caller.session.branchFromMessageWithWorkflow({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: branchMessage.id,
            workflowId: workflow.workflow.id,
        });
        expect(branched.branched).toBe(true);
        if (!branched.branched) {
            throw new Error(`Expected workflow branch to succeed, received "${branched.reason}".`);
        }
        expect(branched.workflowExecution.status).toBe('approval_required');
        if (branched.workflowExecution.status !== 'approval_required') {
            throw new Error('Expected workflow approval requirement.');
        }
        const permissionRequestId = branched.workflowExecution.requestId;
        const pendingPermissions = await caller.permission.listPending();
        expect(pendingPermissions.requests.some((request) => request.id === permissionRequestId)).toBe(true);

        const branchStatus = await caller.session.status({
            profileId,
            sessionId: branched.sessionId,
        });
        expect(branchStatus.found).toBe(true);
    });

    it('keeps the new branch and leaves source state untouched when workflow execution fails', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'assistant response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 8,
                            completion_tokens: 12,
                            total_tokens: 20,
                        },
                    }),
                })
            )
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-branch-workflow-failure-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_branch_workflow_failure',
            title: 'Workflow Branch Failure Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const workspaceFingerprint = 'ws_branch_workflow_failure';

        const run = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Run a workflow after branching',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(run.accepted).toBe(true);
        if (!run.accepted) {
            throw new Error('Expected source run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const sourceThreadRecord = await threadStore.getBySessionId(profileId, created.session.id);
        const sourceSandboxId = sourceThreadRecord?.thread.sandboxId;
        const sourceRuns = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });

        const shellApprovalContext = buildShellApprovalContext('definitely_missing_workflow_command');
        const workspaceResource = shellApprovalContext.approvalCandidates[0]?.resource;
        if (!workspaceResource) {
            throw new Error('Expected shell approval prefix resource.');
        }
        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint,
            resource: workspaceResource,
            policy: 'allow',
        });

        const workflow = await caller.workflow.create({
            profileId,
            workspaceFingerprint,
            label: 'Broken workflow',
            command: 'definitely_missing_workflow_command',
            enabled: true,
        });
        const messages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
        });
        const branchMessage = messages.messages.filter((message) => message.role === 'assistant').at(-1);
        if (!branchMessage) {
            throw new Error('Expected assistant message for branch target.');
        }

        const branched = await caller.session.branchFromMessageWithWorkflow({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: branchMessage.id,
            workflowId: workflow.workflow.id,
        });
        expect(branched.branched).toBe(true);
        if (!branched.branched) {
            throw new Error(`Expected workflow branch to succeed, received "${branched.reason}".`);
        }
        expect(branched.workflowExecution.status).toBe('failed');
        expect(branched.sessionId).not.toBe(created.session.id);

        const sourceRunsAfterBranch = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        expect(sourceRunsAfterBranch.runs.map((item) => item.id)).toEqual(sourceRuns.runs.map((item) => item.id));

        const sourceThreadAfterBranch = await threadStore.getBySessionId(profileId, created.session.id);
        expect(sourceThreadAfterBranch?.thread.sandboxId).toBe(sourceSandboxId);

        const branchStatus = await caller.session.status({
            profileId,
            sessionId: branched.sessionId,
        });
        expect(branchStatus.found).toBe(true);
        expect((await permissionStore.listPending()).length).toBe(0);
    });
});

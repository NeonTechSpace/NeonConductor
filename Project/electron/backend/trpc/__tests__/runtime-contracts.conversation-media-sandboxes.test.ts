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
        expect(started.code).toBe('execution_target_unavailable');
        expect(started.message).toContain('Managed sandbox');
        expect(started.action).toEqual({
            code: 'execution_target_unavailable',
            target: 'sandbox',
            detail: 'sandbox_not_materialized',
        });
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
});

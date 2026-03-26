import { describe, expect, it, vi } from 'vitest';

import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    waitForRunStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: conversation and runs', () => {
    const profileId = runtimeContractProfileId;
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
});

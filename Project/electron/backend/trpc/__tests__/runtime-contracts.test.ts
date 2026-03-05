import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultProfileId, getPersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import type { EntityId } from '@/app/backend/runtime/contracts';
import type { Context } from '@/app/backend/trpc/context';
import { appRouter } from '@/app/backend/trpc/router';

function createCaller() {
    const context: Context = {
        senderId: 1,
        win: null,
    };

    return appRouter.createCaller(context);
}

function isEntityId<P extends string>(value: string, prefix: P): value is `${P}_${string}` {
    return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

async function createSessionInScope(
    caller: ReturnType<typeof createCaller>,
    profileId: string,
    input: {
        scope: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        title: string;
        kind: 'local' | 'worktree' | 'cloud';
        topLevelTab?: 'chat' | 'agent' | 'orchestrator';
    }
) {
    const threadResult = await caller.conversation.createThread({
        profileId,
        ...(input.topLevelTab ? { topLevelTab: input.topLevelTab } : {}),
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        title: input.title,
    });

    const sessionResult = await caller.session.create({
        profileId,
        threadId: (() => {
            if (!isEntityId(threadResult.thread.id, 'thr')) {
                throw new Error('Expected thread id with "thr_" prefix.');
            }
            return threadResult.thread.id;
        })(),
        kind: input.kind,
    });

    return {
        thread: threadResult.thread,
        session: sessionResult.session,
    };
}

async function waitForRunStatus(
    caller: ReturnType<typeof createCaller>,
    profileId: string,
    sessionId: EntityId<'sess'>,
    expected: 'completed' | 'aborted' | 'error'
): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await caller.session.status({ profileId, sessionId });
        if (status.found && status.session.runStatus === expected) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(`Timed out waiting for session ${sessionId} to reach status "${expected}".`);
}

async function waitForOrchestratorStatus(
    caller: ReturnType<typeof createCaller>,
    profileId: string,
    orchestratorRunId: EntityId<'orch'>,
    expected: 'completed' | 'aborted' | 'failed'
): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const status = await caller.orchestrator.status({ profileId, orchestratorRunId });
        if (status.found && status.run.status === expected) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 40));
    }

    throw new Error(`Timed out waiting for orchestrator run ${orchestratorRunId} to reach status "${expected}".`);
}

beforeEach(() => {
    resetPersistenceForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('runtime contracts', () => {
    const profileId = getDefaultProfileId();
    const defaultRuntimeOptions = {
        reasoning: {
            effort: 'medium' as const,
            summary: 'auto' as const,
            includeEncrypted: true,
        },
        cache: {
            strategy: 'auto' as const,
        },
        transport: {
            openai: 'auto' as const,
        },
    };

    it('exposes all new runtime domains in root router', async () => {
        const caller = createCaller();

        const snapshot = await caller.runtime.getSnapshot({ profileId });
        const sessions = await caller.session.list({ profileId });
        const providers = await caller.provider.listProviders({ profileId });
        const modes = await caller.mode.list({ profileId, topLevelTab: 'agent' });
        const activeMode = await caller.mode.getActive({ profileId, topLevelTab: 'agent' });
        const pendingPermissions = await caller.permission.listPending();
        const tools = await caller.tool.list();
        const mcpServers = await caller.mcp.listServers();

        expect(snapshot.lastSequence).toBeGreaterThanOrEqual(0);
        expect(snapshot.activeProfileId).toBe(profileId);
        expect(snapshot.profiles.some((profile) => profile.id === profileId && profile.isActive)).toBe(true);
        expect(sessions.sessions).toEqual([]);
        expect(snapshot.conversations).toEqual([]);
        expect(snapshot.threads).toEqual([]);
        expect(snapshot.tags).toEqual([]);
        expect(snapshot.threadTags).toEqual([]);
        expect(snapshot.diffs).toEqual([]);
        expect(snapshot.modeDefinitions.some((mode) => mode.topLevelTab === 'chat' && mode.modeKey === 'chat')).toBe(
            true
        );
        expect(snapshot.kiloAccountContext.authState).toBe('logged_out');
        expect(snapshot.providerAuthStates.length).toBeGreaterThan(0);
        expect(snapshot.secretReferences).toEqual([]);
        expect(providers.providers.length).toBeGreaterThan(0);
        expect(modes.modes.some((mode) => mode.modeKey === 'code')).toBe(true);
        expect(activeMode.activeMode.modeKey).toBe('code');
        expect(pendingPermissions.requests).toEqual([]);
        expect(tools.tools.length).toBeGreaterThan(0);
        expect(mcpServers.servers.length).toBeGreaterThan(0);
    });

    it('supports profile lifecycle with active switching, secure duplication, and last-profile guard', async () => {
        const caller = createCaller();

        const initialActive = await caller.profile.getActive();
        expect(initialActive.activeProfileId).toBe(profileId);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-profile-source-key',
        });
        expect(configured.success).toBe(true);

        const created = await caller.profile.create({
            name: 'Workspace Profile',
        });

        const renamed = await caller.profile.rename({
            profileId: created.profile.id,
            name: 'Workspace Profile Renamed',
        });
        expect(renamed.updated).toBe(true);
        if (!renamed.updated) {
            throw new Error('Expected profile rename to succeed.');
        }
        expect(renamed.profile.name).toBe('Workspace Profile Renamed');

        const duplicated = await caller.profile.duplicate({
            profileId,
            name: 'Source Duplicate',
        });
        expect(duplicated.duplicated).toBe(true);
        if (!duplicated.duplicated) {
            throw new Error('Expected profile duplication to succeed.');
        }

        const duplicatedSnapshot = await caller.runtime.getSnapshot({
            profileId: duplicated.profile.id,
        });
        expect(duplicatedSnapshot.secretReferences).toEqual([]);
        const duplicatedOpenAiAuth = duplicatedSnapshot.providerAuthStates.find(
            (state) => state.providerId === 'openai'
        );
        expect(duplicatedOpenAiAuth?.authState).toBe('logged_out');
        expect(duplicatedOpenAiAuth?.authMethod).toBe('none');

        const activated = await caller.profile.setActive({
            profileId: duplicated.profile.id,
        });
        expect(activated.updated).toBe(true);
        if (!activated.updated) {
            throw new Error('Expected profile activation to succeed.');
        }
        expect(activated.profile.id).toBe(duplicated.profile.id);

        const activeAfterSwitch = await caller.profile.getActive();
        expect(activeAfterSwitch.activeProfileId).toBe(duplicated.profile.id);

        const deleteDuplicate = await caller.profile.delete({
            profileId: duplicated.profile.id,
        });
        expect(deleteDuplicate.deleted).toBe(true);
        if (!deleteDuplicate.deleted) {
            throw new Error('Expected duplicated profile delete to succeed.');
        }
        expect(deleteDuplicate.activeProfileId).toBeDefined();

        const deleteCreated = await caller.profile.delete({
            profileId: created.profile.id,
        });
        expect(deleteCreated.deleted).toBe(true);

        const deleteLast = await caller.profile.delete({
            profileId,
        });
        expect(deleteLast.deleted).toBe(false);
        if (deleteLast.deleted) {
            throw new Error('Expected last profile deletion to fail.');
        }
        expect(deleteLast.reason).toBe('last_profile');
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

    it('enforces planning-only mode and allows switching active mode', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_mode_enforcement_agent',
            title: 'Mode Enforcement Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        await expect(
            caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Should be blocked in plan mode',
                topLevelTab: 'agent',
                modeKey: 'plan',
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow('planning-only');

        const setActive = await caller.mode.setActive({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'debug',
        });
        expect(setActive.updated).toBe(true);
        if (!setActive.updated) {
            throw new Error('Expected mode update.');
        }
        expect(setActive.mode.modeKey).toBe('debug');

        const active = await caller.mode.getActive({
            profileId,
            topLevelTab: 'agent',
        });
        expect(active.activeMode.modeKey).toBe('debug');
    });

    it('rejects invalid mode/tab combinations and missing execution context', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Invalid mode context thread',
            kind: 'local',
        });

        await expect(
            caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Should fail due to tab/mode mismatch',
                topLevelTab: 'chat',
                modeKey: 'code',
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow('invalid for tab');

        await expect(
            caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Should fail due to missing mode key',
                topLevelTab: 'chat',
                runtimeOptions: defaultRuntimeOptions,
            } as unknown as Parameters<typeof caller.session.startRun>[0])
        ).rejects.toThrow('modeKey');
    });

    it('supports agent planning lifecycle with explicit approve then implement transition', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Plan implementation completed',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 22,
                    total_tokens: 34,
                },
            }),
        });
        vi.stubGlobal('fetch', completionFetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-plan-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_agent_plan_lifecycle',
            title: 'Agent planning lifecycle thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Build a safe implementation plan for this task.',
        });
        expect(started.plan.status).toBe('awaiting_answers');

        const answeredScope = await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Deliver a minimal deterministic implementation.',
        });
        expect(answeredScope.found).toBe(true);
        if (!answeredScope.found) {
            throw new Error('Expected scope answer update.');
        }

        const answeredConstraints = await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Keep boundaries explicit and avoid blind casts.',
        });
        expect(answeredConstraints.found).toBe(true);
        if (!answeredConstraints.found) {
            throw new Error('Expected constraints answer update.');
        }
        expect(answeredConstraints.plan.status).toBe('draft');

        const revised = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Agent Plan\n\n- Implement the approved plan deterministically.',
            items: [
                { description: 'Implement backend contracts first.' },
                { description: 'Implement renderer flow second.' },
            ],
        });
        expect(revised.found).toBe(true);
        if (!revised.found) {
            throw new Error('Expected plan revision.');
        }
        expect(revised.plan.items.length).toBe(2);

        const approved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
        });
        expect(approved.found).toBe(true);
        if (!approved.found) {
            throw new Error('Expected plan approval.');
        }
        expect(approved.plan.status).toBe('approved');

        const implemented = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(implemented.found).toBe(true);
        if (!implemented.found) {
            throw new Error('Expected plan implementation start.');
        }
        expect(implemented.mode).toBe('agent.code');
        if (implemented.mode !== 'agent.code') {
            throw new Error('Expected agent.code implementation mode.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const planState = await caller.plan.get({
            profileId,
            planId: started.plan.id,
        });
        expect(planState.found).toBe(true);
        if (!planState.found) {
            throw new Error('Expected plan state lookup.');
        }
        expect(planState.plan.status).toBe('implemented');
    });

    it('supports orchestrator sequential execution from approved plan steps', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Orchestrator step completed',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 9,
                    completion_tokens: 15,
                    total_tokens: 24,
                },
            }),
        });
        vi.stubGlobal('fetch', completionFetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-orchestrator-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_orchestrator_plan_lifecycle',
            title: 'Orchestrator planning lifecycle thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Plan a sequential orchestrator execution with two steps.',
        });
        expect(started.plan.status).toBe('awaiting_answers');

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Execute two deterministic steps in order.',
        });
        const answered = await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'No parallel tasks; fail closed on step errors.',
        });
        expect(answered.found).toBe(true);

        await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Orchestrator Plan\n\nExecute two sequential tasks.',
            items: [{ description: 'Step one task' }, { description: 'Step two task' }],
        });

        const approved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
        });
        expect(approved.found).toBe(true);

        const implemented = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(implemented.found).toBe(true);
        if (!implemented.found) {
            throw new Error('Expected orchestrator implementation start.');
        }
        expect(implemented.mode).toBe('orchestrator.orchestrate');
        if (implemented.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected orchestrator.orchestrate mode.');
        }

        await waitForOrchestratorStatus(caller, profileId, implemented.orchestratorRunId, 'completed');

        const status = await caller.orchestrator.status({
            profileId,
            orchestratorRunId: implemented.orchestratorRunId,
        });
        expect(status.found).toBe(true);
        if (!status.found) {
            throw new Error('Expected orchestrator status to be found.');
        }
        expect(status.steps.length).toBe(2);
        expect(status.steps.every((step) => step.status === 'completed')).toBe(true);
    });

    it('falls back to first runnable provider/model when defaults are not runnable', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Fallback provider response',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 14,
                    total_tokens: 24,
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
            title: 'Provider fallback thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Fallback provider run',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected run start to be accepted.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        const runs = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        const latestRun = runs.runs.at(0);
        expect(latestRun).toBeDefined();
        if (!latestRun) {
            throw new Error('Expected fallback run.');
        }
        expect(latestRun.providerId).toBe('openai');
    });

    it('fails closed on invalid runtime options combinations', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Invalid Runtime Options Thread',
            kind: 'local',
        });

        await expect(
            caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Invalid manual cache',
                topLevelTab: 'chat',
                modeKey: 'chat',
                runtimeOptions: {
                    reasoning: {
                        effort: 'none',
                        summary: 'none',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'manual',
                    },
                    transport: {
                        openai: 'auto',
                    },
                },
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow('runtimeOptions.cache.key');
    });

    it('handles permission request, grant, deny, and idempotency', async () => {
        const caller = createCaller();

        const requested = await caller.permission.request({
            policy: 'ask',
            resource: 'tool:run_command',
            rationale: 'Need shell command access',
        });
        const requestId = requested.request.id;

        const pending = await caller.permission.listPending();
        expect(pending.requests.some((item) => item.id === requestId)).toBe(true);

        const granted = await caller.permission.grant({ requestId });
        expect(granted.updated).toBe(true);

        const grantedAgain = await caller.permission.grant({ requestId });
        expect(grantedAgain.updated).toBe(false);
        expect(grantedAgain.reason).toBe('already_granted');

        const deniedAfterGrant = await caller.permission.deny({ requestId });
        expect(deniedAfterGrant.updated).toBe(true);

        const deniedAgain = await caller.permission.deny({ requestId });
        expect(deniedAgain.updated).toBe(false);
        expect(deniedAgain.reason).toBe('already_denied');
    });

    it('persists provider default in memory and lists models', async () => {
        const caller = createCaller();

        const providersBefore = await caller.provider.listProviders({ profileId });
        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.length).toBeGreaterThan(0);
        const firstModel = models.models.at(0);
        expect(firstModel).toBeDefined();
        if (!firstModel) {
            throw new Error('Expected openai model listing to include at least one model.');
        }
        expect(firstModel.supportsTools).toBeTypeOf('boolean');
        expect(firstModel.supportsReasoning).toBeTypeOf('boolean');
        expect(firstModel.inputModalities.includes('text')).toBe(true);
        expect(firstModel.outputModalities.includes('text')).toBe(true);

        const changed = await caller.provider.setDefault({
            profileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(changed.success).toBe(true);

        const providersAfter = await caller.provider.listProviders({ profileId });
        const defaultProvider = providersAfter.providers.find((item) => item.isDefault);

        expect(defaultProvider?.id).toBe('openai');
        expect(providersBefore.providers.some((item) => item.id === 'kilo')).toBe(true);
    });

    it('supports provider auth control plane and sync failures are explicit', async () => {
        const caller = createCaller();

        const before = await caller.provider.getAuthState({ profileId, providerId: 'openai' });
        expect(before.found).toBe(true);
        if (!before.found) {
            throw new Error('Expected auth state lookup to succeed.');
        }
        expect(before.state.authState).toBe('logged_out');

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'test-openai-key',
        });
        expect(configured.success).toBe(true);
        if (!configured.success) {
            throw new Error('Expected setApiKey to succeed.');
        }
        expect(configured.state.authState).toBe('configured');

        const snapshotAfterSet = await caller.runtime.getSnapshot({ profileId });
        expect(snapshotAfterSet.secretReferences.some((ref) => ref.providerId === 'openai')).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(false);
        expect(syncResult.reason).toBe('sync_failed');

        const cleared = await caller.provider.clearAuth({
            profileId,
            providerId: 'openai',
        });
        expect(cleared.success).toBe(true);
        if (!cleared.success) {
            throw new Error('Expected clearAuth to succeed.');
        }
        expect(cleared.authState.authState).toBe('logged_out');

        const snapshotAfterClear = await caller.runtime.getSnapshot({ profileId });
        expect(snapshotAfterClear.secretReferences.some((ref) => ref.providerId === 'openai')).toBe(false);
    });

    it('syncs openai api catalog and keeps codex model ids', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    data: [{ id: 'gpt-5-codex' }, { id: 'gpt-5' }, { id: 'gpt-4o' }],
                }),
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBe(3);

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(true);
        const codex = models.models.find((model) => model.id === 'openai/gpt-5-codex');
        expect(codex?.promptFamily).toBe('codex');
    });

    it('syncs kilo catalog with dynamic capability metadata from gateway discovery', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: 'kilo/auto',
                                    name: 'Kilo Auto',
                                    owned_by: 'kilo',
                                    context_length: 200000,
                                    supported_parameters: ['tools', 'reasoning'],
                                    architecture: {
                                        input_modalities: ['text', 'image'],
                                        output_modalities: ['text'],
                                    },
                                    opencode: {
                                        prompt: 'codex',
                                    },
                                    pricing: {},
                                },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/providers')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [{ id: 'openai', label: 'OpenAI' }],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [{ provider: 'openai', models: ['openai/gpt-5-codex'] }],
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'kilo',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBe(1);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        const kiloAuto = models.models.find((model) => model.id === 'kilo/auto');
        expect(kiloAuto).toBeDefined();
        if (!kiloAuto) {
            throw new Error('Expected kilo/auto model in synced catalog.');
        }
        expect(kiloAuto.supportsTools).toBe(true);
        expect(kiloAuto.supportsReasoning).toBe(true);
        expect(kiloAuto.supportsVision).toBe(true);
        expect(kiloAuto.inputModalities.includes('image')).toBe(true);
        expect(kiloAuto.promptFamily).toBe('codex');
    });

    it('supports openai oauth device auth start and pending polling', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => ({
                        device_code: 'device-code-1',
                        user_code: 'USER-CODE',
                        verification_uri: 'https://openai.example/verify',
                        interval: 5,
                        expires_in: 900,
                    }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    json: () => ({
                        error: 'authorization_pending',
                    }),
                })
        );

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'openai',
            method: 'oauth_device',
        });

        expect(started.flow.flowType).toBe('oauth_device');
        expect(started.flow.status).toBe('pending');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'openai',
            flowId: started.flow.id,
        });

        expect(polled.flow.status).toBe('pending');
        expect(polled.state.authState).toBe('pending');
    });

    it('supports openai oauth pkce completion and refresh', async () => {
        const caller = createCaller();
        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                access_token: 'aaa.bbb.ccc',
                refresh_token: 'refresh-token-1',
                expires_in: 1200,
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                access_token: 'ddd.eee.fff',
                refresh_token: 'refresh-token-2',
                expires_in: 1300,
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'openai',
            method: 'oauth_pkce',
        });

        const completed = await caller.provider.completeAuth({
            profileId,
            providerId: 'openai',
            flowId: started.flow.id,
            code: 'authorization-code',
        });
        expect(completed.flow.status).toBe('completed');
        expect(completed.state.authState).toBe('authenticated');

        const refreshed = await caller.provider.refreshAuth({
            profileId,
            providerId: 'openai',
        });
        expect(refreshed.state.authState).toBe('authenticated');

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(true);
        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(true);
    });

    it('reads openai subscription rate limits from wham usage for oauth sessions', async () => {
        const caller = createCaller();
        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                device_code: 'device-code-2',
                user_code: 'USER-DEVICE',
                verification_uri: 'https://openai.example/verify',
                interval: 5,
                expires_in: 900,
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                access_token: 'aaa.bbb.ccc',
                refresh_token: 'refresh-token-wham',
                expires_in: 1200,
                account_id: 'account_wham',
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                plan_type: 'pro',
                rate_limit: {
                    primary_window: {
                        used_percent: 42,
                        limit_window_seconds: 18_000,
                        reset_at: 1_763_000_000,
                    },
                    secondary_window: {
                        used_percent: 68,
                        limit_window_seconds: 604_800,
                        reset_at: 1_763_500_000,
                    },
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'openai',
            method: 'oauth_device',
        });
        const completed = await caller.provider.pollAuth({
            profileId,
            providerId: 'openai',
            flowId: started.flow.id,
        });
        expect(completed.flow.status).toBe('completed');
        expect(completed.state.authState).toBe('authenticated');

        const result = await caller.provider.getOpenAISubscriptionRateLimits({ profileId });
        expect(result.rateLimits.source).toBe('chatgpt_wham');
        expect(result.rateLimits.planType).toBe('pro');
        expect(result.rateLimits.primary?.windowMinutes).toBe(300);
        expect(result.rateLimits.secondary?.windowMinutes).toBe(10080);
        expect(result.rateLimits.primary?.usedPercent).toBe(42);
        expect(result.rateLimits.secondary?.usedPercent).toBe(68);

        const whamCall = fetchMock.mock.calls.at(2);
        expect(whamCall).toBeDefined();
        if (!whamCall) {
            throw new Error('Expected WHAM usage fetch call.');
        }
        const init = whamCall[1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(headers['Authorization']).toContain('Bearer');
        expect(headers['ChatGPT-Account-Id']).toBe('account_wham');
    });

    it('returns unavailable openai subscription rate limits for api-key auth', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-api-key-only',
        });
        expect(configured.success).toBe(true);

        const result = await caller.provider.getOpenAISubscriptionRateLimits({ profileId });
        expect(result.rateLimits.source).toBe('unavailable');
        expect(result.rateLimits.reason).toBe('oauth_required');
        expect(result.rateLimits.limits).toEqual([]);
    });

    it('rejects unsupported provider ids at contract boundaries and allows anthropic models through supported providers', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        await expect(
            caller.provider.listModels({
                profileId,
                providerId: 'anthropic' as unknown as 'kilo',
            })
        ).rejects.toThrow('Invalid "providerId"');

        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_model_catalog
                        (profile_id, provider_id, model_id, label, upstream_provider, is_free, supports_tools, supports_reasoning, context_length, pricing_json, raw_json, source, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'kilo',
                'anthropic/claude-sonnet-4.5',
                'Claude Sonnet 4.5',
                'anthropic',
                0,
                1,
                1,
                200000,
                '{}',
                '{}',
                'test',
                now
            );

        const setDefault = await caller.provider.setDefault({
            profileId,
            providerId: 'kilo',
            modelId: 'anthropic/claude-sonnet-4.5',
        });
        expect(setDefault.success).toBe(true);
    });

    it('executes read-only tools and enforces mode-sensitive tool policies', async () => {
        const caller = createCaller();
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-tool-test-'));
        const tempFile = path.join(tempDir, 'readme.txt');
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- test uses isolated mkdtemp path to validate runtime tool behavior.
        writeFileSync(tempFile, 'hello from tool execution test', 'utf8');

        const tools = await caller.tool.list();
        expect(tools.tools.map((item) => item.id)).toContain('read_file');

        const allowedRead = await caller.tool.invoke({
            profileId,
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'ask',
            args: {
                path: tempFile,
            },
        });
        expect(allowedRead.ok).toBe(true);
        if (!allowedRead.ok) {
            throw new Error('Expected read_file invocation to be allowed in agent.ask mode.');
        }
        const allowedReadContent = allowedRead.output['content'];
        const allowedReadText =
            typeof allowedReadContent === 'string'
                ? allowedReadContent
                : allowedReadContent === undefined
                  ? ''
                  : JSON.stringify(allowedReadContent);
        expect(allowedReadText).toContain('hello from tool execution test');

        const deniedMutation = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'ask',
            args: {
                command: 'echo blocked',
            },
        });
        expect(deniedMutation.ok).toBe(false);
        if (deniedMutation.ok) {
            throw new Error('Expected run_command to be blocked in agent.ask mode.');
        }
        expect(deniedMutation.error).toBe('policy_denied');

        const askDecision = await caller.tool.invoke({
            profileId,
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {
                path: tempFile,
            },
        });
        expect(askDecision.ok).toBe(false);
        if (askDecision.ok) {
            throw new Error('Expected read_file to require permission in agent.code mode by default policy.');
        }
        expect(askDecision.error).toBe('permission_required');

        const profileOverride = await caller.permission.setProfileOverride({
            profileId,
            resource: 'tool:read_file',
            policy: 'allow',
        });
        expect(profileOverride.override.policy).toBe('allow');

        const allowedByOverride = await caller.tool.invoke({
            profileId,
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {
                path: tempFile,
            },
        });
        expect(allowedByOverride.ok).toBe(true);
        if (!allowedByOverride.ok) {
            throw new Error('Expected profile override to allow read_file.');
        }

        const effectivePolicy = await caller.permission.getEffectivePolicy({
            profileId,
            resource: 'tool:read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(effectivePolicy.policy).toBe('allow');
        expect(effectivePolicy.source).toBe('profile_override');

        const mcpServers = await caller.mcp.listServers();
        expect(mcpServers.servers.map((item) => item.id)).toContain('github');

        const connected = await caller.mcp.connect({ serverId: 'github' });
        expect(connected.connected).toBe(false);
        expect(connected.reason).toBe('not_implemented');

        const authStatus = await caller.mcp.authStatus({ serverId: 'github' });
        expect(authStatus.found).toBe(true);
        if (!authStatus.found) {
            throw new Error('Expected MCP auth status result.');
        }
        expect(authStatus.connectionState).toBe('disconnected');

        const disconnected = await caller.mcp.disconnect({ serverId: 'github' });
        expect(disconnected.disconnected).toBe(false);
        expect(disconnected.reason).toBe('not_implemented');
    });

    it('supports workspace-scoped runtime reset dry-run and apply', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            title: 'Workspace Reset Thread',
            kind: 'local',
            workspaceFingerprint: 'wsf_runtime_contracts',
        });
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_workspace_target',
                profileId,
                'wsf_runtime_contracts',
                'Workspace Rules',
                '# Rules',
                'user',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO skillfiles (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'skill_workspace_target',
                profileId,
                'wsf_runtime_contracts',
                'Workspace Skillfile',
                '# Skill',
                'user',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_workspace_other',
                profileId,
                'wsf_other_workspace',
                'Other Rules',
                '# Rules',
                'user',
                1,
                100,
                now,
                now
            );

        const dryRun = await caller.runtime.reset({
            target: 'workspace',
            workspaceFingerprint: 'wsf_runtime_contracts',
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.sessions).toBe(1);
        expect(dryRun.counts.rulesets).toBe(1);
        expect(dryRun.counts.skillfiles).toBe(1);

        const applied = await caller.runtime.reset({
            target: 'workspace',
            workspaceFingerprint: 'wsf_runtime_contracts',
            confirm: true,
        });
        expect(applied.applied).toBe(true);
        expect(applied.counts.sessions).toBe(1);

        const sessions = await caller.session.list({ profileId });
        expect(sessions.sessions.some((item) => item.id === created.session.id)).toBe(false);

        const snapshot = await caller.runtime.getSnapshot({ profileId });
        expect(snapshot.lastSequence).toBeGreaterThan(0);

        const remainingRulesetCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM rulesets WHERE workspace_fingerprint = ?')
            .get('wsf_other_workspace') as { count: number };
        expect(remainingRulesetCount.count).toBe(1);
    });

    it('resets only targeted profile-scoped parity rows for profile_settings', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        const otherProfileId = 'profile_other';

        sqlite
            .prepare('INSERT INTO profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .run(otherProfileId, 'Other Profile', now, now);

        sqlite
            .prepare(
                `
                    INSERT INTO mode_definitions (id, profile_id, top_level_tab, mode_key, label, prompt_json, execution_policy_json, source, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'mode_profile_other_agent_code',
                otherProfileId,
                'agent',
                'code',
                'Other Agent Code',
                '{}',
                '{}',
                'user',
                1,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_profile_other',
                otherProfileId,
                null,
                'Other Profile Rules',
                '# Rules',
                'user',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO secret_references (id, profile_id, provider_id, secret_key_ref, secret_kind, status, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'secret_ref_profile_other',
                otherProfileId,
                'openai',
                'provider/openai/other',
                'api_key',
                'active',
                now
            );

        const dryRun = await caller.runtime.reset({
            target: 'profile_settings',
            profileId,
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.modeDefinitions).toBeGreaterThan(0);
        expect(dryRun.counts.kiloAccountSnapshots).toBeGreaterThan(0);

        const applied = await caller.runtime.reset({
            target: 'profile_settings',
            profileId,
            confirm: true,
        });
        expect(applied.applied).toBe(true);

        const defaultProfileModeCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM mode_definitions WHERE profile_id = ?')
            .get(profileId) as { count: number };
        expect(defaultProfileModeCount.count).toBe(0);

        const otherProfileModeCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM mode_definitions WHERE profile_id = ?')
            .get(otherProfileId) as { count: number };
        expect(otherProfileModeCount.count).toBe(1);

        const otherProfileSecretRefCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM secret_references WHERE profile_id = ?')
            .get(otherProfileId) as { count: number };
        expect(otherProfileSecretRefCount.count).toBe(1);
    });

    it('full reset clears parity rows and reseeds baseline modes', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        sqlite
            .prepare(
                `
                    INSERT INTO secret_references (id, profile_id, provider_id, secret_key_ref, secret_kind, status, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run('secret_ref_profile_default', profileId, 'kilo', 'provider/kilo/default', 'api_key', 'active', now);

        const dryRun = await caller.runtime.reset({
            target: 'full',
            profileId,
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.modeDefinitions).toBeGreaterThan(0);
        expect(dryRun.counts.secretReferences).toBe(1);

        const applied = await caller.runtime.reset({
            target: 'full',
            profileId,
            confirm: true,
        });
        expect(applied.applied).toBe(true);

        const snapshot = await caller.runtime.getSnapshot({ profileId });
        expect(snapshot.modeDefinitions.length).toBe(8);
        expect(snapshot.kiloAccountContext.authState).toBe('logged_out');
        expect(snapshot.secretReferences).toEqual([]);
    });
});

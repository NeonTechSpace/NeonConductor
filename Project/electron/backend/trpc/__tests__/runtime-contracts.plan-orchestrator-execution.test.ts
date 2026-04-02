import { describe, expect, it, vi } from 'vitest';

import { runStore, runtimeEventStore } from '@/app/backend/persistence/stores';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
    waitForOrchestratorStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: planning and orchestrator', () => {
    const profileId = runtimeContractProfileId;
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

        const revised = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Orchestrator Plan\n\nExecute two sequential tasks.',
            items: [{ description: 'Step one task' }, { description: 'Step two task' }],
        });
        expect(revised.found).toBe(true);
        if (!revised.found) {
            throw new Error('Expected sequential orchestrator revision.');
        }

        const approved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revised.plan.currentRevisionId,
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
        expect(status.run.executionStrategy).toBe('delegate');
        expect(status.run.planRevisionId).toBe(revised.plan.currentRevisionId);
        expect(status.steps.length).toBe(2);
        expect(status.steps.every((step) => step.status === 'completed')).toBe(true);
        expect(status.steps.every((step) => step.childThreadId && step.childSessionId && step.runId)).toBe(true);

        const childRuns = await Promise.all(
            status.steps.map(async (step) => {
                if (!step.childSessionId) {
                    throw new Error('Expected child session for delegated step.');
                }
                const runs = await runStore.listBySession(profileId, step.childSessionId);
                return runs[0];
            })
        );
        expect(childRuns.every((run) => run?.planId === started.plan.id)).toBe(true);
        expect(childRuns.every((run) => run?.planRevisionId === revised.plan.currentRevisionId)).toBe(true);

        const runtimeEvents = await runtimeEventStore.list(null, 400);
        const implementationStartedEvent = runtimeEvents.find(
            (event) => event.eventType === 'plan.implementation.started' && event.entityId === started.plan.id
        );
        expect(implementationStartedEvent?.payload.revisionId).toBe(revised.plan.currentRevisionId);
        expect(implementationStartedEvent?.payload.revisionNumber).toBe(2);

        const orchestratorStartedEvent = runtimeEvents.find(
            (event) => event.eventType === 'orchestrator.started' && event.entityId === implemented.orchestratorRunId
        );
        expect(orchestratorStartedEvent?.payload.revisionId).toBe(revised.plan.currentRevisionId);
        expect(orchestratorStartedEvent?.payload.revisionNumber).toBe(2);

        const threadList = await caller.conversation.listThreads({
            profileId,
            activeTab: 'orchestrator',
            showAllModes: false,
            groupView: 'workspace',
        });
        const delegatedChildren = threadList.threads.filter((thread) => thread.delegatedFromOrchestratorRunId);
        expect(delegatedChildren).toHaveLength(2);
        expect(delegatedChildren.every((thread) => thread.topLevelTab === 'agent')).toBe(true);

        const sessionList = await caller.session.list({ profileId });
        const delegatedSessions = sessionList.sessions.filter((session) => session.delegatedFromOrchestratorRunId);
        expect(delegatedSessions).toHaveLength(2);
    });

    it('supports parallel orchestrator execution with concurrent delegated child lanes', async () => {
        const caller = createCaller();
        const fetchResolvers: Array<() => void> = [];
        const completionFetchMock = vi.fn().mockImplementation(
            () =>
                new Promise((resolve) => {
                    fetchResolvers.push(() => {
                        resolve({
                            ok: true,
                            status: 200,
                            statusText: 'OK',
                            json: () => ({
                                choices: [
                                    {
                                        message: {
                                            content: 'Parallel child completed',
                                        },
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 8,
                                    completion_tokens: 13,
                                    total_tokens: 21,
                                },
                            }),
                        });
                    });
                })
        );
        vi.stubGlobal('fetch', completionFetchMock);

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-parallel-test-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_parallel_orchestrator',
            title: 'Parallel orchestrator lifecycle thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Plan a parallel orchestrator execution with two steps.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Run both delegated tasks at the same time.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Parallel child lanes should fail closed.',
        });
        const revised = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Parallel Orchestrator Plan',
            items: [{ description: 'Parallel step one' }, { description: 'Parallel step two' }],
        });
        expect(revised.found).toBe(true);
        if (!revised.found) {
            throw new Error('Expected parallel orchestrator revision.');
        }
        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revised.plan.currentRevisionId,
        });

        const implemented = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            executionStrategy: 'parallel',
        });
        expect(implemented.found).toBe(true);
        if (!implemented.found) {
            throw new Error('Expected parallel orchestrator start.');
        }
        if (implemented.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected parallel orchestrator mode.');
        }

        let observedParallelRunning = false;
        let observedExecutionStrategy: string | undefined;
        let allRunningStepsLinked = false;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const status = await caller.orchestrator.status({
                profileId,
                orchestratorRunId: implemented.orchestratorRunId,
            });
            if (status.found && status.steps.filter((step) => step.status === 'running').length >= 2) {
                observedExecutionStrategy = status.run.executionStrategy;
                allRunningStepsLinked = status.steps.every(
                    (step) => step.childThreadId && step.childSessionId && step.activeRunId
                );
                observedParallelRunning = true;
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        expect(observedParallelRunning).toBe(true);
        expect(observedExecutionStrategy).toBe('parallel');
        expect(allRunningStepsLinked).toBe(true);
        for (let attempt = 0; attempt < 200; attempt += 1) {
            if (completionFetchMock.mock.calls.length >= 2 && fetchResolvers.length >= 2) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(completionFetchMock).toHaveBeenCalledTimes(2);
        expect(fetchResolvers).toHaveLength(2);

        for (const resolveFetch of fetchResolvers) {
            resolveFetch();
        }

        await waitForOrchestratorStatus(caller, profileId, implemented.orchestratorRunId, 'completed');
    });

    it('aborts live parallel execution cleanly and requires re-approval before a fresh implementation run', async () => {
        const caller = createCaller();
        const pendingFetchResolvers: Array<() => void> = [];
        let runPhase: 'first_run' | 'second_run' = 'first_run';
        const completionFetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (runPhase === 'second_run') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'Fresh delegated child completed.',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 9,
                            completion_tokens: 12,
                            total_tokens: 21,
                        },
                    }),
                });
            }

            const signal = init?.signal;
            return new Promise((resolve, reject) => {
                const rejectAbort = () => {
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                };

                if (signal?.aborted) {
                    rejectAbort();
                    return;
                }

                signal?.addEventListener('abort', rejectAbort, { once: true });
                pendingFetchResolvers.push(() => {
                    resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            choices: [
                                {
                                    message: {
                                        content: 'Parallel child completed before abort.',
                                    },
                                },
                            ],
                            usage: {
                                prompt_tokens: 8,
                                completion_tokens: 10,
                                total_tokens: 18,
                            },
                        }),
                    });
                });
            });
        });
        vi.stubGlobal('fetch', completionFetchMock);

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-parallel-abort-reentry-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_parallel_orchestrator_abort_reentry',
            title: 'Parallel abort and re-entry thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Run two delegated children, abort one live, then retry cleanly.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Execute two child lanes in parallel and abort during live work.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Keep abort terminal and require a fresh approval before retry.',
        });
        const revised = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Parallel Abort Recovery Plan',
            items: [{ description: 'Parallel child one' }, { description: 'Parallel child two' }],
        });
        expect(revised.found).toBe(true);
        if (!revised.found) {
            throw new Error('Expected abort-recovery revision.');
        }
        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revised.plan.currentRevisionId,
        });

        const firstImplementation = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            executionStrategy: 'parallel',
        });
        expect(firstImplementation.found).toBe(true);
        if (!firstImplementation.found) {
            throw new Error('Expected first orchestrator implementation start.');
        }
        if (firstImplementation.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected orchestrator mode for first parallel abort run.');
        }

        let observedRunning = false;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const status = await caller.orchestrator.status({
                profileId,
                orchestratorRunId: firstImplementation.orchestratorRunId,
            });
            if (status.found && status.steps.filter((step) => step.status === 'running').length >= 2) {
                observedRunning = true;
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(observedRunning).toBe(true);

        for (let attempt = 0; attempt < 200; attempt += 1) {
            if (pendingFetchResolvers.length >= 2) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(pendingFetchResolvers.length).toBe(2);

        const firstResolver = pendingFetchResolvers.shift();
        if (!firstResolver) {
            throw new Error('Expected first live parallel child resolver.');
        }
        firstResolver();

        let firstAbortStatus:
            | {
                  found: true;
                  run: { status: 'running' | 'completed' | 'aborted' | 'failed' };
                  steps: Array<{
                      status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
                      childSessionId?: `sess_${string}`;
                  }>;
              }
            | undefined;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const status = await caller.orchestrator.status({
                profileId,
                orchestratorRunId: firstImplementation.orchestratorRunId,
            });
            if (
                status.found &&
                status.steps.filter((step) => step.status === 'completed').length === 1 &&
                status.steps.filter((step) => step.status === 'running').length === 1
            ) {
                firstAbortStatus = status;
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        expect(firstAbortStatus?.steps.filter((step) => step.status === 'completed')).toHaveLength(1);
        expect(firstAbortStatus?.steps.filter((step) => step.status === 'running')).toHaveLength(1);

        const aborted = await caller.orchestrator.abort({
            profileId,
            orchestratorRunId: firstImplementation.orchestratorRunId,
        });
        expect(aborted.aborted).toBe(true);
        if (!aborted.aborted) {
            throw new Error('Expected live parallel abort to succeed.');
        }
        expect(aborted.latest.found).toBe(true);
        if (!aborted.latest.found) {
            throw new Error('Expected latest orchestrator status after abort.');
        }
        expect(aborted.latest.run.status).toBe('aborted');
        expect(aborted.latest.steps.filter((step) => step.status === 'completed')).toHaveLength(1);
        expect(aborted.latest.steps.filter((step) => step.status === 'aborted')).toHaveLength(1);
        expect(aborted.latest.steps.some((step) => step.status === 'running')).toBe(false);
        expect(aborted.latest.steps.some((step) => step.activeRunId)).toBe(false);

        await waitForOrchestratorStatus(caller, profileId, firstImplementation.orchestratorRunId, 'aborted');

        const sessionListAfterAbort = await caller.session.list({ profileId });
        const delegatedSessionsAfterAbort = sessionListAfterAbort.sessions.filter(
            (session) => session.delegatedFromOrchestratorRunId === firstImplementation.orchestratorRunId
        );
        expect(delegatedSessionsAfterAbort).toHaveLength(2);
        expect(delegatedSessionsAfterAbort.some((session) => session.runStatus === 'running')).toBe(false);
        expect(delegatedSessionsAfterAbort.map((session) => session.runStatus).sort()).toEqual([
            'aborted',
            'completed',
        ]);

        const planAfterAbort = await caller.plan.get({
            profileId,
            planId: started.plan.id,
        });
        expect(planAfterAbort.found).toBe(true);
        if (!planAfterAbort.found) {
            throw new Error('Expected plan state after live parallel abort.');
        }
        expect(planAfterAbort.plan.status).toBe('failed');
        expect(planAfterAbort.plan.items.map((item) => item.status).sort()).toEqual(['aborted', 'completed']);

        await expect(
            caller.plan.implement({
                profileId,
                planId: started.plan.id,
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                executionStrategy: 'parallel',
            })
        ).rejects.toThrow(/Plan must be approved before implementation/);

        const reapproved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revised.plan.currentRevisionId,
        });
        expect(reapproved.found).toBe(true);
        if (!reapproved.found) {
            throw new Error('Expected re-approval after failed orchestrator plan.');
        }
        expect(reapproved.plan.status).toBe('approved');
        expect(reapproved.plan.items.every((item) => item.status === 'pending')).toBe(true);

        runPhase = 'second_run';

        const secondImplementation = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            executionStrategy: 'parallel',
        });
        expect(secondImplementation.found).toBe(true);
        if (!secondImplementation.found) {
            throw new Error('Expected second orchestrator implementation start after re-approval.');
        }
        if (secondImplementation.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected orchestrator mode for second implementation.');
        }
        expect(secondImplementation.orchestratorRunId).not.toBe(firstImplementation.orchestratorRunId);

        await waitForOrchestratorStatus(caller, profileId, secondImplementation.orchestratorRunId, 'completed');

        const secondStatus = await caller.orchestrator.status({
            profileId,
            orchestratorRunId: secondImplementation.orchestratorRunId,
        });
        expect(secondStatus.found).toBe(true);
        if (!secondStatus.found) {
            throw new Error('Expected second orchestrator status.');
        }
        expect(secondStatus.steps.every((step) => step.status === 'completed')).toBe(true);

        const firstChildSessionIds = new Set(
            aborted.latest.steps
                .map((step) => step.childSessionId)
                .filter((value): value is `sess_${string}` => Boolean(value))
        );
        const secondChildSessionIds = secondStatus.steps
            .map((step) => step.childSessionId)
            .filter((value): value is `sess_${string}` => Boolean(value));
        expect(secondChildSessionIds).toHaveLength(2);
        expect(secondChildSessionIds.every((childSessionId) => !firstChildSessionIds.has(childSessionId))).toBe(true);

        const finalPlan = await caller.plan.get({
            profileId,
            planId: started.plan.id,
        });
        expect(finalPlan.found).toBe(true);
        if (!finalPlan.found) {
            throw new Error('Expected final plan state after re-approved implementation.');
        }
        expect(finalPlan.plan.status).toBe('implemented');
        expect(finalPlan.plan.items.every((item) => item.status === 'completed')).toBe(true);
    }, 20000);

    it('keeps historical orchestrator runs anchored to the revision that launched them after re-approval', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Anchored orchestrator child completed',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 12,
                    total_tokens: 22,
                },
            }),
        });
        vi.stubGlobal('fetch', completionFetchMock);

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-orchestrator-anchor-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_orchestrator_plan_anchor',
            title: 'Orchestrator execution anchoring thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Implement from the exact approved orchestrator revision.',
        });

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Approve one revision, implement it, then revise and approve a different one.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Historical orchestrator runs and delegated children must keep their original revision anchor.',
        });

        const firstRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Orchestrator Revision One',
            items: [{ description: 'First delegated task' }],
        });
        expect(firstRevision.found).toBe(true);
        if (!firstRevision.found) {
            throw new Error('Expected first orchestrator revision.');
        }

        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: firstRevision.plan.currentRevisionId,
        });

        const firstImplementation = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(firstImplementation.found).toBe(true);
        if (!firstImplementation.found || firstImplementation.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected first anchored orchestrator start.');
        }

        await waitForOrchestratorStatus(caller, profileId, firstImplementation.orchestratorRunId, 'completed');

        const firstStatus = await caller.orchestrator.status({
            profileId,
            orchestratorRunId: firstImplementation.orchestratorRunId,
        });
        expect(firstStatus.found).toBe(true);
        if (!firstStatus.found) {
            throw new Error('Expected first anchored orchestrator status.');
        }
        expect(firstStatus.run.planRevisionId).toBe(firstRevision.plan.currentRevisionId);
        expect(firstStatus.steps.map((step) => step.description)).toEqual(['First delegated task']);

        const firstChildRuns = await Promise.all(
            firstStatus.steps.map(async (step) => {
                if (!step.childSessionId) {
                    throw new Error('Expected first child session.');
                }
                const runs = await runStore.listBySession(profileId, step.childSessionId);
                return runs[0];
            })
        );
        expect(firstChildRuns.every((run) => run?.planRevisionId === firstRevision.plan.currentRevisionId)).toBe(true);

        const secondRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Orchestrator Revision Two',
            items: [{ description: 'Second delegated task' }, { description: 'Extra delegated task' }],
        });
        expect(secondRevision.found).toBe(true);
        if (!secondRevision.found) {
            throw new Error('Expected second orchestrator revision.');
        }

        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: secondRevision.plan.currentRevisionId,
        });

        const secondImplementation = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(secondImplementation.found).toBe(true);
        if (!secondImplementation.found || secondImplementation.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected second anchored orchestrator start.');
        }

        await waitForOrchestratorStatus(caller, profileId, secondImplementation.orchestratorRunId, 'completed');

        const secondStatus = await caller.orchestrator.status({
            profileId,
            orchestratorRunId: secondImplementation.orchestratorRunId,
        });
        expect(secondStatus.found).toBe(true);
        if (!secondStatus.found) {
            throw new Error('Expected second anchored orchestrator status.');
        }
        expect(secondStatus.run.planRevisionId).toBe(secondRevision.plan.currentRevisionId);
        expect(secondStatus.steps.map((step) => step.description)).toEqual([
            'Second delegated task',
            'Extra delegated task',
        ]);

        const secondChildRuns = await Promise.all(
            secondStatus.steps.map(async (step) => {
                if (!step.childSessionId) {
                    throw new Error('Expected second child session.');
                }
                const runs = await runStore.listBySession(profileId, step.childSessionId);
                return runs[0];
            })
        );
        expect(secondChildRuns.every((run) => run?.planRevisionId === secondRevision.plan.currentRevisionId)).toBe(
            true
        );
        expect(firstStatus.run.planRevisionId).toBe(firstRevision.plan.currentRevisionId);
        expect(firstStatus.steps.map((step) => step.description)).toEqual(['First delegated task']);
    });
});

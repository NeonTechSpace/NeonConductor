import { describe, expect, it, vi } from 'vitest';

import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';

import { createCaller, createSessionInScope, defaultRuntimeOptions, registerRuntimeContractHooks, requireEntityId, runtimeContractProfileId, waitForOrchestratorStatus } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: planning and orchestrator', () => {
    const profileId = runtimeContractProfileId;
    it('rejects delegated child lanes that try to start orchestrator strategies', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Delegated child completed',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 9,
                    completion_tokens: 11,
                    total_tokens: 20,
                },
            }),
        });
        vi.stubGlobal('fetch', completionFetchMock);

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-child-orchestrator-test-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_child_orchestrator_guard',
            title: 'Child orchestrator guard thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Create one delegated worker lane.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Create exactly one worker.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Keep it deterministic.',
        });
        await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Single child plan',
            items: [{ description: 'Only child step' }],
        });
        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
        });

        const implemented = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(implemented.found).toBe(true);
        if (!implemented.found) {
            throw new Error('Expected delegated child setup.');
        }
        if (implemented.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected orchestrator mode for child guard setup.');
        }

        await waitForOrchestratorStatus(caller, profileId, implemented.orchestratorRunId, 'completed');

        const status = await caller.orchestrator.status({
            profileId,
            orchestratorRunId: implemented.orchestratorRunId,
        });
        expect(status.found).toBe(true);
        if (!status.found) {
            throw new Error('Expected orchestrator status for child guard.');
        }

        const childSessionId = requireEntityId(status.steps[0]?.childSessionId, 'sess', 'Expected delegated child session.');
        const childPlan = await caller.plan.start({
            profileId,
            sessionId: childSessionId,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Try to orchestrate from a delegated child lane.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: childPlan.plan.id,
            questionId: 'scope',
            answer: 'Attempt nested delegation.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: childPlan.plan.id,
            questionId: 'constraints',
            answer: 'This should be rejected.',
        });
        await caller.plan.revise({
            profileId,
            planId: childPlan.plan.id,
            summaryMarkdown: '# Nested child orchestrator attempt',
            items: [{ description: 'Nested step' }],
        });
        await caller.plan.approve({
            profileId,
            planId: childPlan.plan.id,
        });

        await expect(
            caller.orchestrator.start({
                profileId,
                planId: childPlan.plan.id,
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow(/Delegated worker lanes cannot start orchestrator strategies/);
    });

    it('rolls back delegated child lanes when child run startup is rejected', async () => {
        const caller = createCaller();

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-child-start-reject-test-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_child_start_reject_cleanup',
            title: 'Child lane rollback thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Create one worker lane that will fail to start.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Create one delegated worker.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Fail closed if the delegated worker cannot start.',
        });
        await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Failed child start plan',
            items: [{ description: 'Delegated child start should reject.' }],
        });
        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
        });

        const startRunSpy = vi.spyOn(runExecutionService, 'startRun').mockResolvedValue({
            accepted: false,
            reason: 'not_found',
        });

        try {
            const implemented = await caller.plan.implement({
                profileId,
                planId: started.plan.id,
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            });
            expect(implemented.found).toBe(true);
            if (!implemented.found) {
                throw new Error('Expected orchestrator implementation start for rollback test.');
            }
            if (implemented.mode !== 'orchestrator.orchestrate') {
                throw new Error('Expected orchestrator mode for rollback test.');
            }

            await waitForOrchestratorStatus(caller, profileId, implemented.orchestratorRunId, 'failed');

            const status = await caller.orchestrator.status({
                profileId,
                orchestratorRunId: implemented.orchestratorRunId,
            });
            expect(status.found).toBe(true);
            if (!status.found) {
                throw new Error('Expected orchestrator status for rollback test.');
            }
            expect(status.steps[0]?.childThreadId).toBeUndefined();
            expect(status.steps[0]?.childSessionId).toBeUndefined();

            const threadList = await caller.conversation.listThreads({
                profileId,
                activeTab: 'orchestrator',
                showAllModes: false,
                groupView: 'workspace',
            });
            expect(threadList.threads.filter((thread) => thread.delegatedFromOrchestratorRunId)).toHaveLength(0);

            const sessionList = await caller.session.list({ profileId });
            expect(sessionList.sessions.filter((session) => session.delegatedFromOrchestratorRunId)).toHaveLength(0);
        } finally {
            startRunSpy.mockRestore();
        }
    });
});

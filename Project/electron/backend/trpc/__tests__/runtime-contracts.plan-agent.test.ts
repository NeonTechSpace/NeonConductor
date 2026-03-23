import { describe, expect, it, vi } from 'vitest';

import { createCaller, createSessionInScope, defaultRuntimeOptions, registerRuntimeContractHooks, runtimeContractProfileId, waitForRunStatus } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: planning and orchestrator', () => {
    const profileId = runtimeContractProfileId;
    it('enforces planning-only mode and allows switching active mode', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_mode_enforcement_agent',
            title: 'Mode Enforcement Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const blockedPlanMode = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Should be blocked in plan mode',
            topLevelTab: 'agent',
            modeKey: 'plan',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(blockedPlanMode.accepted).toBe(false);
        if (blockedPlanMode.accepted) {
            throw new Error('Expected planning-only run start to be rejected.');
        }
        expect(blockedPlanMode.code).toBe('mode_policy_invalid');
        expect(blockedPlanMode.message).toContain('planning-only');
        expect(blockedPlanMode.action).toEqual({
            code: 'mode_invalid',
            modeKey: 'plan',
            topLevelTab: 'agent',
        });

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
});

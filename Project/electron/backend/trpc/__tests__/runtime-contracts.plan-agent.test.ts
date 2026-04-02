import { describe, expect, it, vi } from 'vitest';

import { getPersistence } from '@/app/backend/persistence/db';
import { planStore, runStore, runtimeEventStore } from '@/app/backend/persistence/stores';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
    waitForRunStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

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

    it('returns richer agent intake questions with required and optional metadata', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_agent_rich_intake',
            title: 'Agent richer intake thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Fix a regression in the agent planner.',
            workspaceFingerprint: 'wsf_agent_rich_intake',
        });

        const deliverableQuestion = started.plan.questions.find((question) => question.id === 'scope');
        const constraintsQuestion = started.plan.questions.find((question) => question.id === 'constraints');
        const validationQuestion = started.plan.questions.find((question) => question.id === 'validation');

        expect(deliverableQuestion).toMatchObject({
            category: 'deliverable',
            required: true,
        });
        expect(deliverableQuestion?.placeholderText).toContain('artifact');
        expect(deliverableQuestion?.helpText).toContain('concrete first outcome');
        expect(constraintsQuestion).toMatchObject({
            category: 'constraints',
            required: true,
        });
        expect(validationQuestion).toMatchObject({
            category: 'validation',
            required: false,
        });

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Ship the richer plan intake flow.',
        });
        const answeredConstraints = await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Keep approval and execution contracts exact.',
        });

        expect(answeredConstraints.found).toBe(true);
        if (!answeredConstraints.found) {
            throw new Error('Expected richer intake question answers to update the plan.');
        }
        expect(answeredConstraints.plan.status).toBe('draft');
    });

    it('generates a deterministic fallback draft after required intake answers are complete', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_agent_generate_draft',
            title: 'Agent generate draft thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Help me improve this',
            workspaceFingerprint: 'wsf_agent_generate_draft',
        });

        const missingContextQuestion = started.plan.questions.find((question) => question.id === 'missing_context');
        expect(missingContextQuestion).toMatchObject({
            category: 'missing_context',
            required: true,
        });
        expect(started.plan.summaryMarkdown).toContain('provisional');

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Improve the basic plan intake experience.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Stay deterministic when no model target is available.',
        });
        const answeredMissingContext = await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'missing_context',
            answer: 'This work targets plan mode intake, panel state, and controller wiring.',
        });
        expect(answeredMissingContext.found).toBe(true);
        if (!answeredMissingContext.found) {
            throw new Error('Expected missing-context answer update.');
        }
        expect(answeredMissingContext.plan.status).toBe('draft');

        const generated = await caller.plan.generateDraft({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            workspaceFingerprint: 'wsf_agent_generate_draft',
        });
        expect(generated.found).toBe(true);
        if (!generated.found) {
            throw new Error('Expected deterministic draft generation.');
        }
        expect(generated.plan.currentRevisionNumber).toBe(2);
        expect(generated.plan.summaryMarkdown).toContain('## Goal');
        expect(generated.plan.summaryMarkdown).toContain('## Clarified Context');
        expect(generated.plan.items.length).toBeGreaterThanOrEqual(2);
        expect(generated.plan.items[0]?.description).toContain('Inspect');

        const runtimeEvents = await runtimeEventStore.list(null, 200);
        const draftStartedEvent = runtimeEvents.find(
            (event) => event.eventType === 'plan.draft_generation.started' && event.entityId === started.plan.id
        );
        const draftGeneratedEvent = runtimeEvents.find(
            (event) => event.eventType === 'plan.draft_generated' && event.entityId === started.plan.id
        );
        expect(draftStartedEvent?.payload.generationMode).toBe('deterministic_fallback');
        expect(draftGeneratedEvent?.payload.generationMode).toBe('deterministic_fallback');
        expect(draftGeneratedEvent?.payload.priorRevisionId).toBe(started.plan.currentRevisionId);
        expect(draftGeneratedEvent?.payload.revisionId).toBe(generated.plan.currentRevisionId);
        expect(draftGeneratedEvent?.payload.revisionNumber).toBe(2);
    });

    it('accepts provider and model inputs when generating a draft revision', async () => {
        const caller = createCaller();
        const draftFetchMock = vi.fn().mockResolvedValue({
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
                                text: JSON.stringify({
                                    summaryMarkdown: '# Model Draft\n\n## Goal\n\nShip the richer intake flow.',
                                    items: [
                                        'Inspect the current plan intake controller.',
                                        'Implement the richer intake and draft-generation path.',
                                        'Verify the plan UI and runtime contracts.',
                                    ],
                                }),
                            },
                        ],
                    },
                ],
                usage: {
                    input_tokens: 18,
                    output_tokens: 24,
                    total_tokens: 42,
                },
            }),
        });
        vi.stubGlobal('fetch', draftFetchMock);

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-plan-draft-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_agent_model_draft',
            title: 'Agent model draft thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Draft a revision-aware implementation plan.',
            workspaceFingerprint: 'wsf_agent_model_draft',
        });

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Ship the richer intake flow.',
        });
        const answeredConstraints = await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Keep immutable revisions and exact approval semantics intact.',
        });
        expect(answeredConstraints.found).toBe(true);
        if (!answeredConstraints.found) {
            throw new Error('Expected model-draft intake answers to update the plan.');
        }
        expect(answeredConstraints.plan.status).toBe('draft');

        const generated = await caller.plan.generateDraft({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            workspaceFingerprint: 'wsf_agent_model_draft',
        });
        expect(generated.found).toBe(true);
        if (!generated.found) {
            throw new Error('Expected model-assisted draft generation.');
        }
        expect(generated.plan.currentRevisionNumber).toBe(2);
        expect(generated.plan.summaryMarkdown.length).toBeGreaterThan(0);
        expect(generated.plan.items.length).toBeGreaterThan(0);
        expect(draftFetchMock).toHaveBeenCalled();

        const runtimeEvents = await runtimeEventStore.list(null, 300);
        const draftGeneratedEvent = runtimeEvents.find(
            (event) => event.eventType === 'plan.draft_generated' && event.entityId === started.plan.id
        );
        expect(draftGeneratedEvent?.payload.revisionId).toBe(generated.plan.currentRevisionId);
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
        expect(started.plan.currentRevisionNumber).toBe(1);
        expect(started.plan.currentRevisionId).toMatch(/^prev_/);

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
        expect(revised.plan.currentRevisionNumber).toBe(2);
        expect(revised.plan.approvedRevisionId).toBeUndefined();

        const approved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revised.plan.currentRevisionId,
        });
        expect(approved.found).toBe(true);
        if (!approved.found) {
            throw new Error('Expected plan approval.');
        }
        expect(approved.plan.status).toBe('approved');
        expect(approved.plan.approvedRevisionId).toBe(revised.plan.currentRevisionId);
        expect(approved.plan.approvedRevisionNumber).toBe(2);

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

        const startedRun = await runStore.getById(implemented.runId);
        expect(startedRun?.planId).toBe(started.plan.id);
        expect(startedRun?.planRevisionId).toBe(revised.plan.currentRevisionId);
        expect(startedRun?.prompt).toContain('# Agent Plan');
        expect(startedRun?.prompt).toContain('Implement backend contracts first.');

        const runtimeEvents = await runtimeEventStore.list(null, 200);
        const implementationStartedEvent = runtimeEvents.find(
            (event) => event.eventType === 'plan.implementation.started' && event.entityId === started.plan.id
        );
        expect(implementationStartedEvent?.payload.revisionId).toBe(revised.plan.currentRevisionId);
        expect(implementationStartedEvent?.payload.revisionNumber).toBe(2);

        const runModeContextEvent = runtimeEvents.find(
            (event) => event.eventType === 'run.mode.context' && event.entityId === implemented.runId
        );
        expect(runModeContextEvent?.payload.planId).toBe(started.plan.id);
        expect(runModeContextEvent?.payload.planRevisionId).toBe(revised.plan.currentRevisionId);

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

    it('keeps immutable revision history, rejects stale approval, and resolves the approved revision snapshot', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_agent_plan_revisions',
            title: 'Agent planning revisions thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Build a revision-aware implementation plan.',
        });
        expect(started.plan.currentRevisionNumber).toBe(1);

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Capture the first approved revision and then revise it.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Preserve immutable history.',
        });

        const firstRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Revision One',
            items: [{ description: 'Initial item' }],
        });
        expect(firstRevision.found).toBe(true);
        if (!firstRevision.found) {
            throw new Error('Expected first revision.');
        }
        expect(firstRevision.plan.currentRevisionNumber).toBe(2);

        const approved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: firstRevision.plan.currentRevisionId,
        });
        expect(approved.found).toBe(true);
        if (!approved.found) {
            throw new Error('Expected plan approval.');
        }

        const secondRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Revision Two',
            items: [{ description: 'Updated item' }, { description: 'Follow-up item' }],
        });
        expect(secondRevision.found).toBe(true);
        if (!secondRevision.found) {
            throw new Error('Expected second revision.');
        }
        expect(secondRevision.plan.currentRevisionNumber).toBe(3);
        expect(secondRevision.plan.approvedRevisionId).toBe(firstRevision.plan.currentRevisionId);
        expect(secondRevision.plan.approvedRevisionNumber).toBe(2);

        await expect(
            caller.plan.approve({
                profileId,
                planId: started.plan.id,
                revisionId: firstRevision.plan.currentRevisionId,
            })
        ).rejects.toThrow(/stale plan revision/i);

        const revisions = await planStore.listRevisions(started.plan.id);
        expect(revisions.map((revision) => revision.revisionNumber)).toEqual([1, 2, 3]);
        expect(revisions[1]?.summaryMarkdown).toBe('# Revision One');
        expect(revisions[1]?.supersededAt).toBeDefined();
        expect(revisions[2]?.summaryMarkdown).toBe('# Revision Two');
        expect(revisions[2]?.supersededAt).toBeUndefined();

        const approvedSnapshot = await planStore.resolveApprovedRevisionSnapshot({
            planId: started.plan.id,
        });
        expect(approvedSnapshot?.revision.id).toBe(firstRevision.plan.currentRevisionId);
        expect(approvedSnapshot?.revision.revisionNumber).toBe(2);
        expect(approvedSnapshot?.items.map((item) => item.description)).toEqual(['Initial item']);
    });

    it('anchors each agent implementation run to the approved revision that started it', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Anchored implementation completed',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 16,
                    total_tokens: 28,
                },
            }),
        });
        vi.stubGlobal('fetch', completionFetchMock);

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-plan-anchor-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_agent_plan_anchor',
            title: 'Agent plan execution anchoring thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Implement from exactly the approved revision.',
        });

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Implement the first approved revision, then revise and re-approve.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Historical runs must stay anchored to the revision that launched them.',
        });

        const firstRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Approved Revision One',
            items: [{ description: 'Implement revision one only' }],
        });
        expect(firstRevision.found).toBe(true);
        if (!firstRevision.found) {
            throw new Error('Expected first anchored revision.');
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
        if (!firstImplementation.found || firstImplementation.mode !== 'agent.code') {
            throw new Error('Expected first anchored agent implementation start.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const firstRun = await runStore.getById(firstImplementation.runId);
        expect(firstRun?.planId).toBe(started.plan.id);
        expect(firstRun?.planRevisionId).toBe(firstRevision.plan.currentRevisionId);
        expect(firstRun?.prompt).toContain('# Approved Revision One');
        expect(firstRun?.prompt).toContain('Implement revision one only');

        const secondRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Approved Revision Two',
            items: [{ description: 'Implement revision two instead' }],
        });
        expect(secondRevision.found).toBe(true);
        if (!secondRevision.found) {
            throw new Error('Expected second anchored revision.');
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
        if (!secondImplementation.found || secondImplementation.mode !== 'agent.code') {
            throw new Error('Expected second anchored agent implementation start.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const secondRun = await runStore.getById(secondImplementation.runId);
        expect(secondRun?.planId).toBe(started.plan.id);
        expect(secondRun?.planRevisionId).toBe(secondRevision.plan.currentRevisionId);
        expect(secondRun?.prompt).toContain('# Approved Revision Two');
        expect(secondRun?.prompt).toContain('Implement revision two instead');
        expect(firstRun?.planRevisionId).toBe(firstRevision.plan.currentRevisionId);
        expect(firstRun?.prompt).toContain('# Approved Revision One');
        expect(firstRun?.prompt).not.toContain('# Approved Revision Two');
    });

    it('fails closed when the approved revision snapshot can no longer be resolved', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_agent_plan_missing_snapshot',
            title: 'Missing approved snapshot thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'This plan should fail closed if its approved snapshot disappears.',
        });

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Approve one revision and then remove its snapshot.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Do not fall back to mutable live plan state.',
        });

        const revised = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Missing Snapshot Revision',
            items: [{ description: 'This should never execute from live state.' }],
        });
        expect(revised.found).toBe(true);
        if (!revised.found) {
            throw new Error('Expected revision before missing snapshot test.');
        }

        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revised.plan.currentRevisionId,
        });

        await getPersistence()
            .db.updateTable('plan_records')
            .set({
                approved_revision_id: 'prev_missing_approved_revision',
            })
            .where('id', '=', started.plan.id)
            .execute();

        await expect(
            caller.plan.implement({
                profileId,
                planId: started.plan.id,
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow(/approved revision content could not be resolved/i);
    });
});

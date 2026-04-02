import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    runExecutionService: {
        startRun: vi.fn(),
        abortRun: vi.fn(),
    },
    orchestratorExecutionService: {
        start: vi.fn(),
        abort: vi.fn(),
    },
}));

vi.mock('@/app/backend/runtime/services/runExecution/service', () => ({
    runExecutionService: mocks.runExecutionService,
}));

vi.mock('@/app/backend/runtime/services/orchestrator/executionService', () => ({
    orchestratorExecutionService: mocks.orchestratorExecutionService,
}));

import {
    createCaller,
    createSessionInScope,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import { runStore } from '@/app/backend/persistence/stores';

registerRuntimeContractHooks();

describe('runtime contracts: plan phases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.runExecutionService.startRun.mockResolvedValue({
            accepted: true,
            runId: 'run_phase_router' as never,
        });
        mocks.runExecutionService.abortRun.mockResolvedValue(undefined);
        mocks.orchestratorExecutionService.start.mockResolvedValue({
            isErr: () => false,
            isOk: () => true,
            value: {
                started: true,
                run: { id: 'orch_phase_router' } as never,
                steps: [] as never,
            },
        } as never);
        mocks.orchestratorExecutionService.abort.mockResolvedValue({
            aborted: true,
            runId: 'orch_phase_router' as never,
            latest: { found: false },
        });
    });

    it('expands, revises, approves, implements, and cancels detailed phases through the router', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, runtimeContractProfileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_plan_phase_router',
            title: 'Plan phase router thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId: runtimeContractProfileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Draft an advanced plan and then expand its first detailed phase.',
            planningDepth: 'advanced',
            workspaceFingerprint: 'wsf_plan_phase_router',
        });
        expect(started.plan.planningDepth).toBe('advanced');

        let activePlan = started.plan;
        for (const question of activePlan.questions.filter((candidate) => candidate.required)) {
            const answered = await caller.plan.answerQuestion({
                profileId: runtimeContractProfileId,
                planId: activePlan.id,
                questionId: question.id,
                answer: `Answer for ${question.id}`,
            });
            if (!answered.found) {
                throw new Error('Expected the clarifying question answer to persist.');
            }
            activePlan = answered.plan;
        }
        const advancedSnapshot = started.plan.advancedSnapshot;
        if (!advancedSnapshot) {
            throw new Error('Expected the advanced plan snapshot to be available.');
        }

        const revisedWithSnapshot = await caller.plan.revise({
            profileId: runtimeContractProfileId,
            planId: activePlan.id,
            summaryMarkdown: '# Phase Router Plan\n\nPrepare the approved roadmap for phase expansion.',
            items: [
                { description: 'Inspect the approved roadmap.' },
                { description: 'Prepare the first detailed phase.' },
            ],
            advancedSnapshot,
        });
        expect(revisedWithSnapshot.found).toBe(true);
        if (!revisedWithSnapshot.found) {
            throw new Error('Expected the plan revision to succeed.');
        }

        const approved = await caller.plan.approve({
            profileId: runtimeContractProfileId,
            planId: activePlan.id,
            revisionId: revisedWithSnapshot.plan.currentRevisionId,
        });
        expect(approved.found).toBe(true);

        const expanded = await caller.plan.expandNextPhase({
            profileId: runtimeContractProfileId,
            planId: activePlan.id,
        });
        expect(expanded.found).toBe(true);
        if (!expanded.found) {
            throw new Error('Expected the phase expansion to succeed.');
        }
        const expandedPhases = expanded.plan.phases ?? [];
        expect(expandedPhases).toHaveLength(1);
        expect(expandedPhases[0]?.status).toBe('draft');
        expect(expanded.plan.hasOpenPhaseDraft).toBe(true);
        expect(expandedPhases[0]?.goalMarkdown).toContain('phase');

        const phase = expandedPhases[0];
        if (!phase) {
            throw new Error('Expected a detailed phase.');
        }

        const revisedPhase = await caller.plan.revisePhase({
            profileId: runtimeContractProfileId,
            planId: activePlan.id,
            phaseId: phase.id,
            phaseRevisionId: phase.currentRevisionId,
            summaryMarkdown: 'Expand the first detailed phase in more detail.',
            items: [
                { description: 'Refine the phase summary.' },
                { description: 'Refine the phase items.' },
            ],
        });
        expect(revisedPhase.found).toBe(true);
        if (!revisedPhase.found) {
            throw new Error('Expected the phase revision to succeed.');
        }

        const revisedPhaseView = revisedPhase.plan.phases?.[0];
        if (!revisedPhaseView) {
            throw new Error('Expected the revised phase to be present in the plan view.');
        }

        const approvedPhase = await caller.plan.approvePhase({
            profileId: runtimeContractProfileId,
            planId: activePlan.id,
            phaseId: phase.id,
            phaseRevisionId: revisedPhaseView.currentRevisionId,
        });
        expect(approvedPhase.found).toBe(true);

        const seededRun = await runStore.create({
            profileId: runtimeContractProfileId,
            sessionId: started.plan.sessionId,
            planId: activePlan.id,
            planRevisionId: activePlan.currentRevisionId,
            planPhaseId: phase.id,
            planPhaseRevisionId: revisedPhaseView.currentRevisionId,
            prompt: 'Implement the approved detailed phase for the TRPC test.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'none',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
            },
            transport: {
                selected: 'openai_responses',
            },
        });
        mocks.runExecutionService.startRun.mockResolvedValue({
            accepted: true,
            runId: seededRun.id,
        });

        const implementedPhase = await caller.plan.implementPhase({
            profileId: runtimeContractProfileId,
            planId: activePlan.id,
            phaseId: phase.id,
            phaseRevisionId: revisedPhaseView.currentRevisionId,
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
        });
        expect(implementedPhase.found).toBe(true);
        if (!implementedPhase.found) {
            throw new Error('Expected the phase implementation mutation to succeed.');
        }
        expect(implementedPhase.mode).toBe('agent.code');
        const implementationRunId = 'runId' in implementedPhase ? implementedPhase.runId : undefined;
        expect(implementationRunId).toBe(seededRun.id);

        const cancelledPhase = await caller.plan.cancelPhase({
            profileId: runtimeContractProfileId,
            planId: activePlan.id,
            phaseId: phase.id,
        });
        expect(cancelledPhase.found).toBe(true);
        if (!cancelledPhase.found) {
            throw new Error('Expected the phase cancel mutation to succeed.');
        }
        expect((cancelledPhase.plan.phases ?? [])[0]?.status).toBe('cancelled');
    }, 20000);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    runExecutionService: {
        startRun: vi.fn(),
    },
    orchestratorExecutionService: {
        start: vi.fn(),
    },
}));

vi.mock('@/app/backend/runtime/services/runExecution/service', () => ({
    runExecutionService: mocks.runExecutionService,
}));

vi.mock('@/app/backend/runtime/services/orchestrator/executionService', () => ({
    orchestratorExecutionService: mocks.orchestratorExecutionService,
}));

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    conversationStore,
    orchestratorStore,
    planPhaseStore,
    planStore,
    runStore,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import type { EntityId, RuntimeRunOptions } from '@/app/backend/runtime/contracts';
import { buildAdvancedPlanningSnapshotScaffold } from '@/app/backend/runtime/services/plan/advancedPlanningScaffold';
import { implementApprovedPlanPhase } from '@/app/backend/runtime/services/plan/phaseImplementation';
import { planService } from '@/app/backend/runtime/services/plan/service';

const runtimeOptions: RuntimeRunOptions = {
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
};

describe('implementApprovedPlanPhase', () => {
    beforeEach(() => {
        resetPersistenceForTests();
        vi.clearAllMocks();
    });

    async function seedSession(workspaceFingerprint: string, topLevelTab: 'agent' | 'orchestrator'): Promise<EntityId<'sess'>> {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Phase Implementation Test',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Planning Thread',
            topLevelTab,
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation success, received "${session.reason}".`);
        }

        return session.session.id;
    }

    async function createApprovedPhasePlan(workspaceFingerprint: string, topLevelTab: 'agent' | 'orchestrator') {
        const sessionId = await seedSession(workspaceFingerprint, topLevelTab);
        const advancedSnapshot = buildAdvancedPlanningSnapshotScaffold({
            sourcePrompt: `Implement a detailed phase on ${topLevelTab}.`,
            questions: [],
            answers: {},
            status: 'draft',
            currentRevisionNumber: 1,
            planningDepth: 'advanced',
            itemDescriptions: ['Seed the approved roadmap.', 'Create a detailed phase.'],
        });

        const created = await planStore.create({
            profileId: getDefaultProfileId(),
            sessionId,
            topLevelTab,
            modeKey: 'plan',
            planningDepth: 'advanced',
            sourcePrompt: `Implement a detailed phase on ${topLevelTab}.`,
            summaryMarkdown: '# Advanced Plan',
            questions: [],
            advancedSnapshot,
        });

        for (const question of created.questions) {
            const answered = await planService.answerQuestion({
                profileId: getDefaultProfileId(),
                planId: created.id,
                questionId: question.id,
                answer: question.placeholderText ?? 'Acknowledged.',
            });
            if (!answered.found) {
                throw new Error('Expected question answer success.');
            }
        }

        const revised = await planStore.revise(created.id, '# Revised Advanced Plan', [
            'Seed the approved roadmap.',
            'Create a detailed phase.',
        ]);
        if (!revised) {
            throw new Error('Expected advanced plan revision.');
        }

        const approved = await planStore.approve(created.id, revised.currentRevisionId);
        if (!approved) {
            throw new Error('Expected advanced plan approval.');
        }

        const phaseOutline = approved.advancedSnapshot?.phases[0];
        if (!phaseOutline) {
            throw new Error('Expected a roadmap phase outline.');
        }

        const phase = await planPhaseStore.expandPhase({
            planId: approved.id,
            planRevisionId: approved.currentRevisionId,
            planVariantId: approved.currentVariantId,
            phaseOutline,
            summaryMarkdown: 'Prepare the detailed phase for implementation.',
            itemDescriptions: ['Draft the execution details.', 'Confirm the implementation path.'],
        });
        if (!phase) {
            throw new Error('Expected phase expansion success.');
        }

        const approvedPhase = await planPhaseStore.approvePhase({
            planId: approved.id,
            planPhaseId: phase.id,
            phaseRevisionId: phase.currentRevisionId,
        });
        if (!approvedPhase) {
            throw new Error('Expected phase approval success.');
        }

        return { plan: approved, phase: approvedPhase };
    }

    it('starts agent phase implementation with phase provenance', async () => {
        const { plan, phase } = await createApprovedPhasePlan('wsf_phase_implementation_agent', 'agent');
        const run = await runStore.create({
            profileId: getDefaultProfileId(),
            sessionId: plan.sessionId,
            planId: plan.id,
            planRevisionId: plan.approvedRevisionId ?? plan.currentRevisionId,
            planPhaseId: phase.id,
            planPhaseRevisionId: phase.currentRevisionId,
            prompt: 'Implement the approved detailed phase.',
            providerId: 'openai',
            modelId: 'gpt-5',
            authMethod: 'none',
            runtimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });
        mocks.runExecutionService.startRun.mockResolvedValue({
            accepted: true,
            runId: run.id,
        });

        const result = await implementApprovedPlanPhase({
            profileId: getDefaultProfileId(),
            planId: plan.id,
            phaseId: phase.id,
            phaseRevisionId: phase.currentRevisionId,
            runtimeOptions,
        });

        expect(result.isOk()).toBe(true);
        expect(mocks.runExecutionService.startRun).toHaveBeenCalledWith(
            expect.objectContaining({
                planId: plan.id,
                planPhaseId: phase.id,
                planPhaseRevisionId: phase.currentRevisionId,
                topLevelTab: 'agent',
                modeKey: 'code',
            })
        );

        const refreshedPhase = await planPhaseStore.getById(phase.id);
        expect(refreshedPhase?.status).toBe('implementing');
        expect(refreshedPhase?.implementationRunId).toBe(run.id);
    }, 20000);

    it('starts orchestrator phase implementation with phase provenance', async () => {
        const { plan, phase } = await createApprovedPhasePlan('wsf_phase_implementation_orchestrator', 'orchestrator');
        const orchestratorRun = await orchestratorStore.createRun({
            profileId: getDefaultProfileId(),
            sessionId: plan.sessionId,
            planId: plan.id,
            planRevisionId: plan.approvedRevisionId ?? plan.currentRevisionId,
            planPhaseId: phase.id,
            planPhaseRevisionId: phase.currentRevisionId,
            executionStrategy: 'delegate',
            stepDescriptions: phase.items.map((item) => item.description),
        });
        mocks.orchestratorExecutionService.start.mockResolvedValue({
            isOk: () => true,
            isErr: () => false,
            value: orchestratorRun,
            _unsafeUnwrap: () => orchestratorRun,
        } as never);

        const result = await implementApprovedPlanPhase({
            profileId: getDefaultProfileId(),
            planId: plan.id,
            phaseId: phase.id,
            phaseRevisionId: phase.currentRevisionId,
            runtimeOptions,
        });

        expect(result.isOk()).toBe(true);
        expect(mocks.orchestratorExecutionService.start).toHaveBeenCalledWith(
            expect.objectContaining({
                planId: plan.id,
                profileId: getDefaultProfileId(),
                executionStrategy: 'delegate',
                approvedArtifact: expect.objectContaining({
                    planId: plan.id,
                    topLevelTab: 'orchestrator',
                    approvedRevisionId: plan.approvedRevisionId ?? plan.currentRevisionId,
                }),
            })
        );

        const refreshedPhase = await planPhaseStore.getById(phase.id);
        expect(refreshedPhase?.status).toBe('implementing');
        expect(refreshedPhase?.orchestratorRunId).toBe(orchestratorRun.run.id);
    }, 20000);
});

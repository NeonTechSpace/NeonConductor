import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    conversationStore,
    planPhaseStore,
    planStore,
    runStore,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { buildAdvancedPlanningSnapshotScaffold } from '@/app/backend/runtime/services/plan/advancedPlanningScaffold';
import { planService } from '@/app/backend/runtime/services/plan/service';

describe('planPhaseStore', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    async function seedSession(workspaceFingerprint: string): Promise<EntityId<'sess'>> {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Phase Store Test',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Planning Thread',
            topLevelTab: 'agent',
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

    async function createApprovedAdvancedPlan(workspaceFingerprint: string) {
        const sessionId = await seedSession(workspaceFingerprint);
        const advancedSnapshot = buildAdvancedPlanningSnapshotScaffold({
            sourcePrompt: 'Expand the detailed phase lane.',
            questions: [],
            answers: {},
            status: 'draft',
            currentRevisionNumber: 1,
            planningDepth: 'advanced',
            itemDescriptions: ['Inspect the approved roadmap.', 'Seed phase detail.'],
        });

        const created = await planStore.create({
            profileId: getDefaultProfileId(),
            sessionId,
            topLevelTab: 'agent',
            modeKey: 'plan',
            planningDepth: 'advanced',
            sourcePrompt: 'Expand the detailed phase lane.',
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
            'Inspect the approved roadmap.',
            'Seed phase detail.',
        ]);
        if (!revised) {
            throw new Error('Expected advanced plan revision.');
        }

        const approved = await planStore.approve(created.id, revised.currentRevisionId);
        if (!approved) {
            throw new Error('Expected advanced plan approval.');
        }

        return approved;
    }

    it('persists phase records, revisions, and next-expandable sequencing', async () => {
        const plan = await createApprovedAdvancedPlan('wsf_phase_store');
        const roadmapPhase = plan.advancedSnapshot?.phases[0];
        if (!roadmapPhase) {
            throw new Error('Expected an approved roadmap phase.');
        }

        const createdPhase = await planPhaseStore.expandPhase({
            planId: plan.id,
            planRevisionId: plan.currentRevisionId,
            planVariantId: plan.currentVariantId,
            phaseOutline: roadmapPhase,
            summaryMarkdown: 'Expand the first detailed phase.',
            itemDescriptions: ['Inspect the roadmap anchor.', 'Draft the detailed phase items.'],
        });
        expect(createdPhase).not.toBeNull();
        if (!createdPhase) {
            throw new Error('Expected a created detailed phase.');
        }
        expect(createdPhase.goalMarkdown).toBe(roadmapPhase.goalMarkdown);
        expect(createdPhase.exitCriteriaMarkdown).toBe(roadmapPhase.exitCriteriaMarkdown);
        expect(createdPhase.status).toBe('draft');
        expect(createdPhase.items).toHaveLength(2);

        const revisedPhase = await planPhaseStore.revisePhase({
            planId: plan.id,
            planPhaseId: createdPhase.id,
            phaseRevisionId: createdPhase.currentRevisionId,
            summaryMarkdown: 'Revise the first detailed phase.',
            itemDescriptions: ['Inspect the roadmap anchor.', 'Refine the detailed phase items.'],
        });
        expect(revisedPhase).not.toBeNull();
        if (!revisedPhase) {
            throw new Error('Expected a revised detailed phase.');
        }
        expect(revisedPhase.currentRevisionNumber).toBe(2);
        expect(revisedPhase.summaryMarkdown).toBe('Revise the first detailed phase.');

        const approvedPhase = await planPhaseStore.approvePhase({
            planId: plan.id,
            planPhaseId: createdPhase.id,
            phaseRevisionId: revisedPhase.currentRevisionId,
        });
        expect(approvedPhase).not.toBeNull();
        if (!approvedPhase) {
            throw new Error('Expected an approved detailed phase.');
        }
        expect(approvedPhase.status).toBe('approved');
        expect(approvedPhase.approvedRevisionId).toBe(revisedPhase.currentRevisionId);

        const phaseRun = await runStore.create({
            profileId: getDefaultProfileId(),
            sessionId: plan.sessionId,
            planId: plan.id,
            planRevisionId: plan.currentRevisionId,
            planPhaseId: createdPhase.id,
            planPhaseRevisionId: revisedPhase.currentRevisionId,
            prompt: 'Seed detailed phase provenance for the store test.',
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

        const implementingPhase = await planPhaseStore.markPhaseImplementing({
            planId: plan.id,
            planPhaseId: createdPhase.id,
            phaseRevisionId: revisedPhase.currentRevisionId,
            implementationRunId: phaseRun.id as EntityId<'run'>,
        });
        expect(implementingPhase?.status).toBe('implementing');

        const implementedPhase = await planPhaseStore.markPhaseImplemented({
            planId: plan.id,
            planPhaseId: createdPhase.id,
            phaseRevisionId: revisedPhase.currentRevisionId,
        });
        expect(implementedPhase?.status).toBe('implemented');

        const nextExpandableOutlineId = await planPhaseStore.getNextExpandablePhaseOutlineId({
            planId: plan.id,
            planRevisionId: plan.currentRevisionId,
            planVariantId: plan.currentVariantId,
            advancedSnapshot: plan.advancedSnapshot,
        });
        expect(nextExpandableOutlineId).toBe(plan.advancedSnapshot?.phases[1]?.id);

        const secondPhase = plan.advancedSnapshot?.phases[1];
        if (!secondPhase) {
            throw new Error('Expected a second roadmap phase.');
        }

        const expandedSecondPhase = await planPhaseStore.expandPhase({
            planId: plan.id,
            planRevisionId: plan.currentRevisionId,
            planVariantId: plan.currentVariantId,
            phaseOutline: secondPhase,
            summaryMarkdown: 'Expand the second detailed phase.',
            itemDescriptions: ['Carry the roadmap forward.'],
        });
        expect(expandedSecondPhase).not.toBeNull();
        if (!expandedSecondPhase) {
            throw new Error('Expected a second detailed phase.');
        }
        expect(expandedSecondPhase.phaseOutlineId).toBe(secondPhase.id);

        const cancelledPhase = await planPhaseStore.cancelPhase({
            planId: plan.id,
            planPhaseId: expandedSecondPhase.id,
            phaseRevisionId: expandedSecondPhase.currentRevisionId,
        });
        expect(cancelledPhase?.status).toBe('cancelled');

        const refreshedPhase = await planPhaseStore.getById(expandedSecondPhase.id);
        expect(refreshedPhase?.status).toBe('cancelled');

        const blockedNextExpandableOutlineId = await planPhaseStore.getNextExpandablePhaseOutlineId({
            planId: plan.id,
            planRevisionId: plan.currentRevisionId,
            planVariantId: plan.currentVariantId,
            advancedSnapshot: plan.advancedSnapshot,
        });
        expect(blockedNextExpandableOutlineId).toBeNull();

        const projection = await planStore.getProjectionById(getDefaultProfileId(), plan.id);
        expect(projection?.phases).toHaveLength(2);
    }, 20000);
});

import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    conversationStore,
    planStore,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import type { EntityId, RuntimeRunOptions } from '@/app/backend/runtime/contracts';
import { buildAdvancedPlanningSnapshotScaffold } from '@/app/backend/runtime/services/plan/advancedPlanningScaffold';
import {
    recordPlanResearchWorkerResult,
    startPlanResearchBatch,
} from '@/app/backend/runtime/services/plan/researchLifecycle';

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

describe('planner research lifecycle', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    async function seedSession(workspaceFingerprint: string): Promise<EntityId<'sess'>> {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Planner Research',
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

    async function createAdvancedPlan(workspaceFingerprint: string) {
        const sessionId = await seedSession(workspaceFingerprint);
        const advancedSnapshot = buildAdvancedPlanningSnapshotScaffold({
            sourcePrompt: 'Investigate the planner research lane.',
            questions: [],
            answers: {},
            status: 'draft',
            currentRevisionNumber: 1,
            planningDepth: 'advanced',
            itemDescriptions: [
                'Inspect the planning artifact.',
                'Attach structured research evidence.',
            ],
        });

        return planStore.create({
            profileId: getDefaultProfileId(),
            sessionId,
            topLevelTab: 'agent',
            modeKey: 'plan',
            planningDepth: 'advanced',
            sourcePrompt: 'Investigate the planner research lane.',
            summaryMarkdown: '# Advanced Plan',
            questions: [],
            advancedSnapshot,
        });
    }

    function buildValidWorkerResponse(): string {
        return [
            '## Findings',
            'The current plan surface needs evidence synthesis.',
            '',
            '## Evidence',
            '- Existing phase outline is still shallow.',
            '',
            '## Open Questions',
            '- Which risks deserve dedicated worker coverage?',
            '',
            '## Recommendation',
            'Launch another research pass only after reviewing the first evidence attachment.',
        ].join('\n');
    }

    it('rejects planner research on simple plans', async () => {
        const sessionId = await seedSession('wsf_plan_research_simple');
        const simplePlan = await planStore.create({
            profileId: getDefaultProfileId(),
            sessionId,
            topLevelTab: 'agent',
            modeKey: 'plan',
            sourcePrompt: 'Create a simple plan first.',
            summaryMarkdown: '# Simple Plan',
            questions: [],
        });

        const result = await startPlanResearchBatch({
            profileId: getDefaultProfileId(),
            planId: simplePlan.id,
            promptMarkdown: 'Investigate the hidden risks.',
            workerCount: 1,
            runtimeOptions,
            workspaceFingerprint: 'wsf_plan_research_simple',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected planner research to reject simple plans.');
        }
        expect(result.error.code).toBe('invalid_state');
        expect(result.error.message).toMatch(/advanced plans/i);
    });

    it('fails closed when a worker response does not match the required markdown contract', async () => {
        const advancedPlan = await createAdvancedPlan('wsf_plan_research_parse');
        const researchBatch = await planStore.startResearchBatch({
            planId: advancedPlan.id,
            planRevisionId: advancedPlan.currentRevisionId,
            variantId: advancedPlan.currentVariantId,
            promptMarkdown: 'Investigate the riskiest assumptions.',
            requestedWorkerCount: 1,
            recommendedWorkerCount: 1,
            hardMaxWorkerCount: 2,
            workers: [
                {
                    sequence: 1,
                    label: 'Worker 1 of 1',
                    promptMarkdown: 'Investigate the current state model.',
                },
            ],
        });
        if (!researchBatch) {
            throw new Error('Expected a planner research batch.');
        }

        const researchWorker = (await planStore.listResearchWorkers(researchBatch.id))[0];
        if (!researchWorker) {
            throw new Error('Expected a planner research worker.');
        }

        const recorded = await recordPlanResearchWorkerResult({
            profileId: getDefaultProfileId(),
            planId: advancedPlan.id,
            researchBatchId: researchBatch.id,
            researchWorkerId: researchWorker.id,
            rawResponseMarkdown: 'This response does not follow the required section contract.',
        });

        expect(recorded.isErr()).toBe(true);
        if (recorded.isOk()) {
            throw new Error('Expected planner research parsing to fail for malformed responses.');
        }
        expect(recorded.error.code).toBe('research_parse_failed');

        const failedWorker = await planStore.getResearchWorkerById(researchWorker.id);
        expect(failedWorker?.status).toBe('failed');
        expect(failedWorker?.errorMessage).toMatch(/parse/i);

        const projection = await planStore.getProjectionById(getDefaultProfileId(), advancedPlan.id);
        expect(projection?.evidenceAttachments).toEqual([]);
    });

    it('copies immutable evidence attachments forward when revising an advanced plan', async () => {
        const advancedPlan = await createAdvancedPlan('wsf_plan_research_carry_forward');
        const researchBatch = await planStore.startResearchBatch({
            planId: advancedPlan.id,
            planRevisionId: advancedPlan.currentRevisionId,
            variantId: advancedPlan.currentVariantId,
            promptMarkdown: 'Investigate the rollout assumptions.',
            requestedWorkerCount: 1,
            recommendedWorkerCount: 1,
            hardMaxWorkerCount: 2,
            workers: [
                {
                    sequence: 1,
                    label: 'Worker 1 of 1',
                    promptMarkdown: 'Investigate the rollout assumptions from a risk perspective.',
                },
            ],
        });
        if (!researchBatch) {
            throw new Error('Expected a planner research batch.');
        }

        const researchWorker = (await planStore.listResearchWorkers(researchBatch.id))[0];
        if (!researchWorker) {
            throw new Error('Expected a planner research worker.');
        }

        const recorded = await recordPlanResearchWorkerResult({
            profileId: getDefaultProfileId(),
            planId: advancedPlan.id,
            researchBatchId: researchBatch.id,
            researchWorkerId: researchWorker.id,
            rawResponseMarkdown: buildValidWorkerResponse(),
        });
        expect(recorded.isOk()).toBe(true);

        const projectionBeforeRevise = await planStore.getProjectionById(getDefaultProfileId(), advancedPlan.id);
        expect(projectionBeforeRevise?.evidenceAttachments).toHaveLength(1);

        const revised = await planStore.revise(advancedPlan.id, '# Revised Plan', [
            'Inspect the planning artifact.',
            'Review the evidence attachments.',
        ]);
        expect(revised?.currentRevisionNumber).toBe(2);

        const projectionAfterRevise = await planStore.getProjectionById(getDefaultProfileId(), advancedPlan.id);
        expect(projectionAfterRevise?.plan.currentRevisionId).not.toBe(advancedPlan.currentRevisionId);
        expect(projectionAfterRevise?.evidenceAttachments).toHaveLength(1);
        expect(projectionAfterRevise?.evidenceAttachments[0]?.label).toBe('Worker 1 of 1');
        expect(projectionAfterRevise?.evidenceAttachments[0]?.researchBatchId).toBe(researchBatch.id);
    });
});

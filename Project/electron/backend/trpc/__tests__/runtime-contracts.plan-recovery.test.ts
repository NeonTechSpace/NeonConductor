import { describe, expect, it } from 'vitest';

import { planStore, runtimeEventStore } from '@/app/backend/persistence/stores';
import {
    createCaller,
    createSessionInScope,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: planning recovery and history', () => {
    const profileId = runtimeContractProfileId;

    it('creates a default variant, supports branching and resuming without rewriting history, and projects recovery history', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_plan_recovery_variants',
            title: 'Plan recovery variants thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Recover this plan without mutating historical revisions.',
        });

        expect(started.plan.currentVariantId).toMatch(/^pvar_/);
        expect(started.plan.currentVariantName).toBe('main');
        expect(started.plan.variants).toHaveLength(1);
        expect(started.plan.variants[0]).toMatchObject({
            id: started.plan.currentVariantId,
            name: 'main',
            currentRevisionId: started.plan.currentRevisionId,
            currentRevisionNumber: 1,
            isCurrent: true,
        });

        const revisionsAfterStart = await planStore.listRevisions(started.plan.id);
        expect(revisionsAfterStart).toHaveLength(1);
        expect(revisionsAfterStart[0]?.variantId).toBe(started.plan.currentVariantId);
        expect(revisionsAfterStart[0]?.previousRevisionId).toBeUndefined();

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Support lightweight recovery variants and resume from history.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Never rewrite older revisions in place.',
        });

        const firstRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Main Revision Two',
            items: [{ description: 'Keep the main branch moving.' }],
        });
        expect(firstRevision.found).toBe(true);
        if (!firstRevision.found) {
            throw new Error('Expected first recovery revision.');
        }

        const approved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: firstRevision.plan.currentRevisionId,
        });
        expect(approved.found).toBe(true);
        if (!approved.found) {
            throw new Error('Expected recovery approval.');
        }
        expect(approved.plan.approvedVariantId).toBe(approved.plan.currentVariantId);

        const secondRevision = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Main Revision Three',
            items: [{ description: 'Advance the main branch draft.' }],
        });
        expect(secondRevision.found).toBe(true);
        if (!secondRevision.found) {
            throw new Error('Expected second recovery revision.');
        }

        const createdVariant = await caller.plan.createVariant({
            profileId,
            planId: started.plan.id,
            sourceRevisionId: firstRevision.plan.currentRevisionId,
        });
        expect(createdVariant.found).toBe(true);
        if (!createdVariant.found) {
            throw new Error('Expected createVariant to succeed.');
        }
        expect(createdVariant.plan.currentVariantId).not.toBe(secondRevision.plan.currentVariantId);
        expect(createdVariant.plan.approvedVariantId).toBe(approved.plan.approvedVariantId);
        expect(createdVariant.plan.currentRevisionId).not.toBe(firstRevision.plan.currentRevisionId);
        expect(createdVariant.plan.items.map((item) => item.description)).toEqual(['Keep the main branch moving.']);

        const createdVariantId = createdVariant.plan.currentVariantId;
        const mainVariantId = requireEntityId(secondRevision.plan.currentVariantId, 'pvar', 'Expected main variant id.');

        const activatedMain = await caller.plan.activateVariant({
            profileId,
            planId: started.plan.id,
            variantId: mainVariantId,
        });
        expect(activatedMain.found).toBe(true);
        if (!activatedMain.found) {
            throw new Error('Expected activateVariant to succeed.');
        }
        expect(activatedMain.plan.currentVariantId).toBe(mainVariantId);
        expect(activatedMain.plan.currentRevisionId).toBe(secondRevision.plan.currentRevisionId);
        expect(activatedMain.plan.items.map((item) => item.description)).toEqual(['Advance the main branch draft.']);

        const resumed = await caller.plan.resumeFromRevision({
            profileId,
            planId: started.plan.id,
            sourceRevisionId: firstRevision.plan.currentRevisionId,
        });
        expect(resumed.found).toBe(true);
        if (!resumed.found) {
            throw new Error('Expected resumeFromRevision to succeed.');
        }
        expect(resumed.plan.currentVariantId).toBe(mainVariantId);
        expect(resumed.plan.currentRevisionNumber).toBeGreaterThan(secondRevision.plan.currentRevisionNumber);
        expect(resumed.plan.items.map((item) => item.description)).toEqual(['Keep the main branch moving.']);
        expect(resumed.plan.approvedVariantId).toBe(approved.plan.approvedVariantId);
        expect(resumed.plan.approvedRevisionId).toBe(approved.plan.approvedRevisionId);

        expect(resumed.plan.history.map((entry) => entry.kind)).toEqual(
            expect.arrayContaining(['variant_created', 'variant_activated', 'plan_resumed'])
        );

        const allRevisions = await planStore.listRevisions(started.plan.id);
        const resumedRevision = allRevisions.find((revision) => revision.id === resumed.plan.currentRevisionId);
        expect(resumedRevision?.variantId).toBe(mainVariantId);
        expect(resumedRevision?.previousRevisionId).toBe(secondRevision.plan.currentRevisionId);

        const events = await runtimeEventStore.listByEntity({
            entityType: 'plan',
            entityId: started.plan.id,
            limit: 100,
        });
        expect(events.some((event) => event.eventType === 'plan.variant_created')).toBe(true);
        expect(events.some((event) => event.eventType === 'plan.variant_activated')).toBe(true);
        expect(events.some((event) => event.eventType === 'plan.resumed')).toBe(true);

        const refreshed = await caller.plan.get({
            profileId,
            planId: started.plan.id,
        });
        expect(refreshed.found).toBe(true);
        if (!refreshed.found) {
            throw new Error('Expected refreshed recovery plan.');
        }
        expect(refreshed.plan.variants.map((variant) => variant.id)).toEqual(
            expect.arrayContaining([mainVariantId, createdVariantId])
        );
    });

    it('blocks approval while follow-ups are open and clears the recovery state after resolution', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_plan_recovery_followups',
            title: 'Plan recovery follow-ups thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Recover from missing context and keep approval blocked until resolved.',
        });

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Track missing context as a recovery follow-up.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Approval should fail while any follow-up remains open.',
        });

        const revised = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Follow-up Plan',
            items: [{ description: 'Raise a recovery follow-up.' }],
        });
        expect(revised.found).toBe(true);
        if (!revised.found) {
            throw new Error('Expected follow-up revision.');
        }

        const raised = await caller.plan.raiseFollowUp({
            profileId,
            planId: started.plan.id,
            kind: 'missing_context',
            promptMarkdown: 'Need the final recovery acceptance criteria.',
            sourceRevisionId: revised.plan.currentRevisionId,
        });
        expect(raised.found).toBe(true);
        if (!raised.found) {
            throw new Error('Expected follow-up creation.');
        }
        expect(raised.plan.followUps).toHaveLength(1);
        expect(raised.plan.followUps[0]).toMatchObject({
            kind: 'missing_context',
            status: 'open',
            sourceRevisionId: revised.plan.currentRevisionId,
        });
        expect(raised.plan.recoveryBanner?.title).toContain('follow-ups');
        const followUpId = raised.plan.followUps[0]?.id;
        if (!followUpId) {
            throw new Error('Expected follow-up identifier.');
        }

        await expect(
            caller.plan.approve({
                profileId,
                planId: started.plan.id,
                revisionId: revised.plan.currentRevisionId,
            })
        ).rejects.toThrow(/follow-up/i);

        const resolved = await caller.plan.resolveFollowUp({
            profileId,
            planId: started.plan.id,
            followUpId,
            status: 'resolved',
            responseMarkdown: 'Use the existing recovery banner and timeline surface.',
        });
        expect(resolved.found).toBe(true);
        if (!resolved.found) {
            throw new Error('Expected follow-up resolution.');
        }
        expect(resolved.plan.followUps[0]).toMatchObject({
            status: 'resolved',
            responseMarkdown: 'Use the existing recovery banner and timeline surface.',
        });

        const approved = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revised.plan.currentRevisionId,
        });
        expect(approved.found).toBe(true);
        if (!approved.found) {
            throw new Error('Expected approval after resolving the follow-up.');
        }
        expect(approved.plan.status).toBe('approved');
        expect(approved.plan.history.map((entry) => entry.kind)).toEqual(
            expect.arrayContaining(['follow_up_raised', 'follow_up_resolved', 'revision_approved'])
        );

        const events = await runtimeEventStore.listByEntity({
            entityType: 'plan',
            entityId: started.plan.id,
            limit: 100,
        });
        expect(events.some((event) => event.eventType === 'plan.follow_up_raised')).toBe(true);
        expect(events.some((event) => event.eventType === 'plan.follow_up_resolved')).toBe(true);
    });
});

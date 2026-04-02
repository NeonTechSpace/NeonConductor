import { describe, expect, it } from 'vitest';

import { planStore, runStore, runtimeEventStore } from '@/app/backend/persistence/stores';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: planning cancel flow', () => {
    const profileId = runtimeContractProfileId;

    it('cancels allowed plan states without rewriting revision history and allows re-entry afterward', async () => {
        const caller = createCaller();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_plan_cancel_allowed_states',
            title: 'Plan cancel allowed states thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Plan a cancelable change.',
        });
        expect(started.plan.status).toBe('awaiting_answers');
        expect(started.plan.currentRevisionNumber).toBe(1);

        const cancelledAwaitingAnswers = await caller.plan.cancel({
            profileId,
            planId: started.plan.id,
        });
        expect(cancelledAwaitingAnswers.found).toBe(true);
        if (!cancelledAwaitingAnswers.found) {
            throw new Error('Expected cancelling an awaiting-answers plan to succeed.');
        }
        expect(cancelledAwaitingAnswers.plan.status).toBe('cancelled');
        expect(cancelledAwaitingAnswers.plan.currentRevisionId).toBe(started.plan.currentRevisionId);
        expect(cancelledAwaitingAnswers.plan.currentRevisionNumber).toBe(1);
        expect(cancelledAwaitingAnswers.plan.approvedRevisionId).toBeUndefined();

        const revisedAfterCancel = await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Cancelled Plan Revision\n\n- Re-enter draft mode after cancellation.',
            items: [{ description: 'Re-enter draft mode after cancellation.' }],
        });
        expect(revisedAfterCancel.found).toBe(true);
        if (!revisedAfterCancel.found) {
            throw new Error('Expected revise-after-cancel to succeed.');
        }
        expect(revisedAfterCancel.plan.status).toBe('draft');
        expect(revisedAfterCancel.plan.currentRevisionNumber).toBe(2);
        expect(revisedAfterCancel.plan.approvedRevisionId).toBeUndefined();

        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Re-enter the plan flow after cancellation.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Do not lose immutable revision history.',
        });

        const cancelledDraft = await caller.plan.cancel({
            profileId,
            planId: started.plan.id,
        });
        expect(cancelledDraft.found).toBe(true);
        if (!cancelledDraft.found) {
            throw new Error('Expected cancelling a draft plan to succeed.');
        }
        expect(cancelledDraft.plan.status).toBe('cancelled');
        expect(cancelledDraft.plan.currentRevisionId).toBe(revisedAfterCancel.plan.currentRevisionId);
        expect(cancelledDraft.plan.approvedRevisionId).toBeUndefined();

        const approvedAfterCancel = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revisedAfterCancel.plan.currentRevisionId,
        });
        expect(approvedAfterCancel.found).toBe(true);
        if (!approvedAfterCancel.found) {
            throw new Error('Expected approval after cancel to succeed.');
        }
        expect(approvedAfterCancel.plan.status).toBe('approved');
        expect(approvedAfterCancel.plan.approvedRevisionId).toBe(revisedAfterCancel.plan.currentRevisionId);
        expect(approvedAfterCancel.plan.approvedRevisionNumber).toBe(2);

        const cancelledApproved = await caller.plan.cancel({
            profileId,
            planId: started.plan.id,
        });
        expect(cancelledApproved.found).toBe(true);
        if (!cancelledApproved.found) {
            throw new Error('Expected cancelling an approved plan to succeed.');
        }
        expect(cancelledApproved.plan.status).toBe('cancelled');
        expect(cancelledApproved.plan.currentRevisionId).toBe(revisedAfterCancel.plan.currentRevisionId);
        expect(cancelledApproved.plan.approvedRevisionId).toBe(revisedAfterCancel.plan.currentRevisionId);
        expect(cancelledApproved.plan.approvedRevisionNumber).toBe(2);

        const approvedAgain = await caller.plan.approve({
            profileId,
            planId: started.plan.id,
            revisionId: revisedAfterCancel.plan.currentRevisionId,
        });
        expect(approvedAgain.found).toBe(true);
        if (!approvedAgain.found) {
            throw new Error('Expected approval after cancelling an approved plan to succeed.');
        }
        expect(approvedAgain.plan.status).toBe('approved');
        expect(approvedAgain.plan.approvedRevisionId).toBe(revisedAfterCancel.plan.currentRevisionId);

        const revisions = await planStore.listRevisions(started.plan.id);
        expect(revisions.map((revision) => revision.revisionNumber)).toEqual([1, 2]);

        const cancelledEvent = (await runtimeEventStore.list(null, 50)).find(
            (event) =>
                event.eventType === 'plan.cancelled' &&
                event.entityId === started.plan.id &&
                event.payload.previousStatus === 'approved'
        );
        expect(cancelledEvent?.payload.revisionId).toBe(revisedAfterCancel.plan.currentRevisionId);
        expect(cancelledEvent?.payload.revisionNumber).toBe(2);
        expect(cancelledEvent?.payload.approvedRevisionId).toBe(revisedAfterCancel.plan.currentRevisionId);
        expect(cancelledEvent?.payload.approvedRevisionNumber).toBe(2);
    });

    it('cancels failed plans and rejects cancelling implementing or implemented plans', async () => {
        const caller = createCaller();

        const failedSession = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_plan_cancel_failed_state',
            title: 'Plan cancel failed state thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const failedPlan = await caller.plan.start({
            profileId,
            sessionId: failedSession.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Prepare a failed plan state test.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: failedPlan.plan.id,
            questionId: 'scope',
            answer: 'Cancel after failure should still preserve revision history.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: failedPlan.plan.id,
            questionId: 'constraints',
            answer: 'Keep approved revisions intact.',
        });
        const failedRevision = await caller.plan.revise({
            profileId,
            planId: failedPlan.plan.id,
            summaryMarkdown: '# Failed Plan Revision',
            items: [{ description: 'Seed a single revision for failure-state cancellation.' }],
        });
        expect(failedRevision.found).toBe(true);
        if (!failedRevision.found) {
            throw new Error('Expected failed-state revision.');
        }
        await caller.plan.approve({
            profileId,
            planId: failedPlan.plan.id,
            revisionId: failedRevision.plan.currentRevisionId,
        });
        await planStore.markFailed(failedPlan.plan.id);

        const cancelledFailed = await caller.plan.cancel({
            profileId,
            planId: failedPlan.plan.id,
        });
        expect(cancelledFailed.found).toBe(true);
        if (!cancelledFailed.found) {
            throw new Error('Expected cancellation from failed state to succeed.');
        }
        expect(cancelledFailed.plan.status).toBe('cancelled');
        expect(cancelledFailed.plan.currentRevisionId).toBe(failedRevision.plan.currentRevisionId);
        expect(cancelledFailed.plan.approvedRevisionId).toBe(failedRevision.plan.currentRevisionId);

        const implementingSession = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_plan_cancel_implementing_state',
            title: 'Plan cancel implementing state thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const implementingPlan = await caller.plan.start({
            profileId,
            sessionId: implementingSession.session.id,
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Prepare an implementation-state cancellation test.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: implementingPlan.plan.id,
            questionId: 'scope',
            answer: 'Prove cancel rejects while implementing or implemented.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: implementingPlan.plan.id,
            questionId: 'constraints',
            answer: 'Do not rewrite history when rejecting cancel.',
        });
        const implementingRevision = await caller.plan.revise({
            profileId,
            planId: implementingPlan.plan.id,
            summaryMarkdown: '# Implementing Plan Revision',
            items: [{ description: 'Seed a single revision for implementing-state cancellation.' }],
        });
        expect(implementingRevision.found).toBe(true);
        if (!implementingRevision.found) {
            throw new Error('Expected implementing-state revision.');
        }
        await caller.plan.approve({
            profileId,
            planId: implementingPlan.plan.id,
            revisionId: implementingRevision.plan.currentRevisionId,
        });

        const implementingRun = await runStore.create({
            profileId,
            sessionId: implementingSession.session.id,
            planId: implementingPlan.plan.id,
            planRevisionId: implementingRevision.plan.currentRevisionId,
            prompt: 'Implement the approved plan revision.',
            providerId: 'openai',
            modelId: 'gpt-5.4-mini',
            authMethod: 'none',
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });

        await planStore.markImplementing(implementingPlan.plan.id, implementingRun.id);
        await expect(
            caller.plan.cancel({
                profileId,
                planId: implementingPlan.plan.id,
            })
        ).rejects.toThrow(/cannot be cancelled/i);

        const implementingState = await caller.plan.get({
            profileId,
            planId: implementingPlan.plan.id,
        });
        expect(implementingState.found).toBe(true);
        if (!implementingState.found) {
            throw new Error('Expected implementing plan to remain visible.');
        }
        expect(implementingState.plan.status).toBe('implementing');

        await planStore.markImplemented(implementingPlan.plan.id);
        await expect(
            caller.plan.cancel({
                profileId,
                planId: implementingPlan.plan.id,
            })
        ).rejects.toThrow(/cannot be cancelled/i);

        const implementedState = await caller.plan.get({
            profileId,
            planId: implementingPlan.plan.id,
        });
        expect(implementedState.found).toBe(true);
        if (!implementedState.found) {
            throw new Error('Expected implemented plan to remain visible.');
        }
        expect(implementedState.plan.status).toBe('implemented');
    });
});

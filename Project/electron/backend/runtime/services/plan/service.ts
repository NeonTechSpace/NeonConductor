import { planStore } from '@/app/backend/persistence/stores';
import type {
    EntityId,
    PlanAbortResearchBatchInput,
    PlanActivateVariantInput,
    PlanAnswerQuestionInput,
    PlanCancelInput,
    PlanCreateVariantInput,
    PlanGenerateDraftInput,
    PlanImplementInput,
    PlanEnterAdvancedPlanningInput,
    PlanRecordView,
    PlanRaiseFollowUpInput,
    PlanReviseInput,
    PlanResolveFollowUpInput,
    PlanResumeFromRevisionInput,
    PlanStartResearchBatchInput,
    PlanStartInput,
} from '@/app/backend/runtime/contracts';
import { approvePlan } from '@/app/backend/runtime/services/plan/approval';
import { generatePlanDraft } from '@/app/backend/runtime/services/plan/draftGeneration';
import { enterAdvancedPlanning as enterAdvancedPlanningFlow } from '@/app/backend/runtime/services/plan/enterAdvancedPlanning';
import { errPlan, okPlan, type PlanServiceError } from '@/app/backend/runtime/services/plan/errors';
import { implementApprovedPlan } from '@/app/backend/runtime/services/plan/implementation';
import { answerPlanQuestion, cancelPlan, revisePlan } from '@/app/backend/runtime/services/plan/lifecycle';
import {
    activatePlanVariant,
    createPlanVariant,
    raisePlanFollowUp,
    resolvePlanFollowUp,
    resumePlanFromRevision,
} from '@/app/backend/runtime/services/plan/recovery';
import { abortPlanResearchBatch, startPlanResearchBatch } from '@/app/backend/runtime/services/plan/researchLifecycle';
import { startPlanFlow } from '@/app/backend/runtime/services/plan/start';
import { refreshActivePlanView, refreshPlanViewById } from '@/app/backend/runtime/services/plan/status';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

export class PlanService {
    async start(input: PlanStartInput): Promise<Result<{ plan: PlanRecordView }, PlanServiceError>> {
        const result = await startPlanFlow(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.start request.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async startResearchBatch(
        input: PlanStartResearchBatchInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await startPlanResearchBatch(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.startResearchBatch request.',
                profileId: input.profileId,
                planId: input.planId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async getById(
        profileId: string,
        planId: EntityId<'plan'>
    ): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
        return refreshPlanViewById({
            profileId,
            planId,
        });
    }

    async getActiveBySession(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
    }): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
        return refreshActivePlanView(input);
    }

    async answerQuestion(
        input: PlanAnswerQuestionInput
    ): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
        return answerPlanQuestion(input);
    }

    async revise(
        input: PlanReviseInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await revisePlan(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.revise request.',
                profileId: input.profileId,
                planId: input.planId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async enterAdvancedPlanning(
        input: PlanEnterAdvancedPlanningInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await enterAdvancedPlanningFlow(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.enterAdvancedPlanning request.',
                profileId: input.profileId,
                planId: input.planId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async abortResearchBatch(
        input: PlanAbortResearchBatchInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await abortPlanResearchBatch(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.abortResearchBatch request.',
                profileId: input.profileId,
                planId: input.planId,
                researchBatchId: input.researchBatchId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async createVariant(
        input: PlanCreateVariantInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await createPlanVariant(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.createVariant request.',
                profileId: input.profileId,
                planId: input.planId,
                sourceRevisionId: input.sourceRevisionId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async activateVariant(
        input: PlanActivateVariantInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await activatePlanVariant(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.activateVariant request.',
                profileId: input.profileId,
                planId: input.planId,
                variantId: input.variantId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async resumeFromRevision(
        input: PlanResumeFromRevisionInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await resumePlanFromRevision(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.resumeFromRevision request.',
                profileId: input.profileId,
                planId: input.planId,
                sourceRevisionId: input.sourceRevisionId,
                ...(input.variantId ? { variantId: input.variantId } : {}),
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async raiseFollowUp(
        input: PlanRaiseFollowUpInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await raisePlanFollowUp(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.raiseFollowUp request.',
                profileId: input.profileId,
                planId: input.planId,
                kind: input.kind,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async resolveFollowUp(
        input: PlanResolveFollowUpInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await resolvePlanFollowUp(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.resolveFollowUp request.',
                profileId: input.profileId,
                planId: input.planId,
                followUpId: input.followUpId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async cancel(
        input: PlanCancelInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await cancelPlan(input);
        if (result.found) {
            return okPlan(result);
        }

        const existing = await planStore.getById(input.profileId, input.planId);
        if (!existing) {
            return okPlan(result);
        }

        const validation: PlanServiceError = {
            code: 'not_cancellable',
            message:
                existing.status === 'implementing' || existing.status === 'implemented'
                    ? 'Plan cannot be cancelled while implementation is active or after it has completed.'
                    : existing.status === 'cancelled'
                      ? 'Plan is already cancelled.'
                      : 'Plan cannot be cancelled in its current state.',
        };
        appLog.warn({
            tag: 'plan',
            message: 'Rejected plan.cancel request.',
            profileId: input.profileId,
            planId: input.planId,
            code: validation.code,
            error: validation.message,
            status: existing.status,
        });
        return errPlan(validation.code, validation.message);
    }

    async generateDraft(
        input: PlanGenerateDraftInput
    ): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await generatePlanDraft(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.generateDraft request.',
                profileId: input.profileId,
                planId: input.planId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async approve(input: {
        profileId: string;
        planId: EntityId<'plan'>;
        revisionId: EntityId<'prev'>;
    }): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
        const result = await approvePlan(input.profileId, input.planId, input.revisionId);
        if (result.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.approve request.',
                profileId: input.profileId,
                planId: input.planId,
                revisionId: input.revisionId,
                code: result.error.code,
                error: result.error.message,
            });
            return result;
        }

        return okPlan(result.value);
    }

    async implement(input: PlanImplementInput): Promise<
        Result<
            | { found: false }
            | { found: true; started: true; mode: 'agent.code'; runId: EntityId<'run'>; plan: PlanRecordView }
            | {
                  found: true;
                  started: true;
                  mode: 'orchestrator.orchestrate';
                  orchestratorRunId: EntityId<'orch'>;
                  plan: PlanRecordView;
              },
            PlanServiceError
        >
    > {
        const plan = await planStore.getById(input.profileId, input.planId);
        if (!plan) {
            return okPlan({ found: false });
        }
        if (plan.status !== 'approved' && plan.status !== 'implementing') {
            const validation: PlanServiceError = {
                code: 'not_approved',
                message: 'Plan must be approved before implementation.',
            };
            appLog.warn({
                tag: 'plan',
                message: 'Rejected plan.implement request.',
                profileId: input.profileId,
                planId: input.planId,
                code: validation.code,
                error: validation.message,
            });
            return errPlan(validation.code, validation.message);
        }
        const implementation = await implementApprovedPlan({
            profileId: input.profileId,
            plan,
            implementationInput: input,
        });
        if ('code' in implementation) {
            appLog.warn({
                tag: 'plan',
                message: 'Rejected unsupported or failed plan implementation request.',
                profileId: input.profileId,
                planId: input.planId,
                code: implementation.code,
                error: implementation.message,
                topLevelTab: plan.topLevelTab,
            });
            return errPlan(implementation.code, implementation.message);
        }

        return okPlan({
            found: true,
            ...implementation,
        });
    }
}

export const planService = new PlanService();

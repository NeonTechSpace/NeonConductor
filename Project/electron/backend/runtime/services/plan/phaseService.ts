import { planPhaseStore, planStore } from '@/app/backend/persistence/stores';
import type {
    EntityId,
    PlanAdvancedSnapshotView,
    PlanApprovePhaseInput,
    PlanCancelPhaseInput,
    PlanExpandNextPhaseInput,
    PlanImplementPhaseInput,
    PlanRecordView,
    PlanRevisePhaseInput,
} from '@/app/backend/runtime/contracts';
import { orchestratorExecutionService } from '@/app/backend/runtime/services/orchestrator/executionService';
import { errPlan, okPlan, type PlanServiceError } from '@/app/backend/runtime/services/plan/errors';
import {
    appendPlanPhaseApprovedEvent,
    appendPlanPhaseCancelledEvent,
    appendPlanPhaseExpandedEvent,
    appendPlanPhaseImplementationStartedEvent,
    appendPlanPhaseRevisedEvent,
} from '@/app/backend/runtime/services/plan/events';
import { buildPhaseExpansionScaffold } from '@/app/backend/runtime/services/plan/phaseScaffold';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';

import type { Result } from 'neverthrow';

function requirePhaseOutline(input: {
    plan: NonNullable<Awaited<ReturnType<typeof planStore.getById>>>;
    phaseOutlineId: string;
}): NonNullable<PlanAdvancedSnapshotView['phases'][number]> | null {
    const outline = input.plan.advancedSnapshot?.phases.find((phase) => phase.id === input.phaseOutlineId);
    return outline ?? null;
}

function buildPhaseImplementationPrompt(input: {
    title: string;
    summaryMarkdown: string;
    itemDescriptions: string[];
    goalMarkdown: string;
    exitCriteriaMarkdown: string;
}): string {
    const items = input.itemDescriptions.map((description) => `- ${description}`).join('\n');
    return [
        `Implement detailed phase: ${input.title}`,
        '',
        'Phase summary:',
        input.summaryMarkdown,
        '',
        'Phase goal:',
        input.goalMarkdown,
        '',
        'Phase exit criteria:',
        input.exitCriteriaMarkdown,
        '',
        'Phase items:',
        items.length > 0 ? items : '- No explicit phase items were provided.',
    ].join('\n');
}

function buildPhaseApprovedArtifact(input: {
    planId: EntityId<'plan'>;
    sessionId: EntityId<'sess'>;
    topLevelTab: 'agent' | 'orchestrator' | 'chat';
    revisionId: EntityId<'prev'>;
    revisionNumber: number;
    summaryMarkdown: string;
    itemDescriptions: string[];
}) {
    return {
        planId: input.planId,
        sessionId: input.sessionId,
        topLevelTab: input.topLevelTab,
        approvedRevisionId: input.revisionId,
        approvedRevisionNumber: input.revisionNumber,
        summaryMarkdown: input.summaryMarkdown,
        items: input.itemDescriptions.map((description, index) => ({
            sequence: index + 1,
            description,
        })),
    };
}

export async function expandNextPhase(
    input: PlanExpandNextPhaseInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const plan = await planStore.getById(input.profileId, input.planId);
    if (!plan) {
        return okPlan({ found: false });
    }

    if (plan.planningDepth !== 'advanced' || plan.status !== 'approved' || !plan.advancedSnapshot) {
        return errPlan('invalid_state', 'Phase expansion is only available on approved advanced plans.');
    }

    const nextExpandablePhaseOutlineId = await planPhaseStore.getNextExpandablePhaseOutlineId({
        planId: plan.id,
        planRevisionId: plan.currentRevisionId,
        planVariantId: plan.currentVariantId,
        advancedSnapshot: plan.advancedSnapshot,
    });
    if (!nextExpandablePhaseOutlineId) {
        return errPlan('invalid_state', 'No expandable roadmap phase is available for this plan.');
    }

    const phaseOutline = requirePhaseOutline({
        plan,
        phaseOutlineId: nextExpandablePhaseOutlineId,
    });
    if (!phaseOutline) {
        return errPlan('invalid_state', 'Unable to resolve the next roadmap phase outline.');
    }

    const planItems = await planStore.listItems(plan.id);
    const evidenceAttachments = await planStore.listEvidenceAttachments(plan.currentRevisionId);
    const scaffold = buildPhaseExpansionScaffold({
        plan,
        advancedSnapshot: plan.advancedSnapshot,
        phaseOutline,
        planItems,
        evidenceAttachments,
    });

    const createdPhase = await planPhaseStore.createPhase({
        planId: plan.id,
        planRevisionId: plan.approvedRevisionId ?? plan.currentRevisionId,
        planVariantId: plan.approvedVariantId ?? plan.currentVariantId,
        phaseOutline,
        summaryMarkdown: scaffold.summaryMarkdown,
        itemDescriptions: scaffold.itemDescriptions,
    });
    if (!createdPhase) {
        return errPlan('revision_conflict', 'Unable to expand the next phase for this plan.');
    }

    await appendPlanPhaseExpandedEvent({
        profileId: input.profileId,
        planId: plan.id,
        phaseId: createdPhase.id as EntityId<'pph'>,
        phaseRevisionId: createdPhase.currentRevisionId as EntityId<'pprv'>,
        phaseOutlineId: createdPhase.phaseOutlineId,
        phaseSequence: createdPhase.phaseSequence,
        phaseTitle: createdPhase.title,
        revisionNumber: createdPhase.currentRevisionNumber,
        variantId: plan.currentVariantId,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the expanded phase state.');
    }

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.expandNextPhase'),
    });
}

export async function revisePhase(
    input: PlanRevisePhaseInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const plan = await planStore.getById(input.profileId, input.planId);
    if (!plan) {
        return okPlan({ found: false });
    }

    const phase = await planPhaseStore.getById(input.phaseId);
    if (!phase || phase.planId !== input.planId || phase.currentRevisionId !== input.phaseRevisionId) {
        return errPlan('revision_conflict', 'Cannot revise a phase that does not belong to this plan revision.');
    }
    if (phase.status === 'implementing' || phase.status === 'implemented' || phase.status === 'cancelled') {
        return errPlan('invalid_state', 'Cannot revise a terminal or running detailed phase.');
    }

    const revised = await planPhaseStore.revisePhase({
        planId: input.planId,
        planPhaseId: input.phaseId,
        phaseRevisionId: input.phaseRevisionId,
        summaryMarkdown: input.summaryMarkdown,
        itemDescriptions: input.items.map((item) => item.description.trim()).filter((description) => description.length > 0),
    });
    if (!revised) {
        return errPlan('revision_conflict', 'Unable to persist the requested phase revision.');
    }

    await appendPlanPhaseRevisedEvent({
        profileId: input.profileId,
        planId: input.planId,
        phaseId: revised.id as EntityId<'pph'>,
        phaseRevisionId: revised.currentRevisionId as EntityId<'pprv'>,
        phaseOutlineId: revised.phaseOutlineId,
        phaseSequence: revised.phaseSequence,
        phaseTitle: revised.title,
        revisionNumber: revised.currentRevisionNumber,
        variantId: plan.currentVariantId,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the revised phase state.');
    }

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.revisePhase'),
    });
}

export async function approvePhase(
    input: PlanApprovePhaseInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const plan = await planStore.getById(input.profileId, input.planId);
    if (!plan) {
        return okPlan({ found: false });
    }

    const phase = await planPhaseStore.getById(input.phaseId);
    if (!phase || phase.planId !== input.planId || phase.currentRevisionId !== input.phaseRevisionId) {
        return errPlan('revision_conflict', 'Cannot approve a phase that does not belong to this plan revision.');
    }
    if (phase.status === 'implemented' || phase.status === 'cancelled') {
        return errPlan('invalid_state', 'Cannot approve a terminal detailed phase.');
    }

    const approved = await planPhaseStore.approvePhase({
        planId: input.planId,
        planPhaseId: input.phaseId,
        phaseRevisionId: input.phaseRevisionId,
    });
    if (!approved) {
        return errPlan('revision_conflict', 'Unable to approve the requested detailed phase revision.');
    }

    await appendPlanPhaseApprovedEvent({
        profileId: input.profileId,
        planId: input.planId,
        phaseId: approved.id as EntityId<'pph'>,
        phaseRevisionId: approved.currentRevisionId as EntityId<'pprv'>,
        phaseOutlineId: approved.phaseOutlineId,
        phaseSequence: approved.phaseSequence,
        phaseTitle: approved.title,
        revisionNumber: approved.currentRevisionNumber,
        variantId: plan.currentVariantId,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the approved phase state.');
    }

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.approvePhase'),
    });
}

export async function implementPhase(
    input: PlanImplementPhaseInput
): Promise<
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
    if (plan.planningDepth !== 'advanced' || plan.status !== 'approved') {
        return errPlan('invalid_state', 'Detailed phase implementation is only available on approved advanced plans.');
    }

    const phase = await planPhaseStore.getById(input.phaseId);
    if (!phase || phase.planId !== input.planId || phase.currentRevisionId !== input.phaseRevisionId) {
        return errPlan('revision_conflict', 'Cannot implement a phase that does not belong to this plan revision.');
    }
    if (phase.status !== 'approved') {
        return errPlan('invalid_state', 'The detailed phase must be approved before implementation can start.');
    }

    const outline = requirePhaseOutline({
        plan,
        phaseOutlineId: phase.phaseOutlineId,
    });
    if (!outline) {
        return errPlan('invalid_state', 'Unable to resolve the detailed phase outline.');
    }

    const prompt = buildPhaseImplementationPrompt({
        title: phase.title,
        summaryMarkdown: phase.summaryMarkdown,
        itemDescriptions: phase.items.map((item) => item.description),
        goalMarkdown: outline.goalMarkdown,
        exitCriteriaMarkdown: outline.exitCriteriaMarkdown,
    });

    if (plan.topLevelTab === 'agent') {
        const result = await runExecutionService.startRun({
            profileId: input.profileId,
            sessionId: plan.sessionId,
            planId: plan.id,
            planRevisionId: plan.approvedRevisionId ?? plan.currentRevisionId,
            planPhaseId: phase.id as EntityId<'pph'>,
            planPhaseRevisionId: phase.currentRevisionId as EntityId<'pprv'>,
            prompt,
            topLevelTab: 'agent',
            modeKey: 'code',
            runtimeOptions: input.runtimeOptions,
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.modelId ? { modelId: input.modelId } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });

        if (!result.accepted) {
            return errPlan('run_start_failed', `Detailed phase implementation failed to start: ${result.reason}.`);
        }

        const implementing = await planPhaseStore.markPhaseImplementing({
            planId: input.planId,
            planPhaseId: phase.id,
            phaseRevisionId: phase.currentRevisionId,
            implementationRunId: result.runId,
        });
        if (!implementing) {
            return errPlan(
                'run_start_failed',
                'Detailed phase implementation started, but the phase artifact could not be updated.'
            );
        }

        await appendPlanPhaseImplementationStartedEvent({
            profileId: input.profileId,
            planId: input.planId,
            phaseId: implementing.id as EntityId<'pph'>,
            phaseRevisionId: implementing.currentRevisionId as EntityId<'pprv'>,
            phaseOutlineId: implementing.phaseOutlineId,
            phaseSequence: implementing.phaseSequence,
            phaseTitle: implementing.title,
            revisionNumber: implementing.currentRevisionNumber,
            mode: 'agent.code',
            runId: result.runId,
            variantId: plan.currentVariantId,
        });

        const projection = await planStore.getProjectionById(input.profileId, input.planId);
        if (!projection) {
            return errPlan('revision_conflict', 'Unable to read the started detailed phase state.');
        }

        return okPlan({
            found: true,
            started: true,
            mode: 'agent.code',
            runId: result.runId,
            plan: requirePlanView(projection, 'plan.implementPhase.agent'),
        });
    }

    const orchestratorStartResult = await orchestratorExecutionService.start({
        profileId: input.profileId,
        planId: input.planId,
        runtimeOptions: input.runtimeOptions,
        executionStrategy: input.executionStrategy ?? 'delegate',
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        approvedArtifact: buildPhaseApprovedArtifact({
            planId: plan.id,
            sessionId: plan.sessionId,
            topLevelTab: plan.topLevelTab,
            revisionId: plan.approvedRevisionId ?? plan.currentRevisionId,
            revisionNumber: plan.approvedRevisionNumber ?? plan.currentRevisionNumber,
            summaryMarkdown: phase.summaryMarkdown,
            itemDescriptions: phase.items.map((item) => item.description),
        }),
    });
    if (orchestratorStartResult.isErr()) {
        return errPlan('run_start_failed', `Detailed phase implementation failed to start: ${orchestratorStartResult.error.message}`);
    }

    const implementing = await planPhaseStore.markPhaseImplementing({
        planId: input.planId,
        planPhaseId: phase.id,
        phaseRevisionId: phase.currentRevisionId,
        orchestratorRunId: orchestratorStartResult.value.run.id,
    });
    if (!implementing) {
        return errPlan(
            'run_start_failed',
            'Detailed phase implementation started, but the phase artifact could not be updated.'
        );
    }

    await appendPlanPhaseImplementationStartedEvent({
        profileId: input.profileId,
        planId: input.planId,
        phaseId: implementing.id as EntityId<'pph'>,
        phaseRevisionId: implementing.currentRevisionId as EntityId<'pprv'>,
        phaseOutlineId: implementing.phaseOutlineId,
        phaseSequence: implementing.phaseSequence,
        phaseTitle: implementing.title,
        revisionNumber: implementing.currentRevisionNumber,
        mode: 'orchestrator.orchestrate',
        orchestratorRunId: orchestratorStartResult.value.run.id,
        variantId: plan.currentVariantId,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the started detailed phase state.');
    }

    return okPlan({
        found: true,
        started: true,
        mode: 'orchestrator.orchestrate',
        orchestratorRunId: orchestratorStartResult.value.run.id,
        plan: requirePlanView(projection, 'plan.implementPhase.orchestrator'),
    });
}

export async function cancelPhase(
    input: PlanCancelPhaseInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const plan = await planStore.getById(input.profileId, input.planId);
    if (!plan) {
        return okPlan({ found: false });
    }

    const phase = await planPhaseStore.getById(input.phaseId);
    if (!phase || phase.planId !== input.planId) {
        return errPlan('revision_conflict', 'Cannot cancel a phase that does not belong to this plan.');
    }

    if (phase.status === 'implementing') {
        if (phase.implementationRunId) {
            await runExecutionService.abortRun(input.profileId, plan.sessionId);
        } else if (phase.orchestratorRunId) {
            await orchestratorExecutionService.abort(input.profileId, phase.orchestratorRunId);
        }
    }

    const cancelled = await planPhaseStore.cancelPhase({
        planId: input.planId,
        planPhaseId: input.phaseId,
        phaseRevisionId: phase.currentRevisionId,
    });
    if (!cancelled) {
        return errPlan('revision_conflict', 'Unable to cancel the requested phase.');
    }

    const previousStatus: 'draft' | 'approved' | 'implementing' =
        phase.status === 'draft' || phase.status === 'approved' || phase.status === 'implementing'
            ? phase.status
            : 'draft';
    await appendPlanPhaseCancelledEvent({
        profileId: input.profileId,
        planId: input.planId,
        phaseId: cancelled.id as EntityId<'pph'>,
        phaseRevisionId: cancelled.currentRevisionId as EntityId<'pprv'>,
        phaseOutlineId: cancelled.phaseOutlineId,
        phaseSequence: cancelled.phaseSequence,
        phaseTitle: cancelled.title,
        revisionNumber: cancelled.currentRevisionNumber,
        previousStatus,
        variantId: plan.currentVariantId,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    if (!projection) {
        return errPlan('revision_conflict', 'Unable to read the cancelled phase state.');
    }

    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.cancelPhase'),
    });
}

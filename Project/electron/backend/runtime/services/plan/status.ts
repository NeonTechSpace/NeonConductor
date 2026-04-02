import { orchestratorStore, planPhaseStore, planStore, runStore } from '@/app/backend/persistence/stores';
import type { EntityId, PlanRecordView } from '@/app/backend/runtime/contracts';
import { appendPlanPhaseImplementationCompletedEvent, appendPlanPhaseImplementationFailedEvent } from '@/app/backend/runtime/services/plan/events';
import { toPlanView } from '@/app/backend/runtime/services/plan/views';

export async function refreshPlanViewById(input: {
    profileId: string;
    planId: EntityId<'plan'>;
}): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
    const plan = await planStore.getById(input.profileId, input.planId);
    if (!plan) {
        return { found: false };
    }

    if (plan.status === 'implementing' && plan.implementationRunId) {
        const run = await runStore.getById(plan.implementationRunId);
        if (run?.status === 'completed') {
            await planStore.markImplemented(plan.id);
        } else if (run?.status === 'aborted' || run?.status === 'error') {
            await planStore.markFailed(plan.id);
        }
    } else if (plan.status === 'implementing' && plan.orchestratorRunId) {
        const orchestratorRun = await orchestratorStore.getRunById(input.profileId, plan.orchestratorRunId);
        if (orchestratorRun?.status === 'completed') {
            await planStore.markImplemented(plan.id);
        } else if (orchestratorRun?.status === 'aborted' || orchestratorRun?.status === 'failed') {
            await planStore.markFailed(plan.id);
        }
    }

    const phaseProjection = await planPhaseStore.listProjectionData(plan.id);
    const implementingPhase = phaseProjection.phases.find((phase) => phase.status === 'implementing');
    if (implementingPhase) {
        if (implementingPhase.implementationRunId) {
            const run = await runStore.getById(implementingPhase.implementationRunId);
            if (run?.status === 'completed') {
                const completedPhase = await planPhaseStore.markPhaseImplemented({
                    planId: plan.id,
                    planPhaseId: implementingPhase.id,
                    phaseRevisionId: implementingPhase.currentRevisionId,
                });
                if (completedPhase) {
                    const refreshedPhase = await planPhaseStore.getById(implementingPhase.id);
                    if (refreshedPhase) {
                        await appendPlanPhaseImplementationCompletedEvent({
                            profileId: input.profileId,
                            planId: plan.id,
                            phaseId: refreshedPhase.id as EntityId<'pph'>,
                            phaseRevisionId: refreshedPhase.currentRevisionId as EntityId<'pprv'>,
                            phaseOutlineId: refreshedPhase.phaseOutlineId,
                            phaseSequence: refreshedPhase.phaseSequence,
                            phaseTitle: refreshedPhase.title,
                            revisionNumber: refreshedPhase.currentRevisionNumber,
                            ...(plan.approvedVariantId ? { variantId: plan.approvedVariantId } : {}),
                        });
                    }
                }
            } else if (run?.status === 'aborted' || run?.status === 'error') {
                const failedPhase = await planPhaseStore.markPhaseFailed({
                    planId: plan.id,
                    planPhaseId: implementingPhase.id,
                    phaseRevisionId: implementingPhase.currentRevisionId,
                });
                if (failedPhase) {
                    const refreshedPhase = await planPhaseStore.getById(implementingPhase.id);
                    if (refreshedPhase) {
                        await appendPlanPhaseImplementationFailedEvent({
                            profileId: input.profileId,
                            planId: plan.id,
                            phaseId: refreshedPhase.id as EntityId<'pph'>,
                            phaseRevisionId: refreshedPhase.currentRevisionId as EntityId<'pprv'>,
                            phaseOutlineId: refreshedPhase.phaseOutlineId,
                            phaseSequence: refreshedPhase.phaseSequence,
                            phaseTitle: refreshedPhase.title,
                            revisionNumber: refreshedPhase.currentRevisionNumber,
                            errorMessage:
                                run?.status === 'aborted'
                                    ? 'Phase implementation run was aborted before completion.'
                                    : 'Phase implementation run ended with error.',
                            ...(plan.approvedVariantId ? { variantId: plan.approvedVariantId } : {}),
                        });
                    }
                }
            }
        } else if (implementingPhase.orchestratorRunId) {
            const orchestratorRun = await orchestratorStore.getRunById(input.profileId, implementingPhase.orchestratorRunId);
            if (orchestratorRun?.status === 'completed') {
                const completedPhase = await planPhaseStore.markPhaseImplemented({
                    planId: plan.id,
                    planPhaseId: implementingPhase.id,
                    phaseRevisionId: implementingPhase.currentRevisionId,
                });
                if (completedPhase) {
                    const refreshedPhase = await planPhaseStore.getById(implementingPhase.id);
                    if (refreshedPhase) {
                        await appendPlanPhaseImplementationCompletedEvent({
                            profileId: input.profileId,
                            planId: plan.id,
                            phaseId: refreshedPhase.id as EntityId<'pph'>,
                            phaseRevisionId: refreshedPhase.currentRevisionId as EntityId<'pprv'>,
                            phaseOutlineId: refreshedPhase.phaseOutlineId,
                            phaseSequence: refreshedPhase.phaseSequence,
                            phaseTitle: refreshedPhase.title,
                            revisionNumber: refreshedPhase.currentRevisionNumber,
                            mode: 'orchestrator.orchestrate',
                            ...(plan.approvedVariantId ? { variantId: plan.approvedVariantId } : {}),
                        });
                    }
                }
            } else if (orchestratorRun?.status === 'aborted' || orchestratorRun?.status === 'failed') {
                const failedPhase = await planPhaseStore.markPhaseFailed({
                    planId: plan.id,
                    planPhaseId: implementingPhase.id,
                    phaseRevisionId: implementingPhase.currentRevisionId,
                });
                if (failedPhase) {
                    const refreshedPhase = await planPhaseStore.getById(implementingPhase.id);
                    if (refreshedPhase) {
                        await appendPlanPhaseImplementationFailedEvent({
                            profileId: input.profileId,
                            planId: plan.id,
                            phaseId: refreshedPhase.id as EntityId<'pph'>,
                            phaseRevisionId: refreshedPhase.currentRevisionId as EntityId<'pprv'>,
                            phaseOutlineId: refreshedPhase.phaseOutlineId,
                            phaseSequence: refreshedPhase.phaseSequence,
                            phaseTitle: refreshedPhase.title,
                            revisionNumber: refreshedPhase.currentRevisionNumber,
                            mode: 'orchestrator.orchestrate',
                            errorMessage:
                                orchestratorRun?.status === 'aborted'
                                    ? 'Phase implementation run was aborted before completion.'
                                    : 'Phase implementation run ended with error.',
                            ...(plan.approvedVariantId ? { variantId: plan.approvedVariantId } : {}),
                        });
                    }
                }
            }
        }
    }

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    const view = toPlanView(projection);
    if (!view) {
        return { found: false };
    }

    return {
        found: true,
        plan: view,
    };
}

export async function refreshActivePlanView(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
}): Promise<{ found: false } | { found: true; plan: PlanRecordView }> {
    const plan = await planStore.getLatestBySession(input.profileId, input.sessionId, input.topLevelTab);
    if (!plan) {
        return { found: false };
    }

    return refreshPlanViewById({
        profileId: input.profileId,
        planId: plan.id,
    });
}

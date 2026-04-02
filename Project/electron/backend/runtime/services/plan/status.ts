import { orchestratorStore, planStore, runStore } from '@/app/backend/persistence/stores';
import type { EntityId, PlanRecordView } from '@/app/backend/runtime/contracts';
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

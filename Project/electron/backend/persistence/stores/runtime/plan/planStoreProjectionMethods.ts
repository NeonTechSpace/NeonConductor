import {
    buildPlanHistoryEntries,
    buildPlanViewProjection,
    buildRecoveryBanner,
    mapPlanItemRecord,
} from '@/app/backend/persistence/stores/runtime/plan/planStoreInternals';
import { planPhaseStore } from '@/app/backend/persistence/stores/runtime/planPhaseStore';
import { planPhaseVerificationStore } from '@/app/backend/persistence/stores/runtime/planPhaseVerificationStore';
import type { PlanStore } from '@/app/backend/persistence/stores/runtime/planStore';
import { runtimeEventStore } from '@/app/backend/persistence/stores/runtime/runtimeEventStore';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { PlanItemRecord, PlanRecord, PlanViewProjection } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';

export async function getProjectionById(
    this: PlanStore,
    profileId: string,
    planId: EntityId<'plan'>
): Promise<PlanViewProjection | null> {
    const db = this.getDb();
    const plan = await this.getById(profileId, planId);
    if (!plan) {
        return null;
    }

    const [items, revisions, variants, followUps, phaseProjection, researchBatches, evidenceAttachments, events] =
        await Promise.all([
            this.listItems(planId),
            this.listRevisions(planId),
            this.listVariants(planId),
            this.listFollowUps(planId),
            planPhaseStore.listProjectionData(planId),
            this.listResearchBatchesInDb(db, planId),
            this.listEvidenceAttachmentsInDb(db, plan.currentRevisionId),
            runtimeEventStore.listByEntity({
                entityType: 'plan',
                entityId: planId,
                limit: 1000,
            }),
        ]);

    const researchWorkers = researchBatches.length
        ? await this.listResearchWorkersInDb(
              db,
              researchBatches.map((batch) => batch.id)
          )
        : [];
    const verificationProjection = phaseProjection.phases.length
        ? await planPhaseVerificationStore.listProjectionData(planId)
        : { phaseVerifications: [], phaseVerificationDiscrepancies: [] };

    const history = buildPlanHistoryEntries({
        plan,
        variants,
        followUps,
        events,
    });

    const recoveryBanner = buildRecoveryBanner({
        plan,
        variants,
        followUps,
    });

    return buildPlanViewProjection({
        plan,
        items,
        revisions,
        variants,
        followUps,
        phases: phaseProjection.phases,
        phaseRevisions: phaseProjection.phaseRevisions,
        phaseRevisionItems: phaseProjection.phaseRevisionItems,
        phaseVerifications: verificationProjection.phaseVerifications,
        phaseVerificationDiscrepancies: verificationProjection.phaseVerificationDiscrepancies,
        researchBatches,
        researchWorkers,
        evidenceAttachments,
        history,
        ...(recoveryBanner ? { recoveryBanner } : {}),
    });
}

export async function resetItemsForFreshImplementation(
    this: PlanStore,
    planId: EntityId<'plan'>
): Promise<PlanItemRecord[]> {
    const now = nowIso();

    await this.getDb()
        .updateTable('plan_items')
        .set({
            status: 'pending',
            run_id: null,
            error_message: null,
            updated_at: now,
        })
        .where('plan_id', '=', planId)
        .execute();

    return this.listItems(planId);
}

export async function markImplementing(
    this: PlanStore,
    planId: EntityId<'plan'>,
    implementationRunId?: EntityId<'run'>,
    orchestratorRunId?: EntityId<'orch'>
): Promise<PlanRecord | null> {
    const db = this.getDb();
    const now = nowIso();
    const updated = await db
        .updateTable('plan_records')
        .set({
            status: 'implementing',
            implementation_run_id: implementationRunId ?? null,
            orchestrator_run_id: orchestratorRunId ?? null,
            updated_at: now,
        })
        .where('id', '=', planId)
        .returningAll()
        .executeTakeFirst();

    return updated ? this.hydratePlanRecord(db, updated) : null;
}

export async function markImplemented(this: PlanStore, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
    const db = this.getDb();
    const now = nowIso();
    const updated = await db
        .updateTable('plan_records')
        .set({
            status: 'implemented',
            implemented_at: now,
            updated_at: now,
        })
        .where('id', '=', planId)
        .returningAll()
        .executeTakeFirst();

    return updated ? this.hydratePlanRecord(db, updated) : null;
}

export async function markFailed(this: PlanStore, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
    const db = this.getDb();
    const now = nowIso();
    const updated = await db
        .updateTable('plan_records')
        .set({
            status: 'failed',
            updated_at: now,
        })
        .where('id', '=', planId)
        .returningAll()
        .executeTakeFirst();

    return updated ? this.hydratePlanRecord(db, updated) : null;
}

export async function setItemStatus(
    this: PlanStore,
    itemId: EntityId<'step'>,
    status: PlanItemRecord['status'],
    runId?: EntityId<'run'>,
    errorMessage?: string
): Promise<PlanItemRecord | null> {
    const now = nowIso();
    const updated = await this.getDb()
        .updateTable('plan_items')
        .set({
            status,
            run_id: runId ?? null,
            error_message: errorMessage ?? null,
            updated_at: now,
        })
        .where('id', '=', itemId)
        .returningAll()
        .executeTakeFirst();

    return updated ? mapPlanItemRecord(updated) : null;
}

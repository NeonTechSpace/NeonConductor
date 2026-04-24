import { mapPlanAdvancedSnapshotRecord } from '@/app/backend/persistence/stores/runtime/plan/planStoreInternals';
import type { PlanStore } from '@/app/backend/persistence/stores/runtime/planStore';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { PlanRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

export async function createVariant(
    this: PlanStore,
    planId: EntityId<'plan'>,
    sourceRevisionId: EntityId<'prev'>
): Promise<PlanRecord | null> {
    const db = this.getDb();
    const createdPlanId = await db.transaction().execute(async (transaction) => {
        const existing = await this.getPlanRecordRowById(transaction, planId);
        if (!existing) {
            return null;
        }

        const sourceRevision = await this.getPlanRevisionRowById(transaction, sourceRevisionId);
        if (!sourceRevision || sourceRevision.plan_id !== planId) {
            return null;
        }
        const sourceRevisionAdvancedSnapshot = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
            transaction,
            sourceRevisionId
        );

        const sourceRevisionItems = await this.listRevisionItemsInDb(transaction, sourceRevisionId);
        const variantRows = await transaction
            .selectFrom('plan_variants')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('created_at', 'asc')
            .execute();
        const variantName = `variant-${String(variantRows.length + 1)}`;
        const variantId = createEntityId('pvar');
        const now = nowIso();
        const latestRevision = await this.getLatestRevisionRowForPlan(transaction, planId);
        const nextRevisionNumber = (latestRevision?.revision_number ?? 0) + 1;
        const nextRevisionId = createEntityId('prev');

        await transaction
            .insertInto('plan_variants')
            .values({
                id: variantId,
                plan_id: planId,
                name: variantName,
                created_from_revision_id: sourceRevisionId,
                created_at: now,
                archived_at: null,
            })
            .execute();

        await this.insertRevisionInTransaction(transaction, {
            planId,
            variantId,
            revisionId: nextRevisionId,
            revisionNumber: nextRevisionNumber,
            summaryMarkdown: sourceRevision.summary_markdown,
            createdByKind: 'revise',
            previousRevisionId: sourceRevisionId,
            itemDescriptions: sourceRevisionItems.map((item) => item.description),
            timestamp: now,
            copyResearchAttachmentsFromRevisionId: sourceRevisionId,
            ...(sourceRevisionAdvancedSnapshot
                ? { advancedSnapshot: mapPlanAdvancedSnapshotRecord(sourceRevisionAdvancedSnapshot) }
                : {}),
        });

        await transaction
            .updateTable('plan_records')
            .set({
                current_revision_id: nextRevisionId,
                current_variant_id: variantId,
                summary_markdown: sourceRevision.summary_markdown,
                status: 'draft',
                updated_at: now,
            })
            .where('id', '=', planId)
            .execute();

        await this.replaceLiveItemsInTransaction(
            transaction,
            planId,
            sourceRevisionItems.map((item) => item.description),
            now
        );

        return planId;
    });

    if (!createdPlanId) {
        return null;
    }

    return this.getByIdFromDb(db, createdPlanId);
}

export async function activateVariant(
    this: PlanStore,
    planId: EntityId<'plan'>,
    variantId: EntityId<'pvar'>
): Promise<PlanRecord | null> {
    const db = this.getDb();
    const activatedPlanId = await db.transaction().execute(async (transaction) => {
        const existing = await this.getPlanRecordRowById(transaction, planId);
        if (!existing) {
            return null;
        }

        const variantRow = await this.getPlanVariantRowById(transaction, variantId);
        if (!variantRow || variantRow.plan_id !== planId) {
            return null;
        }

        const headRevision = await this.getVariantHeadRevisionRow(transaction, planId, variantId);
        if (!headRevision) {
            return null;
        }
        const headRevisionItems = await this.listRevisionItemsInDb(
            transaction,
            parseEntityId(headRevision.id, 'plan_revisions.id', 'prev')
        );

        const now = nowIso();
        const nextStatus =
            existing.approved_revision_id &&
            existing.approved_variant_id === variantId &&
            existing.approved_revision_id === headRevision.id
                ? 'approved'
                : 'draft';

        await transaction
            .updateTable('plan_records')
            .set({
                current_revision_id: headRevision.id,
                current_variant_id: variantId,
                summary_markdown: headRevision.summary_markdown,
                status: nextStatus,
                updated_at: now,
            })
            .where('id', '=', planId)
            .execute();

        await this.replaceLiveItemsInTransaction(
            transaction,
            planId,
            headRevisionItems.map((item) => item.description),
            now
        );

        return planId;
    });

    if (!activatedPlanId) {
        return null;
    }

    return this.getByIdFromDb(db, activatedPlanId);
}

export async function resumeFromRevision(
    this: PlanStore,
    planId: EntityId<'plan'>,
    sourceRevisionId: EntityId<'prev'>,
    variantId?: EntityId<'pvar'>
): Promise<PlanRecord | null> {
    const db = this.getDb();
    const resumedPlanId = await db.transaction().execute(async (transaction) => {
        const existing = await this.getPlanRecordRowById(transaction, planId);
        if (!existing) {
            return null;
        }

        const sourceRevision = await this.getPlanRevisionRowById(transaction, sourceRevisionId);
        if (!sourceRevision || sourceRevision.plan_id !== planId) {
            return null;
        }
        const sourceRevisionAdvancedSnapshot = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
            transaction,
            sourceRevisionId
        );

        const targetVariantId =
            variantId ?? parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar');
        const targetVariant = await this.getPlanVariantRowById(transaction, targetVariantId);
        if (!targetVariant || targetVariant.plan_id !== planId) {
            return null;
        }

        const sourceRevisionItems = await this.listRevisionItemsInDb(transaction, sourceRevisionId);
        const latestRevision = await this.getLatestRevisionRowForPlan(transaction, planId);
        const nextRevisionNumber = (latestRevision?.revision_number ?? 0) + 1;
        const nextRevisionId = createEntityId('prev');
        const now = nowIso();
        const targetVariantHead = await this.getVariantHeadRevisionRow(transaction, planId, targetVariantId);
        if (!targetVariantHead) {
            return null;
        }

        await transaction
            .updateTable('plan_revisions')
            .set({
                superseded_at: now,
            })
            .where('id', '=', targetVariantHead.id)
            .where('superseded_at', 'is', null)
            .execute();

        await this.insertRevisionInTransaction(transaction, {
            planId,
            variantId: targetVariantId,
            revisionId: nextRevisionId,
            revisionNumber: nextRevisionNumber,
            summaryMarkdown: sourceRevision.summary_markdown,
            createdByKind: 'revise',
            previousRevisionId: parseEntityId(targetVariantHead.id, 'plan_revisions.id', 'prev'),
            itemDescriptions: sourceRevisionItems.map((item) => item.description),
            timestamp: now,
            copyResearchAttachmentsFromRevisionId: sourceRevisionId,
            ...(sourceRevisionAdvancedSnapshot
                ? { advancedSnapshot: mapPlanAdvancedSnapshotRecord(sourceRevisionAdvancedSnapshot) }
                : {}),
        });

        await transaction
            .updateTable('plan_records')
            .set({
                current_revision_id: nextRevisionId,
                current_variant_id: targetVariantId,
                summary_markdown: sourceRevision.summary_markdown,
                status: 'draft',
                updated_at: now,
            })
            .where('id', '=', planId)
            .execute();

        await this.replaceLiveItemsInTransaction(
            transaction,
            planId,
            sourceRevisionItems.map((item) => item.description),
            now
        );

        return planId;
    });

    if (!resumedPlanId) {
        return null;
    }

    return this.getByIdFromDb(db, resumedPlanId);
}

export async function raiseFollowUp(
    this: PlanStore,
    input: {
        planId: EntityId<'plan'>;
        kind: 'missing_context' | 'missing_file';
        promptMarkdown: string;
        sourceRevisionId?: EntityId<'prev'>;
    }
): Promise<PlanRecord | null> {
    const db = this.getDb();
    const raisedPlanId = await db.transaction().execute(async (transaction) => {
        const existing = await this.getPlanRecordRowById(transaction, input.planId);
        if (!existing) {
            return null;
        }

        const variantId = parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar');
        const sourceRevisionId =
            input.sourceRevisionId ??
            parseEntityId(existing.current_revision_id, 'plan_records.current_revision_id', 'prev');
        const now = nowIso();

        await transaction
            .insertInto('plan_follow_ups')
            .values({
                id: createEntityId('pfu'),
                plan_id: input.planId,
                variant_id: variantId,
                source_revision_id: sourceRevisionId,
                kind: input.kind,
                status: 'open',
                prompt_markdown: input.promptMarkdown,
                response_markdown: null,
                created_by_kind: 'user',
                created_at: now,
                resolved_at: null,
                dismissed_at: null,
            })
            .execute();

        await transaction
            .updateTable('plan_records')
            .set({
                updated_at: now,
            })
            .where('id', '=', input.planId)
            .execute();

        return input.planId;
    });

    if (!raisedPlanId) {
        return null;
    }

    return this.getByIdFromDb(db, raisedPlanId);
}

export async function resolveFollowUp(
    this: PlanStore,
    input: {
        planId: EntityId<'plan'>;
        followUpId: EntityId<'pfu'>;
        status: 'resolved' | 'dismissed';
        responseMarkdown?: string;
    }
): Promise<PlanRecord | null> {
    const db = this.getDb();
    const resolvedPlanId = await db.transaction().execute(async (transaction) => {
        const existing = await this.getPlanRecordRowById(transaction, input.planId);
        if (!existing) {
            return null;
        }

        const followUpRow = await this.getPlanFollowUpRowById(transaction, input.followUpId);
        if (!followUpRow || followUpRow.plan_id !== input.planId || followUpRow.status !== 'open') {
            return null;
        }

        const now = nowIso();
        await transaction
            .updateTable('plan_follow_ups')
            .set({
                status: input.status,
                response_markdown: input.responseMarkdown ?? null,
                resolved_at: input.status === 'resolved' ? now : null,
                dismissed_at: input.status === 'dismissed' ? now : null,
            })
            .where('id', '=', input.followUpId)
            .execute();

        await transaction
            .updateTable('plan_records')
            .set({
                updated_at: now,
            })
            .where('id', '=', input.planId)
            .execute();

        return input.planId;
    });

    if (!resolvedPlanId) {
        return null;
    }

    return this.getByIdFromDb(db, resolvedPlanId);
}

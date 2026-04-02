import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    PlanPhaseRecord,
    PlanPhaseRevisionItemRecord,
    PlanPhaseRevisionRecord,
} from '@/app/backend/persistence/types';
import type {
    PlanAdvancedSnapshotView,
    PlanPhaseOutlineInput,
    PlanPhaseRevisionItemView,
    PlanPhaseStatus,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

import type { Kysely, Transaction } from 'kysely';

type PlanPhaseStoreDb = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

type PlanRow = {
    id: string;
    current_revision_id: string;
    current_variant_id: string;
    status: string;
};

type PlanPhaseRow = {
    id: string;
    plan_id: string;
    plan_revision_id: string;
    plan_variant_id: string;
    phase_outline_id: string;
    phase_sequence: number;
    title: string;
    goal_markdown: string;
    exit_criteria_markdown: string;
    status: string;
    current_revision_id: string;
    approved_revision_id: string | null;
    implementation_run_id: string | null;
    orchestrator_run_id: string | null;
    created_at: string;
    updated_at: string;
    approved_at: string | null;
    implemented_at: string | null;
};

type PlanPhaseRevisionRow = {
    id: string;
    plan_phase_id: string;
    revision_number: number;
    summary_markdown: string;
    created_by_kind: string;
    created_at: string;
    previous_revision_id: string | null;
    superseded_at: string | null;
};

type PlanPhaseRevisionItemRow = {
    id: string;
    plan_phase_revision_id: string;
    sequence: number;
    description: string;
    created_at: string;
};

function parsePlanPhaseStatus(value: string): PlanPhaseStatus {
    return parseEnumValue(value, 'plan_phases.status', [
        'not_started',
        'draft',
        'approved',
        'implementing',
        'implemented',
        'cancelled',
    ]);
}

function isPhaseOpen(status: PlanPhaseStatus): boolean {
    return status === 'draft' || status === 'approved' || status === 'implementing';
}

function toPhaseItemView(record: PlanPhaseRevisionItemRecord): PlanPhaseRevisionItemView {
    return {
        id: record.id,
        sequence: record.sequence,
        description: record.description,
        status: 'pending',
        createdAt: record.createdAt,
    };
}

function mapPhaseRevisionItem(row: PlanPhaseRevisionItemRow): PlanPhaseRevisionItemRecord {
    return {
        id: parseEntityId(row.id, 'plan_phase_revision_items.id', 'ppi'),
        planPhaseRevisionId: parseEntityId(
            row.plan_phase_revision_id,
            'plan_phase_revision_items.plan_phase_revision_id',
            'pprv'
        ),
        sequence: row.sequence,
        description: row.description,
        createdAt: row.created_at,
    };
}

function mapPhaseRevision(row: PlanPhaseRevisionRow, items: PlanPhaseRevisionItemRecord[]): PlanPhaseRevisionRecord {
    return {
        id: parseEntityId(row.id, 'plan_phase_revisions.id', 'pprv'),
        planPhaseId: parseEntityId(row.plan_phase_id, 'plan_phase_revisions.plan_phase_id', 'pph'),
        revisionNumber: row.revision_number,
        summaryMarkdown: row.summary_markdown,
        createdByKind: row.created_by_kind === 'expand' ? 'expand' : 'revise',
        createdAt: row.created_at,
        ...(row.previous_revision_id
            ? {
                  previousRevisionId: parseEntityId(
                      row.previous_revision_id,
                      'plan_phase_revisions.previous_revision_id',
                      'pprv'
                  ),
              }
            : {}),
        ...(row.superseded_at ? { supersededAt: row.superseded_at } : {}),
        ...(items.length > 0 ? { items } : {}),
    };
}

function phaseRevisionRowsByPhaseId(rows: PlanPhaseRevisionRecord[]): Map<string, PlanPhaseRevisionRecord[]> {
    const revisionsByPhaseId = new Map<string, PlanPhaseRevisionRecord[]>();
    for (const revision of rows) {
        const revisions = revisionsByPhaseId.get(revision.planPhaseId) ?? [];
        revisions.push(revision);
        revisionsByPhaseId.set(revision.planPhaseId, revisions);
    }

    for (const revisions of revisionsByPhaseId.values()) {
        revisions.sort((left, right) => left.revisionNumber - right.revisionNumber);
    }

    return revisionsByPhaseId;
}

function normalizePhaseOutlines(snapshot: PlanAdvancedSnapshotView | undefined): PlanPhaseOutlineInput[] {
    return snapshot?.phases ?? [];
}

function isPlanApproved(plan: PlanRow): boolean {
    return plan.status === 'approved';
}

export class PlanPhaseStore {
    private getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    private async getPlanRowById(db: PlanPhaseStoreDb, planId: string): Promise<PlanRow | null> {
        const row = await db
            .selectFrom('plan_records')
            .select(['id', 'current_revision_id', 'current_variant_id', 'status'])
            .where('id', '=', planId)
            .executeTakeFirst();
        return row ?? null;
    }

    private async listPhaseRowsForPlanRevision(
        db: PlanPhaseStoreDb,
        input: { planId: string; planRevisionId: string; planVariantId: string }
    ): Promise<PlanPhaseRow[]> {
        return db
            .selectFrom('plan_phases')
            .selectAll()
            .where('plan_id', '=', input.planId)
            .where('plan_revision_id', '=', input.planRevisionId)
            .where('plan_variant_id', '=', input.planVariantId)
            .orderBy('phase_sequence', 'asc')
            .execute();
    }

    private async getOpenPhaseRowByPlanRevision(
        db: PlanPhaseStoreDb,
        input: { planId: string; planRevisionId: string; planVariantId: string }
    ): Promise<PlanPhaseRow | null> {
        return (
            (await db
            .selectFrom('plan_phases')
            .selectAll()
            .where('plan_id', '=', input.planId)
            .where('plan_revision_id', '=', input.planRevisionId)
            .where('plan_variant_id', '=', input.planVariantId)
            .where('status', 'in', ['draft', 'approved', 'implementing'])
            .executeTakeFirst()) ?? null
        ) ?? null;
    }

    private async listPhaseRevisionRowsForPhaseIds(
        db: PlanPhaseStoreDb,
        phaseIds: string[]
    ): Promise<PlanPhaseRevisionRow[]> {
        if (phaseIds.length === 0) {
            return [];
        }

        return db
            .selectFrom('plan_phase_revisions')
            .selectAll()
            .where('plan_phase_id', 'in', phaseIds)
            .orderBy('revision_number', 'asc')
            .execute();
    }

    private async listPhaseRevisionItemRecordsForRevisionIds(
        db: PlanPhaseStoreDb,
        revisionIds: string[]
    ): Promise<PlanPhaseRevisionItemRecord[]> {
        if (revisionIds.length === 0) {
            return [];
        }

        const rows = await db
            .selectFrom('plan_phase_revision_items')
            .selectAll()
            .where('plan_phase_revision_id', 'in', revisionIds)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPhaseRevisionItem);
    }

    private hydratePhaseRows(
        input: {
            phases: PlanPhaseRow[];
            phaseRevisions: PlanPhaseRevisionRow[];
            phaseRevisionItems: PlanPhaseRevisionItemRecord[];
        }
    ): PlanPhaseRecord[] {
        const revisionsByPhaseId = phaseRevisionRowsByPhaseId(
            input.phaseRevisions.map((revision) => ({
                ...mapPhaseRevision(revision, input.phaseRevisionItems.filter((item) => item.planPhaseRevisionId === revision.id)),
            }))
        );

        return input.phases.map((row) => {
            const phaseRevisions = revisionsByPhaseId.get(row.id) ?? [];
            const currentRevision = phaseRevisions.find((revision) => revision.id === row.current_revision_id);
            if (!currentRevision) {
                throw new DataCorruptionError(`Missing current phase revision "${row.current_revision_id}" for phase "${row.id}".`);
            }

            const approvedRevision = row.approved_revision_id
                ? phaseRevisions.find((revision) => revision.id === row.approved_revision_id)
                : undefined;
            if (row.approved_revision_id && !approvedRevision) {
                throw new DataCorruptionError(
                    `Missing approved phase revision "${row.approved_revision_id}" for phase "${row.id}".`
                );
            }

            return {
                id: parseEntityId(row.id, 'plan_phases.id', 'pph'),
                planId: parseEntityId(row.plan_id, 'plan_phases.plan_id', 'plan'),
                planRevisionId: parseEntityId(row.plan_revision_id, 'plan_phases.plan_revision_id', 'prev'),
                variantId: parseEntityId(row.plan_variant_id, 'plan_phases.plan_variant_id', 'pvar'),
                phaseOutlineId: row.phase_outline_id,
                phaseSequence: row.phase_sequence,
                title: row.title,
                goalMarkdown: row.goal_markdown,
                exitCriteriaMarkdown: row.exit_criteria_markdown,
                status: parsePlanPhaseStatus(row.status),
                currentRevisionId: currentRevision.id,
                currentRevisionNumber: currentRevision.revisionNumber,
                ...(approvedRevision
                    ? {
                          approvedRevisionId: approvedRevision.id,
                          approvedRevisionNumber: approvedRevision.revisionNumber,
                      }
                    : {}),
                summaryMarkdown: currentRevision.summaryMarkdown,
                items: (currentRevision.items ?? []).map(toPhaseItemView),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
                ...(row.implemented_at ? { implementedAt: row.implemented_at } : {}),
                ...(row.implementation_run_id
                    ? { implementationRunId: parseEntityId(row.implementation_run_id, 'plan_phases.implementation_run_id', 'run') }
                    : {}),
                ...(row.orchestrator_run_id
                    ? {
                          orchestratorRunId: parseEntityId(
                              row.orchestrator_run_id,
                              'plan_phases.orchestrator_run_id',
                              'orch'
                          ),
                      }
                    : {}),
            };
        });
    }

    async listForPlanRevision(input: {
        planId: string;
        planRevisionId: string;
        planVariantId: string;
    }): Promise<PlanPhaseRecord[]> {
        const db = this.getDb();
        const phases = await this.listPhaseRowsForPlanRevision(db, input);
        const phaseRevisions = await this.listPhaseRevisionRowsForPhaseIds(
            db,
            phases.map((phase) => phase.id)
        );
        const phaseRevisionItems = await this.listPhaseRevisionItemRecordsForRevisionIds(
            db,
            phaseRevisions.map((revision) => revision.id)
        );

        return this.hydratePhaseRows({ phases, phaseRevisions, phaseRevisionItems });
    }

    async listRevisionsForPlanRevision(input: {
        planId: string;
        planRevisionId: string;
        planVariantId: string;
    }): Promise<PlanPhaseRevisionRecord[]> {
        const db = this.getDb();
        const phases = await this.listPhaseRowsForPlanRevision(db, input);
        const phaseRevisions = await this.listPhaseRevisionRowsForPhaseIds(
            db,
            phases.map((phase) => phase.id)
        );
        const phaseRevisionItems = await this.listPhaseRevisionItemRecordsForRevisionIds(
            db,
            phaseRevisions.map((revision) => revision.id)
        );

        return phaseRevisions.map((revision) =>
            mapPhaseRevision(
                revision,
                phaseRevisionItems.filter((item) => item.planPhaseRevisionId === revision.id)
            )
        );
    }

    async listProjectionData(planId: string): Promise<{
        phases: PlanPhaseRecord[];
        phaseRevisions: PlanPhaseRevisionRecord[];
        phaseRevisionItems: PlanPhaseRevisionItemRecord[];
    }> {
        const db = this.getDb();
        const plan = await this.getPlanRowById(db, planId);
        if (!plan) {
            return {
                phases: [],
                phaseRevisions: [],
                phaseRevisionItems: [],
            };
        }

        const phases = await this.listPhaseRowsForPlanRevision(db, {
            planId,
            planRevisionId: plan.current_revision_id,
            planVariantId: plan.current_variant_id,
        });
        const phaseRevisions = await this.listPhaseRevisionRowsForPhaseIds(
            db,
            phases.map((phase) => phase.id)
        );
        const phaseRevisionItems = await this.listPhaseRevisionItemRecordsForRevisionIds(
            db,
            phaseRevisions.map((revision) => revision.id)
        );

        return {
            phases: this.hydratePhaseRows({
                phases,
                phaseRevisions,
                phaseRevisionItems,
            }),
            phaseRevisions: phaseRevisions.map((revision) =>
                mapPhaseRevision(
                    revision,
                    phaseRevisionItems.filter((item) => item.planPhaseRevisionId === revision.id)
                )
            ),
            phaseRevisionItems,
        };
    }

    async getById(planPhaseId: string): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const phase = await db.selectFrom('plan_phases').selectAll().where('id', '=', planPhaseId).executeTakeFirst();
        if (!phase) {
            return null;
        }

        const phaseRevisions = await this.listPhaseRevisionRowsForPhaseIds(db, [phase.id]);
        const phaseRevisionItems = await this.listPhaseRevisionItemRecordsForRevisionIds(
            db,
            phaseRevisions.map((revision) => revision.id)
        );
        const hydrated = this.hydratePhaseRows({
            phases: [phase],
            phaseRevisions,
            phaseRevisionItems,
        });

        return hydrated[0] ?? null;
    }

    async getByRevisionId(phaseRevisionId: string): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const revision = await db
            .selectFrom('plan_phase_revisions')
            .selectAll()
            .where('id', '=', phaseRevisionId)
            .executeTakeFirst();
        if (!revision) {
            return null;
        }

        const phase = await db.selectFrom('plan_phases').selectAll().where('id', '=', revision.plan_phase_id).executeTakeFirst();
        if (!phase) {
            return null;
        }

        const phaseRevisions = await this.listPhaseRevisionRowsForPhaseIds(db, [phase.id]);
        const phaseRevisionItems = await this.listPhaseRevisionItemRecordsForRevisionIds(
            db,
            phaseRevisions.map((record) => record.id)
        );
        const hydrated = this.hydratePhaseRows({
            phases: [phase],
            phaseRevisions,
            phaseRevisionItems,
        });

        return hydrated[0] ?? null;
    }

    async getOpenPhaseByPlanRevision(input: {
        planId: string;
        planRevisionId: string;
        planVariantId: string;
    }): Promise<PlanPhaseRecord | null> {
        const phases = await this.listForPlanRevision(input);
        return phases.find((phase) => isPhaseOpen(phase.status)) ?? null;
    }

    async getNextExpandablePhaseOutlineId(input: {
        planId: string;
        planRevisionId: string;
        planVariantId: string;
        advancedSnapshot: PlanAdvancedSnapshotView | undefined;
    }): Promise<string | null> {
        const outlines = normalizePhaseOutlines(input.advancedSnapshot).slice().sort((left, right) => left.sequence - right.sequence);
        if (outlines.length === 0) {
            return null;
        }

        const phases = await this.listForPlanRevision(input);
        if (phases.some((phase) => phase.status === 'cancelled')) {
            return null;
        }
        if (phases.some((phase) => isPhaseOpen(phase.status))) {
            return null;
        }

        const phaseBySequence = new Map(phases.map((phase) => [phase.phaseSequence, phase]));
        for (const outline of outlines) {
            const phase = phaseBySequence.get(outline.sequence);
            if (!phase) {
                const allPriorImplemented = outlines
                    .filter((priorOutline) => priorOutline.sequence < outline.sequence)
                    .every((priorOutline) => phaseBySequence.get(priorOutline.sequence)?.status === 'implemented');
                return allPriorImplemented ? outline.id : null;
            }

            if (phase.status !== 'implemented') {
                return null;
            }
        }

        return null;
    }

    async expandPhase(input: {
        planId: string;
        planRevisionId: string;
        planVariantId: string;
        phaseOutline: PlanPhaseOutlineInput;
        summaryMarkdown: string;
        itemDescriptions: string[];
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        return this.createPhase({
            planId: input.planId,
            planRevisionId: input.planRevisionId,
            planVariantId: input.planVariantId,
            phaseOutline: input.phaseOutline,
            summaryMarkdown: input.summaryMarkdown,
            itemDescriptions: input.itemDescriptions,
            ...(input.timestamp ? { timestamp: input.timestamp } : {}),
        });
    }

    async createPhase(input: {
        planId: string;
        planRevisionId: string;
        planVariantId: string;
        phaseOutline: PlanPhaseOutlineInput;
        summaryMarkdown: string;
        itemDescriptions: string[];
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();
        const phaseId = createEntityId('pph');
        const phaseRevisionId = createEntityId('pprv');

        const createdPhaseId = await db.transaction().execute(async (transaction) => {
            const plan = await this.getPlanRowById(transaction, input.planId);
            if (!plan || !isPlanApproved(plan)) {
                return null;
            }
            if (plan.current_revision_id !== input.planRevisionId || plan.current_variant_id !== input.planVariantId) {
                return null;
            }

            const openPhase = await this.getOpenPhaseRowByPlanRevision(transaction, input);
            if (openPhase) {
                return null;
            }

            const existingPhase = await transaction
                .selectFrom('plan_phases')
                .selectAll()
                .where('plan_id', '=', input.planId)
                .where('plan_revision_id', '=', input.planRevisionId)
                .where('plan_variant_id', '=', input.planVariantId)
                .where('phase_outline_id', '=', input.phaseOutline.id)
                .executeTakeFirst();
            if (existingPhase) {
                return null;
            }

            await transaction
                .insertInto('plan_phases')
                .values({
                    id: phaseId,
                    plan_id: input.planId,
                    plan_revision_id: input.planRevisionId,
                    plan_variant_id: input.planVariantId,
                    phase_outline_id: input.phaseOutline.id,
                    phase_sequence: input.phaseOutline.sequence,
                    title: input.phaseOutline.title,
                    goal_markdown: input.phaseOutline.goalMarkdown,
                    exit_criteria_markdown: input.phaseOutline.exitCriteriaMarkdown,
                    status: 'draft',
                    current_revision_id: phaseRevisionId,
                    approved_revision_id: null,
                    implementation_run_id: null,
                    orchestrator_run_id: null,
                    created_at: now,
                    updated_at: now,
                    approved_at: null,
                    implemented_at: null,
                })
                .execute();

            await transaction
                .insertInto('plan_phase_revisions')
                .values({
                    id: phaseRevisionId,
                    plan_phase_id: phaseId,
                    revision_number: 1,
                    summary_markdown: input.summaryMarkdown,
                    created_by_kind: 'expand',
                    created_at: now,
                    previous_revision_id: null,
                    superseded_at: null,
                })
                .execute();

            if (input.itemDescriptions.length > 0) {
                await transaction
                    .insertInto('plan_phase_revision_items')
                    .values(
                        input.itemDescriptions.map((description, index) => ({
                            id: createEntityId('ppi'),
                            plan_phase_revision_id: phaseRevisionId,
                            sequence: index + 1,
                            description,
                            created_at: now,
                        }))
                    )
                    .execute();
            }

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return phaseId;
        });

        if (!createdPhaseId) {
            return null;
        }

        return this.getById(createdPhaseId);
    }

    async revisePhase(input: {
        planId: string;
        planPhaseId: string;
        phaseRevisionId: string;
        summaryMarkdown: string;
        itemDescriptions: string[];
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();

        const revisedPhaseId = await db.transaction().execute(async (transaction) => {
            const phase = await transaction.selectFrom('plan_phases').selectAll().where('id', '=', input.planPhaseId).executeTakeFirst();
            if (!phase || phase.plan_id !== input.planId || phase.current_revision_id !== input.phaseRevisionId) {
                return null;
            }
            if (phase.status === 'implementing' || phase.status === 'implemented' || phase.status === 'cancelled') {
                return null;
            }

            const currentRevision = await transaction
                .selectFrom('plan_phase_revisions')
                .selectAll()
                .where('id', '=', input.phaseRevisionId)
                .executeTakeFirst();
            if (!currentRevision || currentRevision.plan_phase_id !== input.planPhaseId) {
                return null;
            }

            const nextRevisionId = createEntityId('pprv');
            const nextRevisionNumber = currentRevision.revision_number + 1;

            await transaction
                .updateTable('plan_phase_revisions')
                .set({
                    superseded_at: now,
                })
                .where('id', '=', currentRevision.id)
                .where('superseded_at', 'is', null)
                .execute();

            await transaction
                .insertInto('plan_phase_revisions')
                .values({
                    id: nextRevisionId,
                    plan_phase_id: input.planPhaseId,
                    revision_number: nextRevisionNumber,
                    summary_markdown: input.summaryMarkdown,
                    created_by_kind: 'revise',
                    created_at: now,
                    previous_revision_id: currentRevision.id,
                    superseded_at: null,
                })
                .execute();

            if (input.itemDescriptions.length > 0) {
                await transaction
                    .insertInto('plan_phase_revision_items')
                    .values(
                        input.itemDescriptions.map((description, index) => ({
                            id: createEntityId('ppi'),
                            plan_phase_revision_id: nextRevisionId,
                            sequence: index + 1,
                            description,
                            created_at: now,
                        }))
                    )
                    .execute();
            }

            await transaction
                .updateTable('plan_phases')
                .set({
                    current_revision_id: nextRevisionId,
                    status: phase.status === 'approved' ? 'draft' : phase.status,
                    updated_at: now,
                })
                .where('id', '=', input.planPhaseId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planPhaseId;
        });

        if (!revisedPhaseId) {
            return null;
        }

        return this.getById(revisedPhaseId);
    }

    async approvePhase(input: {
        planId: string;
        planPhaseId: string;
        phaseRevisionId: string;
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();

        const approvedPhaseId = await db.transaction().execute(async (transaction) => {
            const phase = await transaction.selectFrom('plan_phases').selectAll().where('id', '=', input.planPhaseId).executeTakeFirst();
            if (!phase || phase.plan_id !== input.planId || phase.current_revision_id !== input.phaseRevisionId) {
                return null;
            }
            if (phase.status === 'implemented' || phase.status === 'cancelled') {
                return null;
            }

            const revision = await transaction
                .selectFrom('plan_phase_revisions')
                .selectAll()
                .where('id', '=', input.phaseRevisionId)
                .executeTakeFirst();
            if (!revision || revision.plan_phase_id !== input.planPhaseId) {
                return null;
            }

            await transaction
                .updateTable('plan_phases')
                .set({
                    status: 'approved',
                    approved_revision_id: input.phaseRevisionId,
                    approved_at: now,
                    updated_at: now,
                })
                .where('id', '=', input.planPhaseId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planPhaseId;
        });

        if (!approvedPhaseId) {
            return null;
        }

        return this.getById(approvedPhaseId);
    }

    async markPhaseImplementing(input: {
        planId: string;
        planPhaseId: string;
        phaseRevisionId: string;
        implementationRunId?: string;
        orchestratorRunId?: string;
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();

        const phaseId = await db.transaction().execute(async (transaction) => {
            const phase = await transaction.selectFrom('plan_phases').selectAll().where('id', '=', input.planPhaseId).executeTakeFirst();
            if (!phase || phase.plan_id !== input.planId || phase.current_revision_id !== input.phaseRevisionId) {
                return null;
            }
            if (phase.status !== 'approved' && phase.status !== 'draft') {
                return null;
            }

            await transaction
                .updateTable('plan_phases')
                .set({
                    status: 'implementing',
                    ...(input.implementationRunId ? { implementation_run_id: input.implementationRunId } : {}),
                    ...(input.orchestratorRunId ? { orchestrator_run_id: input.orchestratorRunId } : {}),
                    updated_at: now,
                })
                .where('id', '=', input.planPhaseId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planPhaseId;
        });

        if (!phaseId) {
            return null;
        }

        return this.getById(phaseId);
    }

    async markPhaseImplemented(input: {
        planId: string;
        planPhaseId: string;
        phaseRevisionId: string;
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();

        const phaseId = await db.transaction().execute(async (transaction) => {
            const phase = await transaction.selectFrom('plan_phases').selectAll().where('id', '=', input.planPhaseId).executeTakeFirst();
            if (!phase || phase.plan_id !== input.planId || phase.current_revision_id !== input.phaseRevisionId) {
                return null;
            }

            await transaction
                .updateTable('plan_phases')
                .set({
                    status: 'implemented',
                    implemented_at: now,
                    updated_at: now,
                })
                .where('id', '=', input.planPhaseId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planPhaseId;
        });

        if (!phaseId) {
            return null;
        }

        return this.getById(phaseId);
    }

    async markPhaseFailed(input: {
        planId: string;
        planPhaseId: string;
        phaseRevisionId: string;
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();

        const phaseId = await db.transaction().execute(async (transaction) => {
            const phase = await transaction.selectFrom('plan_phases').selectAll().where('id', '=', input.planPhaseId).executeTakeFirst();
            if (!phase || phase.plan_id !== input.planId || phase.current_revision_id !== input.phaseRevisionId) {
                return null;
            }

            await transaction
                .updateTable('plan_phases')
                .set({
                    status: 'draft',
                    updated_at: now,
                })
                .where('id', '=', input.planPhaseId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planPhaseId;
        });

        if (!phaseId) {
            return null;
        }

        return this.getById(phaseId);
    }

    async cancelPhase(input: {
        planId: string;
        planPhaseId: string;
        phaseRevisionId: string;
        timestamp?: string;
    }): Promise<PlanPhaseRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();

        const phaseId = await db.transaction().execute(async (transaction) => {
            const phase = await transaction.selectFrom('plan_phases').selectAll().where('id', '=', input.planPhaseId).executeTakeFirst();
            if (!phase || phase.plan_id !== input.planId || phase.current_revision_id !== input.phaseRevisionId) {
                return null;
            }

            await transaction
                .updateTable('plan_phases')
                .set({
                    status: 'cancelled',
                    updated_at: now,
                })
                .where('id', '=', input.planPhaseId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planPhaseId;
        });

        if (!phaseId) {
            return null;
        }

        return this.getById(phaseId);
    }
}

export const planPhaseStore = new PlanPhaseStore();

import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    PlanPhaseVerificationDiscrepancyRecord,
    PlanPhaseVerificationRecord,
} from '@/app/backend/persistence/types';
import type {
    PlanPhaseVerificationDiscrepancyInput,
    PlanPhaseVerificationOutcome,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

import type { Kysely, Transaction } from 'kysely';

type PlanPhaseVerificationStoreDb = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

type PlanPhaseVerificationRow = {
    id: string;
    plan_phase_id: string;
    plan_phase_revision_id: string;
    outcome: string;
    summary_markdown: string;
    created_at: string;
};

type PlanPhaseVerificationDiscrepancyRow = {
    id: string;
    verification_id: string;
    sequence: number;
    title: string;
    details_markdown: string;
    created_at: string;
};

function mapVerificationRow(row: PlanPhaseVerificationRow): PlanPhaseVerificationRecord {
    return {
        id: parseEntityId(row.id, 'plan_phase_verifications.id', 'ppv'),
        planPhaseId: parseEntityId(row.plan_phase_id, 'plan_phase_verifications.plan_phase_id', 'pph'),
        planPhaseRevisionId: parseEntityId(
            row.plan_phase_revision_id,
            'plan_phase_verifications.plan_phase_revision_id',
            'pprv'
        ),
        outcome: parseEnumValue(row.outcome, 'plan_phase_verifications.outcome', ['passed', 'failed']),
        summaryMarkdown: row.summary_markdown,
        createdAt: row.created_at,
    };
}

function mapVerificationDiscrepancyRow(
    row: PlanPhaseVerificationDiscrepancyRow
): PlanPhaseVerificationDiscrepancyRecord {
    return {
        id: parseEntityId(row.id, 'plan_phase_verification_discrepancies.id', 'ppvd'),
        verificationId: parseEntityId(
            row.verification_id,
            'plan_phase_verification_discrepancies.verification_id',
            'ppv'
        ),
        sequence: row.sequence,
        title: row.title,
        detailsMarkdown: row.details_markdown,
        createdAt: row.created_at,
    };
}

export class PlanPhaseVerificationStore {
    private getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    private async getPlanPhaseRowById(db: PlanPhaseVerificationStoreDb, phaseId: string) {
        return db.selectFrom('plan_phases').selectAll().where('id', '=', phaseId).executeTakeFirst();
    }

    private async listVerificationRowsByPhaseIds(
        db: PlanPhaseVerificationStoreDb,
        phaseIds: string[]
    ): Promise<PlanPhaseVerificationRow[]> {
        if (phaseIds.length === 0) {
            return [];
        }

        return db
            .selectFrom('plan_phase_verifications')
            .selectAll()
            .where('plan_phase_id', 'in', phaseIds)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();
    }

    private async listDiscrepancyRowsByVerificationIds(
        db: PlanPhaseVerificationStoreDb,
        verificationIds: string[]
    ): Promise<PlanPhaseVerificationDiscrepancyRow[]> {
        if (verificationIds.length === 0) {
            return [];
        }

        return db
            .selectFrom('plan_phase_verification_discrepancies')
            .selectAll()
            .where('verification_id', 'in', verificationIds)
            .orderBy('sequence', 'asc')
            .execute();
    }

    async listForPlanRevision(input: { planId: string; planRevisionId: string; planVariantId: string }): Promise<{
        phaseVerifications: PlanPhaseVerificationRecord[];
        phaseVerificationDiscrepancies: PlanPhaseVerificationDiscrepancyRecord[];
    }> {
        const db = this.getDb();
        const phaseRows = await db
            .selectFrom('plan_phases')
            .select('id')
            .where('plan_id', '=', input.planId)
            .where('plan_revision_id', '=', input.planRevisionId)
            .where('plan_variant_id', '=', input.planVariantId)
            .orderBy('phase_sequence', 'asc')
            .execute();
        const phaseIds = phaseRows.map((row) => row.id);

        const verificationRows = await this.listVerificationRowsByPhaseIds(db, phaseIds);
        const verifications = verificationRows.map(mapVerificationRow);
        const discrepancies = await this.listDiscrepancyRowsByVerificationIds(
            db,
            verifications.map((verification) => verification.id)
        );

        return {
            phaseVerifications: verifications,
            phaseVerificationDiscrepancies: discrepancies.map(mapVerificationDiscrepancyRow),
        };
    }

    async listProjectionData(planId: string): Promise<{
        phaseVerifications: PlanPhaseVerificationRecord[];
        phaseVerificationDiscrepancies: PlanPhaseVerificationDiscrepancyRecord[];
    }> {
        const db = this.getDb();
        const plan = await db
            .selectFrom('plan_records')
            .select(['id', 'current_revision_id', 'current_variant_id'])
            .where('id', '=', planId)
            .executeTakeFirst();
        if (!plan) {
            return {
                phaseVerifications: [],
                phaseVerificationDiscrepancies: [],
            };
        }

        return this.listForPlanRevision({
            planId,
            planRevisionId: plan.current_revision_id,
            planVariantId: plan.current_variant_id,
        });
    }

    async getById(verificationId: string): Promise<PlanPhaseVerificationRecord | null> {
        const row = await this.getDb()
            .selectFrom('plan_phase_verifications')
            .selectAll()
            .where('id', '=', verificationId)
            .executeTakeFirst();
        return row ? mapVerificationRow(row) : null;
    }

    async getByPhaseRevisionId(phaseRevisionId: string): Promise<PlanPhaseVerificationRecord | null> {
        const row = await this.getDb()
            .selectFrom('plan_phase_verifications')
            .selectAll()
            .where('plan_phase_revision_id', '=', phaseRevisionId)
            .orderBy('created_at', 'desc')
            .executeTakeFirst();
        return row ? mapVerificationRow(row) : null;
    }

    async getViewById(input: { verificationId: string }): Promise<null | {
        verification: PlanPhaseVerificationRecord;
        discrepancies: PlanPhaseVerificationDiscrepancyRecord[];
    }> {
        const verification = await this.getById(input.verificationId);
        if (!verification) {
            return null;
        }

        const discrepancies = await this.listDiscrepanciesForVerificationIds([verification.id]);
        return {
            verification,
            discrepancies,
        };
    }

    async listDiscrepanciesForVerificationIds(
        verificationIds: string[]
    ): Promise<PlanPhaseVerificationDiscrepancyRecord[]> {
        const rows = await this.listDiscrepancyRowsByVerificationIds(this.getDb(), verificationIds);
        return rows.map(mapVerificationDiscrepancyRow);
    }

    async createVerification(input: {
        planId: string;
        planPhaseId: string;
        planPhaseRevisionId: string;
        outcome: PlanPhaseVerificationOutcome;
        summaryMarkdown: string;
        discrepancies: PlanPhaseVerificationDiscrepancyInput[];
        timestamp?: string;
    }): Promise<PlanPhaseVerificationRecord | null> {
        const db = this.getDb();
        const now = input.timestamp ?? nowIso();

        const verificationId = await db.transaction().execute(async (transaction) => {
            const phase = await this.getPlanPhaseRowById(transaction, input.planPhaseId);
            if (!phase || phase.plan_id !== input.planId) {
                return null;
            }
            if (phase.status !== 'implemented' || phase.implemented_revision_id !== input.planPhaseRevisionId) {
                return null;
            }

            const currentRevision = await transaction
                .selectFrom('plan_phase_revisions')
                .selectAll()
                .where('id', '=', input.planPhaseRevisionId)
                .executeTakeFirst();
            if (!currentRevision || currentRevision.plan_phase_id !== input.planPhaseId) {
                return null;
            }

            const existing = await transaction
                .selectFrom('plan_phase_verifications')
                .select(['id'])
                .where('plan_phase_id', '=', input.planPhaseId)
                .where('plan_phase_revision_id', '=', input.planPhaseRevisionId)
                .executeTakeFirst();
            if (existing) {
                return null;
            }

            const createdVerificationId = createEntityId('ppv');
            await transaction
                .insertInto('plan_phase_verifications')
                .values({
                    id: createdVerificationId,
                    plan_phase_id: input.planPhaseId,
                    plan_phase_revision_id: input.planPhaseRevisionId,
                    outcome: input.outcome,
                    summary_markdown: input.summaryMarkdown,
                    created_at: now,
                })
                .execute();

            if (input.discrepancies.length > 0) {
                await transaction
                    .insertInto('plan_phase_verification_discrepancies')
                    .values(
                        input.discrepancies.map((discrepancy, index) => ({
                            id: createEntityId('ppvd'),
                            verification_id: createdVerificationId,
                            sequence: index + 1,
                            title: discrepancy.title,
                            details_markdown: discrepancy.detailsMarkdown,
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

            return createdVerificationId;
        });

        if (!verificationId) {
            return null;
        }

        return this.getById(verificationId);
    }
}

export const planPhaseVerificationStore = new PlanPhaseVerificationStore();

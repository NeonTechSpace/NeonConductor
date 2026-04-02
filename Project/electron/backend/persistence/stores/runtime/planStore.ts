import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import {
    isJsonRecord,
    isJsonUnknownArray,
    nowIso,
    parseJsonValue,
} from '@/app/backend/persistence/stores/shared/utils';
import type {
    PlanItemRecord,
    PlanQuestionRecord,
    PlanRecord,
    PlanRevisionItemRecord,
    PlanRevisionRecord,
} from '@/app/backend/persistence/types';
import { planItemStatuses, planStatuses, topLevelTabs } from '@/app/backend/runtime/contracts';
import type { EntityId, TopLevelTab } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { hasUnansweredRequiredQuestions } from '@/app/backend/runtime/services/plan/intake';

import type { Kysely, Transaction } from 'kysely';

type PlanStoreDb = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

function isPlanQuestionRecord(value: unknown): value is PlanQuestionRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const record: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
        record[key] = entryValue;
    }
    const id = record['id'];
    const question = record['question'];
    const category = record['category'];
    const required = record['required'];
    const placeholderText = record['placeholderText'];
    const helpText = record['helpText'];
    return (
        typeof id === 'string' &&
        typeof question === 'string' &&
        (category === 'goal' ||
            category === 'deliverable' ||
            category === 'constraints' ||
            category === 'environment' ||
            category === 'validation' ||
            category === 'missing_context') &&
        typeof required === 'boolean' &&
        (placeholderText === undefined || typeof placeholderText === 'string') &&
        (helpText === undefined || typeof helpText === 'string')
    );
}

type PlanRecordRow = {
    id: string;
    profile_id: string;
    session_id: string;
    top_level_tab: string;
    mode_key: string;
    status: string;
    source_prompt: string;
    summary_markdown: string;
    questions_json: string;
    answers_json: string;
    current_revision_id: string;
    approved_revision_id: string | null;
    workspace_fingerprint: string | null;
    implementation_run_id: string | null;
    orchestrator_run_id: string | null;
    approved_at: string | null;
    implemented_at: string | null;
    created_at: string;
    updated_at: string;
};

type PlanRevisionRow = {
    id: string;
    plan_id: string;
    revision_number: number;
    summary_markdown: string;
    created_by_kind: string;
    created_at: string;
    superseded_at: string | null;
};

function parsePlanAnswers(row: { answers_json: string }): Record<string, string> {
    const rawAnswers = parseJsonRecord(row.answers_json);
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawAnswers)) {
        if (typeof value === 'string') {
            answers[key] = value;
        }
    }
    return answers;
}

function parsePlanQuestions(row: { questions_json: string }): PlanQuestionRecord[] {
    const rawQuestions = parseJsonValue(row.questions_json, [], isJsonUnknownArray);
    return rawQuestions.filter(isPlanQuestionRecord);
}

function mapPlanRevisionRecord(row: PlanRevisionRow): PlanRevisionRecord {
    return {
        id: parseEntityId(row.id, 'plan_revisions.id', 'prev'),
        planId: parseEntityId(row.plan_id, 'plan_revisions.plan_id', 'plan'),
        revisionNumber: row.revision_number,
        summaryMarkdown: row.summary_markdown,
        createdByKind: row.created_by_kind === 'start' ? 'start' : 'revise',
        createdAt: row.created_at,
        ...(row.superseded_at ? { supersededAt: row.superseded_at } : {}),
    };
}

function mapPlanRevisionItemRecord(row: {
    id: string;
    plan_revision_id: string;
    sequence: number;
    description: string;
    created_at: string;
}): PlanRevisionItemRecord {
    return {
        id: parseEntityId(row.id, 'plan_revision_items.id', 'step'),
        planRevisionId: parseEntityId(row.plan_revision_id, 'plan_revision_items.plan_revision_id', 'prev'),
        sequence: row.sequence,
        description: row.description,
        createdAt: row.created_at,
    };
}

function mapPlanItemRecord(row: {
    id: string;
    plan_id: string;
    sequence: number;
    description: string;
    status: string;
    run_id: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}): PlanItemRecord {
    return {
        id: parseEntityId(row.id, 'plan_items.id', 'step'),
        planId: parseEntityId(row.plan_id, 'plan_items.plan_id', 'plan'),
        sequence: row.sequence,
        description: row.description,
        status: parseEnumValue(row.status, 'plan_items.status', planItemStatuses),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'plan_items.run_id', 'run') } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class PlanStore {
    private getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    private async getPlanRecordRowById(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRecordRow | null> {
        return (
            (await db.selectFrom('plan_records').selectAll().where('id', '=', planId).executeTakeFirst()) ?? null
        );
    }

    private async getPlanRevisionRowById(
        db: PlanStoreDb,
        revisionId: EntityId<'prev'>
    ): Promise<PlanRevisionRow | null> {
        return (
            (await db.selectFrom('plan_revisions').selectAll().where('id', '=', revisionId).executeTakeFirst()) ??
            null
        );
    }

    private async hydratePlanRecord(db: PlanStoreDb, row: PlanRecordRow): Promise<PlanRecord> {
        const currentRevisionRow = await this.getPlanRevisionRowById(
            db,
            parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev')
        );
        if (!currentRevisionRow) {
            throw new Error(`Missing current revision "${row.current_revision_id}" for plan ${row.id}.`);
        }

        const approvedRevisionRow = row.approved_revision_id
            ? await this.getPlanRevisionRowById(
                  db,
                  parseEntityId(row.approved_revision_id, 'plan_records.approved_revision_id', 'prev')
              )
            : null;

        return {
            id: parseEntityId(row.id, 'plan_records.id', 'plan'),
            profileId: row.profile_id,
            sessionId: parseEntityId(row.session_id, 'plan_records.session_id', 'sess'),
            topLevelTab: parseEnumValue(row.top_level_tab, 'plan_records.top_level_tab', topLevelTabs),
            modeKey: row.mode_key,
            status: parseEnumValue(row.status, 'plan_records.status', planStatuses),
            sourcePrompt: row.source_prompt,
            summaryMarkdown: row.summary_markdown,
            questions: parsePlanQuestions(row),
            answers: parsePlanAnswers(row),
            currentRevisionId: parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev'),
            currentRevisionNumber: currentRevisionRow.revision_number,
            ...(row.approved_revision_id
                ? {
                      approvedRevisionId: parseEntityId(
                          row.approved_revision_id,
                          'plan_records.approved_revision_id',
                          'prev'
                      ),
                  }
                : {}),
            ...(approvedRevisionRow ? { approvedRevisionNumber: approvedRevisionRow.revision_number } : {}),
            ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
            ...(row.implementation_run_id
                ? {
                      implementationRunId: parseEntityId(
                          row.implementation_run_id,
                          'plan_records.implementation_run_id',
                          'run'
                      ),
                  }
                : {}),
            ...(row.orchestrator_run_id
                ? { orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'plan_records.orchestrator_run_id', 'orch') }
                : {}),
            ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
            ...(row.implemented_at ? { implementedAt: row.implemented_at } : {}),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private async insertRevisionInTransaction(
        db: PlanStoreDb,
        input: {
            planId: EntityId<'plan'>;
            revisionId: EntityId<'prev'>;
            revisionNumber: number;
            summaryMarkdown: string;
            createdByKind: PlanRevisionRecord['createdByKind'];
            itemDescriptions: string[];
            timestamp: string;
        }
    ): Promise<void> {
        await db
            .insertInto('plan_revisions')
            .values({
                id: input.revisionId,
                plan_id: input.planId,
                revision_number: input.revisionNumber,
                summary_markdown: input.summaryMarkdown,
                created_by_kind: input.createdByKind,
                created_at: input.timestamp,
                superseded_at: null,
            })
            .execute();

        if (input.itemDescriptions.length === 0) {
            return;
        }

        await db
            .insertInto('plan_revision_items')
            .values(
                input.itemDescriptions.map((description, index) => ({
                    id: createEntityId('step'),
                    plan_revision_id: input.revisionId,
                    sequence: index + 1,
                    description,
                    created_at: input.timestamp,
                }))
            )
            .execute();
    }

    private async replaceLiveItemsInTransaction(
        db: PlanStoreDb,
        planId: EntityId<'plan'>,
        descriptions: string[],
        timestamp: string
    ): Promise<void> {
        await db.deleteFrom('plan_items').where('plan_id', '=', planId).execute();
        if (descriptions.length === 0) {
            return;
        }

        await db
            .insertInto('plan_items')
            .values(
                descriptions.map((description, index) => ({
                    id: createEntityId('step'),
                    plan_id: planId,
                    sequence: index + 1,
                    description,
                    status: 'pending',
                    run_id: null,
                    error_message: null,
                    created_at: timestamp,
                    updated_at: timestamp,
                }))
            )
            .execute();
    }

    async create(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        topLevelTab: TopLevelTab;
        modeKey: string;
        sourcePrompt: string;
        summaryMarkdown: string;
        questions: PlanQuestionRecord[];
        workspaceFingerprint?: string;
    }): Promise<PlanRecord> {
        const db = this.getDb();
        const now = nowIso();
        const planId = createEntityId('plan');
        const revisionId = createEntityId('prev');

        await db.transaction().execute(async (transaction) => {
            await transaction
                .insertInto('plan_records')
                .values({
                    id: planId,
                    profile_id: input.profileId,
                    session_id: input.sessionId,
                    top_level_tab: input.topLevelTab,
                    mode_key: input.modeKey,
                    status: input.questions.length > 0 ? 'awaiting_answers' : 'draft',
                    source_prompt: input.sourcePrompt,
                    summary_markdown: input.summaryMarkdown,
                    questions_json: JSON.stringify(input.questions),
                    answers_json: JSON.stringify({}),
                    current_revision_id: revisionId,
                    approved_revision_id: null,
                    workspace_fingerprint: input.workspaceFingerprint ?? null,
                    implementation_run_id: null,
                    orchestrator_run_id: null,
                    approved_at: null,
                    implemented_at: null,
                    created_at: now,
                    updated_at: now,
                })
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                revisionId,
                revisionNumber: 1,
                summaryMarkdown: input.summaryMarkdown,
                createdByKind: 'start',
                itemDescriptions: [],
                timestamp: now,
            });
        });

        const row = await this.getPlanRecordRowById(db, planId);
        if (!row) {
            throw new Error(`Expected created plan ${planId} to exist.`);
        }
        return this.hydratePlanRecord(db, row);
    }

    async getById(profileId: string, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const row = await db
            .selectFrom('plan_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', planId)
            .executeTakeFirst();

        return row ? this.hydratePlanRecord(db, row) : null;
    }

    async getLatestBySession(
        profileId: string,
        sessionId: EntityId<'sess'>,
        topLevelTab: TopLevelTab
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const row = await db
            .selectFrom('plan_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .where('top_level_tab', '=', topLevelTab)
            .orderBy('created_at', 'desc')
            .executeTakeFirst();

        return row ? this.hydratePlanRecord(db, row) : null;
    }

    async listItems(planId: EntityId<'plan'>): Promise<PlanItemRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_items')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanItemRecord);
    }

    async listRevisions(planId: EntityId<'plan'>): Promise<PlanRevisionRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_revisions')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('revision_number', 'asc')
            .execute();

        return rows.map(mapPlanRevisionRecord);
    }

    async listRevisionItems(planRevisionId: EntityId<'prev'>): Promise<PlanRevisionItemRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_revision_items')
            .selectAll()
            .where('plan_revision_id', '=', planRevisionId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanRevisionItemRecord);
    }

    async getRevisionById(planRevisionId: EntityId<'prev'>): Promise<PlanRevisionRecord | null> {
        const row = await this.getPlanRevisionRowById(this.getDb(), planRevisionId);
        return row ? mapPlanRevisionRecord(row) : null;
    }

    async getCurrentRevision(planId: EntityId<'plan'>): Promise<PlanRevisionRecord | null> {
        const row = await this.getPlanRecordRowById(this.getDb(), planId);
        if (!row) {
            return null;
        }

        return this.getRevisionById(parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev'));
    }

    async getApprovedRevision(planId: EntityId<'plan'>): Promise<PlanRevisionRecord | null> {
        const row = await this.getPlanRecordRowById(this.getDb(), planId);
        if (!row || !row.approved_revision_id) {
            return null;
        }

        return this.getRevisionById(parseEntityId(row.approved_revision_id, 'plan_records.approved_revision_id', 'prev'));
    }

    async resolveApprovedRevisionSnapshot(input: {
        planId: EntityId<'plan'>;
    }): Promise<{ revision: PlanRevisionRecord; items: PlanRevisionItemRecord[] } | null> {
        const revision = await this.getApprovedRevision(input.planId);
        if (!revision) {
            return null;
        }

        const items = await this.listRevisionItems(revision.id);
        return { revision, items };
    }

    async setAnswer(planId: EntityId<'plan'>, questionId: string, answer: string): Promise<PlanRecord | null> {
        const db = this.getDb();
        const row = await this.getPlanRecordRowById(db, planId);
        if (!row) {
            return null;
        }

        const now = nowIso();
        const questions = parsePlanQuestions(row);
        const rawAnswers = parseJsonValue(row.answers_json, {}, isJsonRecord);
        const answers: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawAnswers)) {
            if (typeof value === 'string') {
                answers[key] = value;
            }
        }
        answers[questionId] = answer;
        const hasUnanswered = hasUnansweredRequiredQuestions({
            questions,
            answers,
        });

        const updated = await db
            .updateTable('plan_records')
            .set({
                answers_json: JSON.stringify(answers),
                status: hasUnanswered ? 'awaiting_answers' : 'draft',
                updated_at: now,
            })
            .where('id', '=', planId)
            .returningAll()
            .executeTakeFirst();

        return updated ? this.hydratePlanRecord(db, updated) : null;
    }

    async revise(
        planId: EntityId<'plan'>,
        summaryMarkdown: string,
        descriptions: string[]
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const normalizedDescriptions = descriptions.map((description) => description.trim()).filter((description) => description.length > 0);

        const revisedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (!existing) {
                return null;
            }

            const currentRevision = await this.getPlanRevisionRowById(
                transaction,
                parseEntityId(existing.current_revision_id, 'plan_records.current_revision_id', 'prev')
            );
            if (!currentRevision) {
                throw new Error(`Missing current revision "${existing.current_revision_id}" for plan ${planId}.`);
            }

            const now = nowIso();
            const nextRevisionId = createEntityId('prev');
            const nextRevisionNumber = currentRevision.revision_number + 1;

            await transaction
                .updateTable('plan_revisions')
                .set({
                    superseded_at: now,
                })
                .where('id', '=', currentRevision.id)
                .where('superseded_at', 'is', null)
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                revisionId: nextRevisionId,
                revisionNumber: nextRevisionNumber,
                summaryMarkdown,
                createdByKind: 'revise',
                itemDescriptions: normalizedDescriptions,
                timestamp: now,
            });

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: nextRevisionId,
                    summary_markdown: summaryMarkdown,
                    status: 'draft',
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            await this.replaceLiveItemsInTransaction(transaction, planId, normalizedDescriptions, now);
            return planId;
        });

        if (!revisedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, revisedPlanId);
    }

    async approve(
        planId: EntityId<'plan'>,
        revisionId: EntityId<'prev'>,
        options?: {
            resetImplementationState?: boolean;
        }
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const approvedPlanId = await db.transaction().execute(async (transaction) => {
            const revisionRow = await this.getPlanRevisionRowById(transaction, revisionId);
            if (!revisionRow || revisionRow.plan_id !== planId) {
                return null;
            }

            const now = nowIso();
            const updated = await transaction
                .updateTable('plan_records')
                .set({
                    status: 'approved',
                    approved_revision_id: revisionId,
                    approved_at: now,
                    ...(options?.resetImplementationState
                        ? {
                              implementation_run_id: null,
                              orchestrator_run_id: null,
                              implemented_at: null,
                          }
                        : {}),
                    updated_at: now,
                })
                .where('id', '=', planId)
                .returning('id')
                .executeTakeFirst();

            return updated?.id ?? null;
        });

        if (!approvedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, parseEntityId(approvedPlanId, 'plan_records.id', 'plan'));
    }

    async resetItemsForFreshImplementation(planId: EntityId<'plan'>): Promise<PlanItemRecord[]> {
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

    async markImplementing(
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

    async markImplemented(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
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

    async markFailed(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
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

    async setItemStatus(
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

    private async getByIdFromDb(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const row = await this.getPlanRecordRowById(db, planId);
        return row ? this.hydratePlanRecord(db, row) : null;
    }
}

export const planStore = new PlanStore();

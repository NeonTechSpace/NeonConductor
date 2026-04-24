import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import {
    cancellablePlanStatuses,
    isOpenFollowUp,
    mapPlanAdvancedSnapshotRecord,
    mapPlanEvidenceAttachmentRecord,
    mapPlanFollowUpRecord,
    mapPlanItemRecord,
    mapPlanResearchBatchRecord,
    mapPlanResearchWorkerRecord,
    mapPlanRevisionItemRecord,
    mapPlanRevisionRecord,
    mapPlanVariantRecord,
    parsePlanAnswers,
    parsePlanQuestions,
    toPlanAdvancedSnapshotView,
} from '@/app/backend/persistence/stores/runtime/plan/planStoreInternals';
import type {
    PlanFollowUpRow,
    PlanRecordRow,
    PlanResearchBatchRow,
    PlanResearchWorkerRow,
    PlanRevisionAdvancedSnapshotRow,
    PlanRevisionRow,
    PlanStoreDb,
    PlanVariantRow,
} from '@/app/backend/persistence/stores/runtime/plan/planStoreInternals';
import {
    getProjectionById,
    resetItemsForFreshImplementation,
    markImplementing,
    markImplemented,
    markFailed,
    setItemStatus,
} from '@/app/backend/persistence/stores/runtime/plan/planStoreProjectionMethods';
import {
    createVariant,
    activateVariant,
    resumeFromRevision,
    raiseFollowUp,
    resolveFollowUp,
} from '@/app/backend/persistence/stores/runtime/plan/planStoreRecoveryMethods';
import {
    startResearchBatch,
    abortResearchBatch,
    markResearchWorkerRunning,
    recordResearchWorkerCompletion,
    recordResearchWorkerFailure,
} from '@/app/backend/persistence/stores/runtime/plan/planStoreResearchMethods';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { isJsonRecord, nowIso, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type {
    PlanEvidenceAttachmentRecord,
    PlanFollowUpRecord,
    PlanItemRecord,
    PlanQuestionRecord,
    PlanRecord,
    PlanResearchBatchRecord,
    PlanResearchWorkerRecord,
    PlanRevisionItemRecord,
    PlanRevisionRecord,
    PlanVariantRecord,
} from '@/app/backend/persistence/types';
import { planStatuses, topLevelTabs } from '@/app/backend/runtime/contracts';
import type {
    EntityId,
    PlanAdvancedSnapshotInput,
    PlanPlanningDepth,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { hasUnansweredRequiredQuestions } from '@/app/backend/runtime/services/plan/intake';

import type { Kysely } from 'kysely';

export class PlanStore {
    readonly startResearchBatch = startResearchBatch;
    readonly abortResearchBatch = abortResearchBatch;
    readonly markResearchWorkerRunning = markResearchWorkerRunning;
    readonly recordResearchWorkerCompletion = recordResearchWorkerCompletion;
    readonly recordResearchWorkerFailure = recordResearchWorkerFailure;
    readonly createVariant = createVariant;
    readonly activateVariant = activateVariant;
    readonly resumeFromRevision = resumeFromRevision;
    readonly raiseFollowUp = raiseFollowUp;
    readonly resolveFollowUp = resolveFollowUp;
    readonly getProjectionById = getProjectionById;
    readonly resetItemsForFreshImplementation = resetItemsForFreshImplementation;
    readonly markImplementing = markImplementing;
    readonly markImplemented = markImplemented;
    readonly markFailed = markFailed;
    readonly setItemStatus = setItemStatus;

    getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    async getPlanRecordRowById(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRecordRow | null> {
        return (await db.selectFrom('plan_records').selectAll().where('id', '=', planId).executeTakeFirst()) ?? null;
    }

    async getPlanRevisionRowById(db: PlanStoreDb, revisionId: EntityId<'prev'>): Promise<PlanRevisionRow | null> {
        return (
            (await db.selectFrom('plan_revisions').selectAll().where('id', '=', revisionId).executeTakeFirst()) ?? null
        );
    }

    async getPlanRevisionAdvancedSnapshotRowByRevisionId(
        db: PlanStoreDb,
        revisionId: EntityId<'prev'>
    ): Promise<PlanRevisionAdvancedSnapshotRow | null> {
        return (
            (await db
                .selectFrom('plan_revision_advanced_snapshots')
                .selectAll()
                .where('plan_revision_id', '=', revisionId)
                .executeTakeFirst()) ?? null
        );
    }

    async hydratePlanRevisionRecord(db: PlanStoreDb, row: PlanRevisionRow): Promise<PlanRevisionRecord> {
        const snapshotRow = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
            db,
            parseEntityId(row.id, 'plan_revisions.id', 'prev')
        );

        return {
            ...mapPlanRevisionRecord(row),
            ...(snapshotRow ? { advancedSnapshot: mapPlanAdvancedSnapshotRecord(snapshotRow) } : {}),
        };
    }

    async getPlanVariantRowById(db: PlanStoreDb, variantId: EntityId<'pvar'>): Promise<PlanVariantRow | null> {
        return (
            (await db.selectFrom('plan_variants').selectAll().where('id', '=', variantId).executeTakeFirst()) ?? null
        );
    }

    async getPlanFollowUpRowById(db: PlanStoreDb, followUpId: EntityId<'pfu'>): Promise<PlanFollowUpRow | null> {
        return (
            (await db.selectFrom('plan_follow_ups').selectAll().where('id', '=', followUpId).executeTakeFirst()) ?? null
        );
    }

    async getVariantHeadRevisionRow(
        db: PlanStoreDb,
        planId: EntityId<'plan'>,
        variantId: EntityId<'pvar'>
    ): Promise<PlanRevisionRow | null> {
        return (
            (await db
                .selectFrom('plan_revisions')
                .selectAll()
                .where('plan_id', '=', planId)
                .where('variant_id', '=', variantId)
                .orderBy('revision_number', 'desc')
                .executeTakeFirst()) ?? null
        );
    }

    async getLatestRevisionRowForPlan(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRevisionRow | null> {
        return (
            (await db
                .selectFrom('plan_revisions')
                .selectAll()
                .where('plan_id', '=', planId)
                .orderBy('revision_number', 'desc')
                .executeTakeFirst()) ?? null
        );
    }

    async listRevisionItemsInDb(db: PlanStoreDb, planRevisionId: EntityId<'prev'>): Promise<PlanRevisionItemRecord[]> {
        const rows = await db
            .selectFrom('plan_revision_items')
            .selectAll()
            .where('plan_revision_id', '=', planRevisionId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanRevisionItemRecord);
    }

    async getPlanResearchBatchRowById(db: PlanStoreDb, batchId: EntityId<'prb'>): Promise<PlanResearchBatchRow | null> {
        return (
            (await db.selectFrom('plan_research_batches').selectAll().where('id', '=', batchId).executeTakeFirst()) ??
            null
        );
    }

    async getPlanResearchWorkerRowById(
        db: PlanStoreDb,
        workerId: EntityId<'prw'>
    ): Promise<PlanResearchWorkerRow | null> {
        return (
            (await db.selectFrom('plan_research_workers').selectAll().where('id', '=', workerId).executeTakeFirst()) ??
            null
        );
    }

    async listResearchBatchesInDb(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanResearchBatchRecord[]> {
        const rows = await db
            .selectFrom('plan_research_batches')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanResearchBatchRecord);
    }

    async listResearchWorkersInDb(db: PlanStoreDb, batchIds: string[]): Promise<PlanResearchWorkerRecord[]> {
        if (batchIds.length === 0) {
            return [];
        }

        const rows = await db
            .selectFrom('plan_research_workers')
            .selectAll()
            .where('batch_id', 'in', batchIds)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanResearchWorkerRecord);
    }

    async listEvidenceAttachmentsInDb(
        db: PlanStoreDb,
        planRevisionId: EntityId<'prev'>
    ): Promise<PlanEvidenceAttachmentRecord[]> {
        const rows = await db
            .selectFrom('plan_revision_evidence_attachments')
            .selectAll()
            .where('plan_revision_id', '=', planRevisionId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanEvidenceAttachmentRecord);
    }

    async getActiveResearchBatchRowForRevision(
        db: PlanStoreDb,
        planRevisionId: EntityId<'prev'>
    ): Promise<PlanResearchBatchRow | null> {
        return (
            (await db
                .selectFrom('plan_research_batches')
                .selectAll()
                .where('plan_revision_id', '=', planRevisionId)
                .where('status', '=', 'running')
                .orderBy('created_at', 'desc')
                .executeTakeFirst()) ?? null
        );
    }

    async hydratePlanRecord(db: PlanStoreDb, row: PlanRecordRow): Promise<PlanRecord> {
        const currentRevisionRow = await this.getPlanRevisionRowById(
            db,
            parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev')
        );
        if (!currentRevisionRow) {
            throw new Error(`Missing current revision "${row.current_revision_id}" for plan ${row.id}.`);
        }
        const currentRevision = await this.hydratePlanRevisionRecord(db, currentRevisionRow);

        const approvedRevisionRow = row.approved_revision_id
            ? await this.getPlanRevisionRowById(
                  db,
                  parseEntityId(row.approved_revision_id, 'plan_records.approved_revision_id', 'prev')
              )
            : null;
        const approvedRevision = approvedRevisionRow
            ? await this.hydratePlanRevisionRecord(db, approvedRevisionRow)
            : null;
        const advancedSnapshot = currentRevision.advancedSnapshot
            ? toPlanAdvancedSnapshotView(currentRevision.advancedSnapshot)
            : undefined;

        return {
            id: parseEntityId(row.id, 'plan_records.id', 'plan'),
            profileId: row.profile_id,
            sessionId: parseEntityId(row.session_id, 'plan_records.session_id', 'sess'),
            topLevelTab: parseEnumValue(row.top_level_tab, 'plan_records.top_level_tab', topLevelTabs),
            modeKey: row.mode_key,
            planningDepth: parseEnumValue(row.planning_depth, 'plan_records.planning_depth', ['simple', 'advanced']),
            status: parseEnumValue(row.status, 'plan_records.status', planStatuses),
            sourcePrompt: row.source_prompt,
            summaryMarkdown: row.summary_markdown,
            ...(advancedSnapshot ? { advancedSnapshot } : {}),
            questions: parsePlanQuestions(row),
            answers: parsePlanAnswers(row),
            currentRevisionId: parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev'),
            currentRevisionNumber: currentRevision.revisionNumber,
            currentVariantId: parseEntityId(row.current_variant_id, 'plan_records.current_variant_id', 'pvar'),
            ...(row.approved_revision_id
                ? {
                      approvedRevisionId: parseEntityId(
                          row.approved_revision_id,
                          'plan_records.approved_revision_id',
                          'prev'
                      ),
                  }
                : {}),
            ...(approvedRevision ? { approvedRevisionNumber: approvedRevision.revisionNumber } : {}),
            ...(row.approved_variant_id
                ? {
                      approvedVariantId: parseEntityId(
                          row.approved_variant_id,
                          'plan_records.approved_variant_id',
                          'pvar'
                      ),
                  }
                : {}),
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
                ? {
                      orchestratorRunId: parseEntityId(
                          row.orchestrator_run_id,
                          'plan_records.orchestrator_run_id',
                          'orch'
                      ),
                  }
                : {}),
            ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
            ...(row.implemented_at ? { implementedAt: row.implemented_at } : {}),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async insertRevisionInTransaction(
        db: PlanStoreDb,
        input: {
            planId: EntityId<'plan'>;
            variantId: EntityId<'pvar'>;
            revisionId: EntityId<'prev'>;
            revisionNumber: number;
            summaryMarkdown: string;
            createdByKind: PlanRevisionRecord['createdByKind'];
            previousRevisionId?: EntityId<'prev'>;
            itemDescriptions: string[];
            timestamp: string;
            advancedSnapshot?: PlanAdvancedSnapshotInput;
            copyResearchAttachmentsFromRevisionId?: EntityId<'prev'>;
        }
    ): Promise<void> {
        await db
            .insertInto('plan_revisions')
            .values({
                id: input.revisionId,
                plan_id: input.planId,
                variant_id: input.variantId,
                revision_number: input.revisionNumber,
                summary_markdown: input.summaryMarkdown,
                created_by_kind: input.createdByKind,
                created_at: input.timestamp,
                previous_revision_id: input.previousRevisionId ?? null,
                superseded_at: null,
            })
            .execute();

        if (input.advancedSnapshot) {
            await db
                .insertInto('plan_revision_advanced_snapshots')
                .values({
                    plan_revision_id: input.revisionId,
                    evidence_markdown: input.advancedSnapshot.evidenceMarkdown,
                    observations_markdown: input.advancedSnapshot.observationsMarkdown,
                    root_cause_markdown: input.advancedSnapshot.rootCauseMarkdown,
                    phases_json: JSON.stringify(input.advancedSnapshot.phases),
                    created_at: input.timestamp,
                })
                .execute();
        }

        if (input.itemDescriptions.length === 0) {
            if (input.copyResearchAttachmentsFromRevisionId) {
                await this.copyResearchAttachmentsBetweenRevisionsInTransaction(db, {
                    sourceRevisionId: input.copyResearchAttachmentsFromRevisionId,
                    targetRevisionId: input.revisionId,
                    timestamp: input.timestamp,
                });
            }
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

        if (input.copyResearchAttachmentsFromRevisionId) {
            await this.copyResearchAttachmentsBetweenRevisionsInTransaction(db, {
                sourceRevisionId: input.copyResearchAttachmentsFromRevisionId,
                targetRevisionId: input.revisionId,
                timestamp: input.timestamp,
            });
        }
    }

    async copyResearchAttachmentsBetweenRevisionsInTransaction(
        db: PlanStoreDb,
        input: {
            sourceRevisionId: EntityId<'prev'>;
            targetRevisionId: EntityId<'prev'>;
            timestamp: string;
        }
    ): Promise<void> {
        const sourceAttachments = await this.listEvidenceAttachmentsInDb(db, input.sourceRevisionId);
        if (sourceAttachments.length === 0) {
            return;
        }

        await db
            .insertInto('plan_revision_evidence_attachments')
            .values(
                sourceAttachments.map((attachment) => ({
                    id: createEntityId('pea'),
                    plan_revision_id: input.targetRevisionId,
                    source_kind: attachment.sourceKind,
                    research_batch_id: attachment.researchBatchId,
                    research_worker_id: attachment.researchWorkerId,
                    label: attachment.label,
                    summary_markdown: attachment.summaryMarkdown,
                    details_markdown: attachment.detailsMarkdown,
                    child_thread_id: attachment.childThreadId ?? null,
                    child_session_id: attachment.childSessionId ?? null,
                    created_at: input.timestamp,
                }))
            )
            .execute();
    }

    async settleResearchBatchStatusInTransaction(
        db: PlanStoreDb,
        batchId: EntityId<'prb'>,
        timestamp: string
    ): Promise<void> {
        const rows = await db
            .selectFrom('plan_research_workers')
            .select(['status'])
            .where('batch_id', '=', batchId)
            .execute();

        if (rows.some((row) => row.status === 'queued' || row.status === 'running')) {
            return;
        }

        const statuses = rows.map((row) => row.status);
        const nextStatus = statuses.some((status) => status === 'failed')
            ? 'failed'
            : statuses.every((status) => status === 'aborted')
              ? 'aborted'
              : 'completed';

        await db
            .updateTable('plan_research_batches')
            .set(
                nextStatus === 'aborted'
                    ? {
                          status: nextStatus,
                          aborted_at: timestamp,
                      }
                    : {
                          status: nextStatus,
                          completed_at: timestamp,
                      }
            )
            .where('id', '=', batchId)
            .execute();
    }

    async replaceLiveItemsInTransaction(
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
        planningDepth?: PlanPlanningDepth;
        sourcePrompt: string;
        summaryMarkdown: string;
        questions: PlanQuestionRecord[];
        advancedSnapshot?: PlanAdvancedSnapshotInput;
        workspaceFingerprint?: string;
    }): Promise<PlanRecord> {
        const db = this.getDb();
        const now = nowIso();
        const planId = createEntityId('plan');
        const revisionId = createEntityId('prev');
        const variantId = createEntityId('pvar');

        await db.transaction().execute(async (transaction) => {
            await transaction
                .insertInto('plan_records')
                .values({
                    id: planId,
                    profile_id: input.profileId,
                    session_id: input.sessionId,
                    top_level_tab: input.topLevelTab,
                    mode_key: input.modeKey,
                    planning_depth: input.planningDepth ?? 'simple',
                    status: input.questions.length > 0 ? 'awaiting_answers' : 'draft',
                    source_prompt: input.sourcePrompt,
                    summary_markdown: input.summaryMarkdown,
                    questions_json: JSON.stringify(input.questions),
                    answers_json: JSON.stringify({}),
                    current_revision_id: revisionId,
                    current_variant_id: variantId,
                    approved_revision_id: null,
                    approved_variant_id: null,
                    workspace_fingerprint: input.workspaceFingerprint ?? null,
                    implementation_run_id: null,
                    orchestrator_run_id: null,
                    approved_at: null,
                    implemented_at: null,
                    created_at: now,
                    updated_at: now,
                })
                .execute();

            await transaction
                .insertInto('plan_variants')
                .values({
                    id: variantId,
                    plan_id: planId,
                    name: 'main',
                    created_from_revision_id: null,
                    created_at: now,
                    archived_at: null,
                })
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                variantId,
                revisionId,
                revisionNumber: 1,
                summaryMarkdown: input.summaryMarkdown,
                createdByKind: 'start',
                itemDescriptions: [],
                timestamp: now,
                ...(input.advancedSnapshot ? { advancedSnapshot: input.advancedSnapshot } : {}),
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

    async listVariants(planId: EntityId<'plan'>): Promise<PlanVariantRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_variants')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanVariantRecord);
    }

    async listFollowUps(planId: EntityId<'plan'>): Promise<PlanFollowUpRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_follow_ups')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanFollowUpRecord);
    }

    async listOpenFollowUps(planId: EntityId<'plan'>): Promise<PlanFollowUpRecord[]> {
        return (await this.listFollowUps(planId)).filter(isOpenFollowUp);
    }

    async getVariantById(planVariantId: EntityId<'pvar'>): Promise<PlanVariantRecord | null> {
        const row = await this.getPlanVariantRowById(this.getDb(), planVariantId);
        return row ? mapPlanVariantRecord(row) : null;
    }

    async getFollowUpById(planFollowUpId: EntityId<'pfu'>): Promise<PlanFollowUpRecord | null> {
        const row = await this.getPlanFollowUpRowById(this.getDb(), planFollowUpId);
        return row ? mapPlanFollowUpRecord(row) : null;
    }

    async listResearchBatches(planId: EntityId<'plan'>): Promise<PlanResearchBatchRecord[]> {
        return this.listResearchBatchesInDb(this.getDb(), planId);
    }

    async listResearchWorkers(researchBatchId: EntityId<'prb'>): Promise<PlanResearchWorkerRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_research_workers')
            .selectAll()
            .where('batch_id', '=', researchBatchId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanResearchWorkerRecord);
    }

    async listEvidenceAttachments(planRevisionId: EntityId<'prev'>): Promise<PlanEvidenceAttachmentRecord[]> {
        return this.listEvidenceAttachmentsInDb(this.getDb(), planRevisionId);
    }

    async getResearchBatchById(researchBatchId: EntityId<'prb'>): Promise<PlanResearchBatchRecord | null> {
        const row = await this.getPlanResearchBatchRowById(this.getDb(), researchBatchId);
        return row ? mapPlanResearchBatchRecord(row) : null;
    }

    async getResearchWorkerById(researchWorkerId: EntityId<'prw'>): Promise<PlanResearchWorkerRecord | null> {
        const row = await this.getPlanResearchWorkerRowById(this.getDb(), researchWorkerId);
        return row ? mapPlanResearchWorkerRecord(row) : null;
    }

    async getActiveResearchBatchByRevision(planRevisionId: EntityId<'prev'>): Promise<PlanResearchBatchRecord | null> {
        const row = await this.getActiveResearchBatchRowForRevision(this.getDb(), planRevisionId);
        return row ? mapPlanResearchBatchRecord(row) : null;
    }

    async listRevisions(planId: EntityId<'plan'>): Promise<PlanRevisionRecord[]> {
        const db = this.getDb();
        const rows = await db
            .selectFrom('plan_revisions')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('revision_number', 'asc')
            .execute();

        return Promise.all(rows.map((row) => this.hydratePlanRevisionRecord(db, row)));
    }

    async listRevisionItems(planRevisionId: EntityId<'prev'>): Promise<PlanRevisionItemRecord[]> {
        return this.listRevisionItemsInDb(this.getDb(), planRevisionId);
    }

    async getRevisionById(planRevisionId: EntityId<'prev'>): Promise<PlanRevisionRecord | null> {
        const db = this.getDb();
        const row = await this.getPlanRevisionRowById(db, planRevisionId);
        return row ? this.hydratePlanRevisionRecord(db, row) : null;
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

        return this.getRevisionById(
            parseEntityId(row.approved_revision_id, 'plan_records.approved_revision_id', 'prev')
        );
    }

    async resolveApprovedRevisionSnapshot(input: { planId: EntityId<'plan'> }): Promise<{
        revision: PlanRevisionRecord;
        items: PlanRevisionItemRecord[];
        advancedSnapshot?: PlanRevisionRecord['advancedSnapshot'];
    } | null> {
        const revision = await this.getApprovedRevision(input.planId);
        if (!revision) {
            return null;
        }

        const items = await this.listRevisionItems(revision.id);
        return {
            revision,
            items,
            ...(revision.advancedSnapshot ? { advancedSnapshot: revision.advancedSnapshot } : {}),
        };
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
        descriptions: string[],
        options?: {
            advancedSnapshot?: PlanAdvancedSnapshotInput;
        }
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const normalizedDescriptions = descriptions
            .map((description) => description.trim())
            .filter((description) => description.length > 0);

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

            const currentAdvancedSnapshot = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
                transaction,
                parseEntityId(currentRevision.id, 'plan_revisions.id', 'prev')
            );
            const isAdvancedPlan =
                parseEnumValue(existing.planning_depth, 'plan_records.planning_depth', ['simple', 'advanced']) ===
                'advanced';
            if (options?.advancedSnapshot && !isAdvancedPlan) {
                return null;
            }

            const now = nowIso();
            const nextRevisionId = createEntityId('prev');
            const nextRevisionNumber = currentRevision.revision_number + 1;
            const revisionAdvancedSnapshot =
                options?.advancedSnapshot ??
                (currentAdvancedSnapshot ? mapPlanAdvancedSnapshotRecord(currentAdvancedSnapshot) : undefined);

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
                variantId: parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar'),
                revisionId: nextRevisionId,
                revisionNumber: nextRevisionNumber,
                summaryMarkdown,
                createdByKind: 'revise',
                previousRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                itemDescriptions: normalizedDescriptions,
                timestamp: now,
                copyResearchAttachmentsFromRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                ...(revisionAdvancedSnapshot ? { advancedSnapshot: revisionAdvancedSnapshot } : {}),
            });

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: nextRevisionId,
                    summary_markdown: summaryMarkdown,
                    status: isAdvancedPlan && existing.status === 'awaiting_answers' ? 'awaiting_answers' : 'draft',
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

    async enterAdvancedPlanning(
        planId: EntityId<'plan'>,
        advancedSnapshot: PlanAdvancedSnapshotInput
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const advancedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (!existing) {
                return null;
            }

            if (
                parseEnumValue(existing.status, 'plan_records.status', planStatuses) === 'implementing' ||
                parseEnumValue(existing.planning_depth, 'plan_records.planning_depth', ['simple', 'advanced']) ===
                    'advanced'
            ) {
                return null;
            }

            const currentRevision = await this.getPlanRevisionRowById(
                transaction,
                parseEntityId(existing.current_revision_id, 'plan_records.current_revision_id', 'prev')
            );
            if (!currentRevision) {
                throw new Error(`Missing current revision "${existing.current_revision_id}" for plan ${planId}.`);
            }

            const currentRevisionItems = await this.listRevisionItemsInDb(
                transaction,
                parseEntityId(currentRevision.id, 'plan_revisions.id', 'prev')
            );
            const now = nowIso();
            const nextRevisionId = createEntityId('prev');
            const nextRevisionNumber = currentRevision.revision_number + 1;
            const nextStatus = existing.status === 'awaiting_answers' ? 'awaiting_answers' : 'draft';

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
                variantId: parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar'),
                revisionId: nextRevisionId,
                revisionNumber: nextRevisionNumber,
                summaryMarkdown: currentRevision.summary_markdown,
                createdByKind: 'revise',
                previousRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                itemDescriptions: currentRevisionItems.map((item) => item.description),
                timestamp: now,
                copyResearchAttachmentsFromRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                advancedSnapshot: advancedSnapshot,
            });

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: nextRevisionId,
                    summary_markdown: currentRevision.summary_markdown,
                    planning_depth: 'advanced',
                    status: nextStatus,
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            await this.replaceLiveItemsInTransaction(
                transaction,
                planId,
                currentRevisionItems.map((item) => item.description),
                now
            );

            return planId;
        });

        if (!advancedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, parseEntityId(advancedPlanId, 'plan_records.id', 'plan'));
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
                    approved_variant_id: parseEntityId(revisionRow.variant_id, 'plan_revisions.variant_id', 'pvar'),
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

    async cancel(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const cancelledPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (
                !existing ||
                !cancellablePlanStatuses.has(parseEnumValue(existing.status, 'plan_records.status', planStatuses))
            ) {
                return null;
            }

            const now = nowIso();
            const updated = await transaction
                .updateTable('plan_records')
                .set({
                    status: 'cancelled',
                    updated_at: now,
                })
                .where('id', '=', planId)
                .returning('id')
                .executeTakeFirst();

            return updated?.id ?? null;
        });

        if (!cancelledPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, parseEntityId(cancelledPlanId, 'plan_records.id', 'plan'));
    }

    async getByIdFromDb(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const row = await this.getPlanRecordRowById(db, planId);
        return row ? this.hydratePlanRecord(db, row) : null;
    }
}

export const planStore = new PlanStore();

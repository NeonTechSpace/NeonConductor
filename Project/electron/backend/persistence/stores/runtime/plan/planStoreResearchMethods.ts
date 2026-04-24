import type { PlanStore } from '@/app/backend/persistence/stores/runtime/planStore';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { PlanResearchBatchRecord, PlanResearchWorkerRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

export async function startResearchBatch(
    this: PlanStore,
    input: {
        planId: EntityId<'plan'>;
        planRevisionId: EntityId<'prev'>;
        variantId: EntityId<'pvar'>;
        promptMarkdown: string;
        requestedWorkerCount: number;
        recommendedWorkerCount: number;
        hardMaxWorkerCount: number;
        workers: Array<{
            sequence: number;
            label: string;
            promptMarkdown: string;
        }>;
    }
): Promise<PlanResearchBatchRecord | null> {
    const db = this.getDb();
    const batchId = createEntityId('prb');
    const now = nowIso();

    const createdBatchId = await db.transaction().execute(async (transaction) => {
        const existing = await this.getPlanRecordRowById(transaction, input.planId);
        if (!existing) {
            return null;
        }

        if (existing.current_revision_id !== input.planRevisionId) {
            return null;
        }

        const activeBatch = await this.getActiveResearchBatchRowForRevision(transaction, input.planRevisionId);
        if (activeBatch) {
            return null;
        }

        await transaction
            .insertInto('plan_research_batches')
            .values({
                id: batchId,
                plan_id: input.planId,
                plan_revision_id: input.planRevisionId,
                variant_id: input.variantId,
                prompt_markdown: input.promptMarkdown,
                requested_worker_count: input.requestedWorkerCount,
                recommended_worker_count: input.recommendedWorkerCount,
                hard_max_worker_count: input.hardMaxWorkerCount,
                status: 'running',
                created_at: now,
                completed_at: null,
                aborted_at: null,
            })
            .execute();

        await transaction
            .insertInto('plan_research_workers')
            .values(
                input.workers.map((worker) => ({
                    id: createEntityId('prw'),
                    batch_id: batchId,
                    sequence: worker.sequence,
                    label: worker.label,
                    prompt_markdown: worker.promptMarkdown,
                    status: 'queued',
                    child_thread_id: null,
                    child_session_id: null,
                    active_run_id: null,
                    run_id: null,
                    result_summary_markdown: null,
                    result_details_markdown: null,
                    error_message: null,
                    created_at: now,
                    completed_at: null,
                    aborted_at: null,
                }))
            )
            .execute();

        await transaction
            .updateTable('plan_records')
            .set({
                updated_at: now,
            })
            .where('id', '=', input.planId)
            .execute();

        return batchId;
    });

    if (!createdBatchId) {
        return null;
    }

    return this.getResearchBatchById(createdBatchId);
}

export async function abortResearchBatch(
    this: PlanStore,
    planId: EntityId<'plan'>,
    researchBatchId: EntityId<'prb'>
): Promise<PlanResearchBatchRecord | null> {
    const db = this.getDb();
    const abortedBatchId = await db.transaction().execute(async (transaction) => {
        const batchRow = await this.getPlanResearchBatchRowById(transaction, researchBatchId);
        if (!batchRow || batchRow.plan_id !== planId || batchRow.status !== 'running') {
            return null;
        }

        const now = nowIso();

        await transaction
            .updateTable('plan_research_workers')
            .set({
                status: 'aborted',
                aborted_at: now,
            })
            .where('batch_id', '=', researchBatchId)
            .where('status', 'in', ['queued', 'running'])
            .execute();

        await transaction
            .updateTable('plan_research_batches')
            .set({
                status: 'aborted',
                aborted_at: now,
            })
            .where('id', '=', researchBatchId)
            .execute();

        await transaction
            .updateTable('plan_records')
            .set({
                updated_at: now,
            })
            .where('id', '=', planId)
            .execute();

        return researchBatchId;
    });

    if (!abortedBatchId) {
        return null;
    }

    return this.getResearchBatchById(abortedBatchId);
}

export async function markResearchWorkerRunning(
    this: PlanStore,
    input: {
        researchBatchId: EntityId<'prb'>;
        researchWorkerId: EntityId<'prw'>;
        childThreadId: EntityId<'thr'>;
        childSessionId: EntityId<'sess'>;
        activeRunId: EntityId<'run'>;
    }
): Promise<PlanResearchWorkerRecord | null> {
    const db = this.getDb();
    const runningWorkerId = await db.transaction().execute(async (transaction) => {
        const batchRow = await this.getPlanResearchBatchRowById(transaction, input.researchBatchId);
        if (!batchRow || batchRow.status !== 'running') {
            return null;
        }

        const workerRow = await this.getPlanResearchWorkerRowById(transaction, input.researchWorkerId);
        if (!workerRow || workerRow.batch_id !== input.researchBatchId) {
            return null;
        }

        const now = nowIso();
        const updatedWorker = await transaction
            .updateTable('plan_research_workers')
            .set({
                status: 'running',
                child_thread_id: input.childThreadId,
                child_session_id: input.childSessionId,
                active_run_id: input.activeRunId,
                run_id: null,
                error_message: null,
                completed_at: null,
                aborted_at: null,
            })
            .where('id', '=', input.researchWorkerId)
            .where('status', '=', 'queued')
            .returning('id')
            .executeTakeFirst();
        if (!updatedWorker) {
            return null;
        }

        await transaction
            .updateTable('plan_records')
            .set({
                updated_at: now,
            })
            .where('id', '=', batchRow.plan_id)
            .execute();

        return input.researchWorkerId;
    });

    if (!runningWorkerId) {
        return null;
    }

    return this.getResearchWorkerById(runningWorkerId);
}

export async function recordResearchWorkerCompletion(
    this: PlanStore,
    input: {
        researchBatchId: EntityId<'prb'>;
        researchWorkerId: EntityId<'prw'>;
        resultSummaryMarkdown: string;
        resultDetailsMarkdown: string;
        childThreadId?: EntityId<'thr'>;
        childSessionId?: EntityId<'sess'>;
        activeRunId?: EntityId<'run'>;
        runId?: EntityId<'run'>;
    }
): Promise<PlanResearchWorkerRecord | null> {
    const db = this.getDb();
    const completedWorkerId = await db.transaction().execute(async (transaction) => {
        const batchRow = await this.getPlanResearchBatchRowById(transaction, input.researchBatchId);
        if (!batchRow || batchRow.status === 'aborted') {
            return null;
        }

        const workerRow = await this.getPlanResearchWorkerRowById(transaction, input.researchWorkerId);
        if (!workerRow || workerRow.batch_id !== input.researchBatchId) {
            return null;
        }

        const now = nowIso();
        const updatedWorker = await transaction
            .updateTable('plan_research_workers')
            .set({
                status: 'completed',
                ...(input.childThreadId ? { child_thread_id: input.childThreadId } : {}),
                ...(input.childSessionId ? { child_session_id: input.childSessionId } : {}),
                ...(input.activeRunId ? { active_run_id: input.activeRunId } : {}),
                ...(input.runId ? { run_id: input.runId } : {}),
                result_summary_markdown: input.resultSummaryMarkdown,
                result_details_markdown: input.resultDetailsMarkdown,
                error_message: null,
                completed_at: now,
                aborted_at: null,
            })
            .where('id', '=', input.researchWorkerId)
            .where('status', 'in', ['queued', 'running'])
            .returning('id')
            .executeTakeFirst();
        if (!updatedWorker) {
            return null;
        }

        await transaction
            .insertInto('plan_revision_evidence_attachments')
            .values({
                id: createEntityId('pea'),
                plan_revision_id: parseEntityId(
                    batchRow.plan_revision_id,
                    'plan_research_batches.plan_revision_id',
                    'prev'
                ),
                source_kind: 'planner_worker',
                research_batch_id: input.researchBatchId,
                research_worker_id: input.researchWorkerId,
                label: workerRow.label,
                summary_markdown: input.resultSummaryMarkdown,
                details_markdown: input.resultDetailsMarkdown,
                ...(input.childThreadId ? { child_thread_id: input.childThreadId } : { child_thread_id: null }),
                ...(input.childSessionId ? { child_session_id: input.childSessionId } : { child_session_id: null }),
                created_at: now,
            })
            .execute();

        await this.settleResearchBatchStatusInTransaction(transaction, input.researchBatchId, now);

        await transaction
            .updateTable('plan_records')
            .set({
                updated_at: now,
            })
            .where('id', '=', batchRow.plan_id)
            .execute();

        return input.researchWorkerId;
    });

    if (!completedWorkerId) {
        return null;
    }

    return this.getResearchWorkerById(completedWorkerId);
}

export async function recordResearchWorkerFailure(
    this: PlanStore,
    input: {
        researchBatchId: EntityId<'prb'>;
        researchWorkerId: EntityId<'prw'>;
        errorMessage: string;
        childThreadId?: EntityId<'thr'>;
        childSessionId?: EntityId<'sess'>;
        activeRunId?: EntityId<'run'>;
        runId?: EntityId<'run'>;
    }
): Promise<PlanResearchWorkerRecord | null> {
    const db = this.getDb();
    const failedWorkerId = await db.transaction().execute(async (transaction) => {
        const batchRow = await this.getPlanResearchBatchRowById(transaction, input.researchBatchId);
        if (!batchRow || batchRow.status === 'aborted') {
            return null;
        }

        const workerRow = await this.getPlanResearchWorkerRowById(transaction, input.researchWorkerId);
        if (!workerRow || workerRow.batch_id !== input.researchBatchId) {
            return null;
        }

        const now = nowIso();
        const updatedWorker = await transaction
            .updateTable('plan_research_workers')
            .set({
                status: 'failed',
                ...(input.childThreadId ? { child_thread_id: input.childThreadId } : {}),
                ...(input.childSessionId ? { child_session_id: input.childSessionId } : {}),
                ...(input.activeRunId ? { active_run_id: input.activeRunId } : {}),
                ...(input.runId ? { run_id: input.runId } : {}),
                error_message: input.errorMessage,
                result_summary_markdown: null,
                result_details_markdown: null,
                completed_at: now,
                aborted_at: null,
            })
            .where('id', '=', input.researchWorkerId)
            .where('status', 'in', ['queued', 'running'])
            .returning('id')
            .executeTakeFirst();
        if (!updatedWorker) {
            return null;
        }

        await this.settleResearchBatchStatusInTransaction(transaction, input.researchBatchId, now);

        await transaction
            .updateTable('plan_records')
            .set({
                updated_at: now,
            })
            .where('id', '=', batchRow.plan_id)
            .execute();

        return input.researchWorkerId;
    });

    if (!failedWorkerId) {
        return null;
    }

    return this.getResearchWorkerById(failedWorkerId);
}

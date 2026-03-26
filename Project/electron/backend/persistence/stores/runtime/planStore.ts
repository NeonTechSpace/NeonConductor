import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import {
    isJsonRecord,
    isJsonUnknownArray,
    nowIso,
    parseJsonValue,
} from '@/app/backend/persistence/stores/shared/utils';
import type { PlanItemRecord, PlanQuestionRecord, PlanRecord } from '@/app/backend/persistence/types';
import { planItemStatuses, planStatuses, topLevelTabs } from '@/app/backend/runtime/contracts';
import type { EntityId, TopLevelTab } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

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
    return typeof id === 'string' && typeof question === 'string';
}

function mapPlanRecord(row: {
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
    workspace_fingerprint: string | null;
    implementation_run_id: string | null;
    orchestrator_run_id: string | null;
    approved_at: string | null;
    implemented_at: string | null;
    created_at: string;
    updated_at: string;
}): PlanRecord {
    const rawQuestions = parseJsonValue(row.questions_json, [], isJsonUnknownArray);
    const questions = rawQuestions.filter(isPlanQuestionRecord);

    const rawAnswers = parseJsonRecord(row.answers_json);
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawAnswers)) {
        if (typeof value === 'string') {
            answers[key] = value;
        }
    }

    return {
        id: parseEntityId(row.id, 'plan_records.id', 'plan'),
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'plan_records.session_id', 'sess'),
        topLevelTab: parseEnumValue(row.top_level_tab, 'plan_records.top_level_tab', topLevelTabs),
        modeKey: row.mode_key,
        status: parseEnumValue(row.status, 'plan_records.status', planStatuses),
        sourcePrompt: row.source_prompt,
        summaryMarkdown: row.summary_markdown,
        questions,
        answers,
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
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('plan');

        await db
            .insertInto('plan_records')
            .values({
                id,
                profile_id: input.profileId,
                session_id: input.sessionId,
                top_level_tab: input.topLevelTab,
                mode_key: input.modeKey,
                status: input.questions.length > 0 ? 'awaiting_answers' : 'draft',
                source_prompt: input.sourcePrompt,
                summary_markdown: input.summaryMarkdown,
                questions_json: JSON.stringify(input.questions),
                answers_json: JSON.stringify({}),
                workspace_fingerprint: input.workspaceFingerprint ?? null,
                implementation_run_id: null,
                orchestrator_run_id: null,
                approved_at: null,
                implemented_at: null,
                created_at: now,
                updated_at: now,
            })
            .execute();

        const row = await db.selectFrom('plan_records').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
        return mapPlanRecord(row);
    }

    async getById(profileId: string, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('plan_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', planId)
            .executeTakeFirst();

        return row ? mapPlanRecord(row) : null;
    }

    async getLatestBySession(
        profileId: string,
        sessionId: EntityId<'sess'>,
        topLevelTab: TopLevelTab
    ): Promise<PlanRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('plan_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .where('top_level_tab', '=', topLevelTab)
            .orderBy('created_at', 'desc')
            .executeTakeFirst();

        return row ? mapPlanRecord(row) : null;
    }

    async listItems(planId: EntityId<'plan'>): Promise<PlanItemRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('plan_items')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanItemRecord);
    }

    async replaceItems(planId: EntityId<'plan'>, descriptions: string[]): Promise<PlanItemRecord[]> {
        const { db } = getPersistence();
        const now = nowIso();

        await db.deleteFrom('plan_items').where('plan_id', '=', planId).execute();
        if (descriptions.length === 0) {
            return [];
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
                    created_at: now,
                    updated_at: now,
                }))
            )
            .execute();

        return this.listItems(planId);
    }

    async setAnswer(planId: EntityId<'plan'>, questionId: string, answer: string): Promise<PlanRecord | null> {
        const { db } = getPersistence();
        const row = await db.selectFrom('plan_records').selectAll().where('id', '=', planId).executeTakeFirst();
        if (!row) {
            return null;
        }

        const now = nowIso();
        const questions = parseJsonValue(row.questions_json, [], isJsonUnknownArray).filter(isPlanQuestionRecord);
        const rawAnswers = parseJsonValue(row.answers_json, {}, isJsonRecord);
        const answers: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawAnswers)) {
            if (typeof value === 'string') {
                answers[key] = value;
            }
        }
        answers[questionId] = answer;
        const hasUnanswered = questions.some((question) => {
            const response = answers[question.id];
            return typeof response !== 'string' || response.trim().length === 0;
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

        return updated ? mapPlanRecord(updated) : null;
    }

    async revise(planId: EntityId<'plan'>, summaryMarkdown: string): Promise<PlanRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const updated = await db
            .updateTable('plan_records')
            .set({
                summary_markdown: summaryMarkdown,
                status: 'draft',
                updated_at: now,
            })
            .where('id', '=', planId)
            .returningAll()
            .executeTakeFirst();

        return updated ? mapPlanRecord(updated) : null;
    }

    async approve(
        planId: EntityId<'plan'>,
        options?: {
            resetImplementationState?: boolean;
        }
    ): Promise<PlanRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const updated = await db
            .updateTable('plan_records')
            .set({
                status: 'approved',
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
            .returningAll()
            .executeTakeFirst();

        return updated ? mapPlanRecord(updated) : null;
    }

    async resetItemsForFreshImplementation(planId: EntityId<'plan'>): Promise<PlanItemRecord[]> {
        const { db } = getPersistence();
        const now = nowIso();

        await db
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
        const { db } = getPersistence();
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

        return updated ? mapPlanRecord(updated) : null;
    }

    async markImplemented(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const { db } = getPersistence();
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

        return updated ? mapPlanRecord(updated) : null;
    }

    async markFailed(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const { db } = getPersistence();
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

        return updated ? mapPlanRecord(updated) : null;
    }

    async setItemStatus(
        itemId: EntityId<'step'>,
        status: PlanItemRecord['status'],
        runId?: EntityId<'run'>,
        errorMessage?: string
    ): Promise<PlanItemRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const updated = await db
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
}

export const planStore = new PlanStore();

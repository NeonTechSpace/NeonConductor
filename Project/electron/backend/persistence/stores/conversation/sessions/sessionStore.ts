import { getPersistence } from '@/app/backend/persistence/db';
import type { RunsTable, SessionsTable } from '@/app/backend/persistence/schema';
import { threadStore } from '@/app/backend/persistence/stores/conversation/threads/threadStore';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';
import { runStatuses, sessionKinds } from '@/app/backend/runtime/contracts';
import type { EntityId, RunStatus, SessionKind } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

import type { Selectable } from 'kysely';

type SessionRow = Selectable<SessionsTable>;
type RunRow = Selectable<RunsTable>;
type SessionSummaryRow = SessionRow & { turn_count: number | null };

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
    return allowed.some((candidate) => candidate === value);
}

function parseRunStatus(value: string): RunStatus {
    if (isOneOf(value, runStatuses)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid session run status in persistence row: "${value}".`);
}

function mapSessionSummary(row: SessionRow, turnCount: number): SessionSummaryRecord {
    return {
        id: parseEntityId(row.id, 'sessions.id', 'sess'),
        profileId: row.profile_id,
        conversationId: row.conversation_id,
        threadId: row.thread_id,
        kind: parseEnumValue(row.kind, 'sessions.kind', sessionKinds),
        ...(row.sandbox_id ? { sandboxId: parseEntityId(row.sandbox_id, 'sessions.sandbox_id', 'sb') } : {}),
        ...(row.delegated_from_orchestrator_run_id
            ? {
                  delegatedFromOrchestratorRunId: parseEntityId(
                      row.delegated_from_orchestrator_run_id,
                      'sessions.delegated_from_orchestrator_run_id',
                      'orch'
                  ),
              }
            : {}),
        ...(row.delegated_from_plan_research_batch_id
            ? {
                  delegatedFromPlanResearchBatchId: parseEntityId(
                      row.delegated_from_plan_research_batch_id,
                      'sessions.delegated_from_plan_research_batch_id',
                      'prb'
                  ),
              }
            : {}),
        runStatus: parseRunStatus(row.run_status),
        turnCount,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapRunStatusToSessionStatus(runStatus: string | null): RunStatus {
    if (runStatus === 'running') return 'running';
    if (runStatus === 'completed') return 'completed';
    if (runStatus === 'aborted') return 'aborted';
    if (runStatus === 'error') return 'error';
    return 'idle';
}

export class SessionStore {
    private async getSessionById(profileId: string, sessionId: string): Promise<SessionRow | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('sessions')
            .selectAll()
            .where('id', '=', sessionId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();

        return row ?? null;
    }

    private async getSessionSummaryRow(profileId: string, sessionId: string): Promise<SessionSummaryRow | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('sessions')
            .leftJoin(
                db
                    .selectFrom('runs')
                    .select(['session_id'])
                    .select((eb) => eb.fn.count<number>('id').as('turn_count'))
                    .where('profile_id', '=', profileId)
                    .groupBy('session_id')
                    .as('run_counts'),
                'run_counts.session_id',
                'sessions.id'
            )
            .selectAll('sessions')
            .select('run_counts.turn_count')
            .where('sessions.profile_id', '=', profileId)
            .where('sessions.id', '=', sessionId)
            .executeTakeFirst();

        return row ?? null;
    }

    private async getLatestRun(profileId: string, sessionId: string): Promise<RunRow | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('runs')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .executeTakeFirst();

        return row ?? null;
    }

    async refreshStatus(profileId: string, sessionId: string): Promise<OperationalResult<SessionSummaryRecord>> {
        const { db } = getPersistence();
        const nextRun = await this.getLatestRun(profileId, sessionId);
        const nextStatus = mapRunStatusToSessionStatus(nextRun?.status ?? null);
        const nextPendingRunId = nextRun?.status === 'running' ? nextRun.id : null;

        const updatedSession = await db
            .updateTable('sessions')
            .set({
                run_status: nextStatus,
                pending_completion_run_id: nextPendingRunId,
                updated_at: nowIso(),
            })
            .where('id', '=', sessionId)
            .where('profile_id', '=', profileId)
            .returningAll()
            .executeTakeFirst();

        if (!updatedSession) {
            return errOp('not_found', `Session "${sessionId}" not found while refreshing status.`);
        }

        const turnCountRow = await db
            .selectFrom('runs')
            .select((expressionBuilder) => expressionBuilder.fn.count<number>('id').as('turn_count'))
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .executeTakeFirst();

        return okOp(mapSessionSummary(updatedSession, turnCountRow?.turn_count ?? 0));
    }

    async create(
        profileId: string,
        threadId: string,
        kind: SessionKind,
        options?: {
            delegatedFromOrchestratorRunId?: EntityId<'orch'>;
            delegatedFromPlanResearchBatchId?: EntityId<'prb'>;
        }
    ): Promise<{ created: false; reason: 'thread_not_found' } | { created: true; session: SessionSummaryRecord }> {
        const { db } = getPersistence();
        const now = nowIso();
        const thread = await db
            .selectFrom('threads')
            .select(['id', 'conversation_id', 'sandbox_id', 'execution_environment_mode'])
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();
        if (!thread) {
            return { created: false, reason: 'thread_not_found' };
        }

        const resolvedKind =
            kind === 'cloud'
                ? kind
                : thread.sandbox_id || thread.execution_environment_mode === 'sandbox'
                  ? 'sandbox'
                  : 'local';
        const inserted = await db
            .insertInto('sessions')
            .values({
                id: createEntityId('sess'),
                profile_id: profileId,
                conversation_id: thread.conversation_id,
                thread_id: thread.id,
                kind: resolvedKind,
                sandbox_id: thread.sandbox_id,
                delegated_from_orchestrator_run_id: options?.delegatedFromOrchestratorRunId ?? null,
                delegated_from_plan_research_batch_id: options?.delegatedFromPlanResearchBatchId ?? null,
                run_status: 'idle',
                pending_completion_run_id: null,
                created_at: now,
                updated_at: now,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        await threadStore.touchByThread(profileId, thread.id);
        return {
            created: true,
            session: mapSessionSummary(inserted, 0),
        };
    }

    async list(profileId: string): Promise<SessionSummaryRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('sessions')
            .leftJoin(
                db
                    .selectFrom('runs')
                    .select(['session_id'])
                    .select((eb) => eb.fn.count<number>('id').as('turn_count'))
                    .where('profile_id', '=', profileId)
                    .groupBy('session_id')
                    .as('run_counts'),
                'run_counts.session_id',
                'sessions.id'
            )
            .selectAll('sessions')
            .select('run_counts.turn_count')
            .where('sessions.profile_id', '=', profileId)
            .orderBy('sessions.updated_at', 'desc')
            .execute();

        return rows.map((row) => mapSessionSummary(row, row.turn_count ?? 0));
    }

    async status(
        profileId: string,
        sessionId: EntityId<'sess'>
    ): Promise<
        | { found: false }
        | {
              found: true;
              session: SessionSummaryRecord;
              activeRunId: EntityId<'run'> | null;
          }
    > {
        const session = await this.getSessionSummaryRow(profileId, sessionId);
        if (!session) {
            return { found: false };
        }

        return {
            found: true,
            session: mapSessionSummary(session, session.turn_count ?? 0),
            activeRunId: session.pending_completion_run_id
                ? parseEntityId(session.pending_completion_run_id, 'sessions.pending_completion_run_id', 'run')
                : null,
        };
    }

    async markRunPending(profileId: string, sessionId: string, runId: string): Promise<void> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('sessions')
            .set({
                run_status: 'running',
                pending_completion_run_id: runId,
                updated_at: nowIso(),
            })
            .where('id', '=', sessionId)
            .where('profile_id', '=', profileId)
            .returning(['thread_id'])
            .execute();

        const threadId = updated.at(0)?.thread_id;
        if (threadId) {
            await threadStore.touchByThread(profileId, threadId);
        }
    }

    async markRunTerminal(
        profileId: string,
        sessionId: string,
        status: Extract<RunStatus, 'completed' | 'aborted' | 'error'>
    ): Promise<void> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('sessions')
            .set({
                run_status: status,
                pending_completion_run_id: null,
                updated_at: nowIso(),
            })
            .where('id', '=', sessionId)
            .where('profile_id', '=', profileId)
            .returning(['thread_id'])
            .execute();

        const threadId = updated.at(0)?.thread_id;
        if (threadId) {
            await threadStore.touchByThread(profileId, threadId);
        }
    }

    async clearPendingRun(profileId: string, sessionId: string): Promise<void> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('sessions')
            .set({
                pending_completion_run_id: null,
                updated_at: nowIso(),
            })
            .where('id', '=', sessionId)
            .where('profile_id', '=', profileId)
            .returning(['thread_id'])
            .execute();

        const threadId = updated.at(0)?.thread_id;
        if (threadId) {
            await threadStore.touchByThread(profileId, threadId);
        }
    }

    async setSandboxBinding(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        sandboxId?: EntityId<'sb'>;
    }): Promise<SessionSummaryRecord | null> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('sessions')
            .set({
                sandbox_id: input.sandboxId ?? null,
                kind: input.sandboxId ? 'sandbox' : 'local',
                updated_at: nowIso(),
            })
            .where('id', '=', input.sessionId)
            .where('profile_id', '=', input.profileId)
            .returningAll()
            .executeTakeFirst();

        if (!updated) {
            return null;
        }

        const summary = await this.getSessionSummaryRow(input.profileId, updated.id);
        return summary ? mapSessionSummary(summary, summary.turn_count ?? 0) : null;
    }

    async ensureRunnableSession(
        profileId: string,
        sessionId: EntityId<'sess'>
    ): Promise<{ ok: false; reason: 'not_found' | 'already_running' } | { ok: true; session: SessionRow }> {
        const session = await this.getSessionById(profileId, sessionId);
        if (!session) {
            return { ok: false, reason: 'not_found' };
        }

        if (session.run_status === 'running') {
            return { ok: false, reason: 'already_running' };
        }

        return { ok: true, session };
    }
}

export const sessionStore = new SessionStore();

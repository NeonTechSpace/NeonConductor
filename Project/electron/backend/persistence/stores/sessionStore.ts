import { getPersistence } from '@/app/backend/persistence/db';
import type { RunsTable, SessionsTable } from '@/app/backend/persistence/schema';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';
import { createEntityId } from '@/app/backend/runtime/contracts';
import type { ConversationScope, EntityId, RunStatus, SessionKind } from '@/app/backend/runtime/contracts';

import type { Selectable } from 'kysely';

type SessionRow = Selectable<SessionsTable>;
type RunRow = Selectable<RunsTable>;

function mapSessionSummary(row: SessionRow, turnCount: number): SessionSummaryRecord {
    return {
        id: row.id as EntityId<'sess'>,
        scope: row.scope as ConversationScope,
        kind: row.kind as SessionKind,
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        runStatus: row.run_status as RunStatus,
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
    private async countTurns(sessionId: string): Promise<number> {
        const { db } = getPersistence();

        const result = await db
            .selectFrom('runs')
            .select((eb) => eb.fn.count<number>('id').as('count'))
            .where('session_id', '=', sessionId)
            .executeTakeFirst();

        return result?.count ?? 0;
    }

    private async getSessionById(sessionId: string): Promise<SessionRow | null> {
        const { db } = getPersistence();

        const row = await db.selectFrom('sessions').selectAll().where('id', '=', sessionId).executeTakeFirst();

        return row ?? null;
    }

    private async getRunById(runId: string): Promise<RunRow | null> {
        const { db } = getPersistence();

        const row = await db.selectFrom('runs').selectAll().where('id', '=', runId).executeTakeFirst();

        return row ?? null;
    }

    private async getLatestRun(sessionId: string): Promise<RunRow | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('runs')
            .selectAll()
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .executeTakeFirst();

        return row ?? null;
    }

    private async finalizePendingRunIfNeeded(session: SessionRow): Promise<SessionRow> {
        if (session.run_status !== 'running' || !session.pending_completion_run_id) {
            return session;
        }

        const pendingRun = await this.getRunById(session.pending_completion_run_id);
        const { db } = getPersistence();
        const now = nowIso();

        if (!pendingRun) {
            const updated = await db
                .updateTable('sessions')
                .set({
                    run_status: 'error',
                    pending_completion_run_id: null,
                    updated_at: now,
                })
                .where('id', '=', session.id)
                .returningAll()
                .executeTakeFirstOrThrow();

            return updated;
        }

        await db
            .updateTable('runs')
            .set({
                status: 'completed',
                updated_at: now,
            })
            .where('id', '=', pendingRun.id)
            .execute();

        const updatedSession = await db
            .updateTable('sessions')
            .set({
                run_status: 'completed',
                pending_completion_run_id: null,
                updated_at: now,
            })
            .where('id', '=', session.id)
            .returningAll()
            .executeTakeFirstOrThrow();

        return updatedSession;
    }

    async create(
        scope: ConversationScope,
        kind: SessionKind,
        workspaceFingerprint?: string
    ): Promise<SessionSummaryRecord> {
        if (scope === 'workspace' && !workspaceFingerprint) {
            throw new Error('workspaceFingerprint is required when creating workspace sessions.');
        }

        if (scope !== 'workspace' && workspaceFingerprint) {
            throw new Error('workspaceFingerprint is allowed only for workspace sessions.');
        }

        const { db } = getPersistence();
        const now = nowIso();

        const inserted = await db
            .insertInto('sessions')
            .values({
                id: createEntityId('sess'),
                scope,
                kind,
                workspace_fingerprint: workspaceFingerprint ?? null,
                run_status: 'idle',
                pending_completion_run_id: null,
                created_at: now,
                updated_at: now,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return mapSessionSummary(inserted, 0);
    }

    async list(): Promise<SessionSummaryRecord[]> {
        const { db } = getPersistence();

        const rows = await db.selectFrom('sessions').selectAll().orderBy('updated_at', 'desc').execute();
        const summaries: SessionSummaryRecord[] = [];
        for (const row of rows) {
            summaries.push(mapSessionSummary(row, await this.countTurns(row.id)));
        }

        return summaries;
    }

    async status(sessionId: EntityId<'sess'>): Promise<
        | { found: false }
        | {
              found: true;
              session: SessionSummaryRecord;
              activeRunId: EntityId<'run'> | null;
          }
    > {
        let session = await this.getSessionById(sessionId);
        if (!session) {
            return { found: false };
        }

        session = await this.finalizePendingRunIfNeeded(session);
        const turnCount = await this.countTurns(session.id);

        return {
            found: true,
            session: mapSessionSummary(session, turnCount),
            activeRunId: session.pending_completion_run_id as EntityId<'run'> | null,
        };
    }

    async prompt(
        sessionId: EntityId<'sess'>,
        prompt: string
    ): Promise<
        | { accepted: false; reason: 'not_found' | 'already_running' }
        | { accepted: true; runId: EntityId<'run'>; runStatus: RunStatus; turnCount: number }
    > {
        const { db } = getPersistence();
        const session = await this.getSessionById(sessionId);
        if (!session) {
            return { accepted: false, reason: 'not_found' };
        }

        if (session.run_status === 'running') {
            return { accepted: false, reason: 'already_running' };
        }

        const now = nowIso();
        const runId = createEntityId('run');

        await db
            .insertInto('runs')
            .values({
                id: runId,
                session_id: session.id,
                prompt,
                status: 'running',
                created_at: now,
                updated_at: now,
            })
            .execute();

        await db
            .updateTable('sessions')
            .set({
                run_status: 'running',
                pending_completion_run_id: runId,
                updated_at: now,
            })
            .where('id', '=', session.id)
            .execute();

        const turnCount = await this.countTurns(session.id);

        return {
            accepted: true,
            runId,
            runStatus: 'running',
            turnCount,
        };
    }

    async abort(
        sessionId: EntityId<'sess'>
    ): Promise<
        { aborted: false; reason: 'not_found' | 'not_running' } | { aborted: true; session: SessionSummaryRecord }
    > {
        const { db } = getPersistence();
        const session = await this.getSessionById(sessionId);
        if (!session) {
            return { aborted: false, reason: 'not_found' };
        }

        if (session.run_status !== 'running') {
            return { aborted: false, reason: 'not_running' };
        }

        const now = nowIso();
        if (session.pending_completion_run_id) {
            await db
                .updateTable('runs')
                .set({
                    status: 'aborted',
                    updated_at: now,
                })
                .where('id', '=', session.pending_completion_run_id)
                .execute();
        }

        const updated = await db
            .updateTable('sessions')
            .set({
                run_status: 'aborted',
                pending_completion_run_id: null,
                updated_at: now,
            })
            .where('id', '=', session.id)
            .returningAll()
            .executeTakeFirstOrThrow();

        return {
            aborted: true,
            session: mapSessionSummary(updated, await this.countTurns(updated.id)),
        };
    }

    async revert(
        sessionId: EntityId<'sess'>
    ): Promise<
        { reverted: false; reason: 'not_found' | 'no_turns' } | { reverted: true; session: SessionSummaryRecord }
    > {
        const { db } = getPersistence();
        const session = await this.getSessionById(sessionId);
        if (!session) {
            return { reverted: false, reason: 'not_found' };
        }

        const latestRun = await this.getLatestRun(session.id);
        if (!latestRun) {
            return { reverted: false, reason: 'no_turns' };
        }

        await db.deleteFrom('runs').where('id', '=', latestRun.id).execute();

        const now = nowIso();
        const nextRun = await this.getLatestRun(session.id);
        const nextStatus = mapRunStatusToSessionStatus(nextRun?.status ?? null);
        const nextPendingRunId = nextRun?.status === 'running' ? nextRun.id : null;

        const updatedSession = await db
            .updateTable('sessions')
            .set({
                run_status: nextStatus,
                pending_completion_run_id: nextPendingRunId,
                updated_at: now,
            })
            .where('id', '=', session.id)
            .returningAll()
            .executeTakeFirstOrThrow();

        return {
            reverted: true,
            session: mapSessionSummary(updatedSession, await this.countTurns(updatedSession.id)),
        };
    }
}

export const sessionStore = new SessionStore();

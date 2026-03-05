import { getPersistence } from '@/app/backend/persistence/db';
import type { RunsTable, SessionsTable } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/rowParsers';
import { threadStore } from '@/app/backend/persistence/stores/threadStore';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';
import { createEntityId, runStatuses, sessionKinds } from '@/app/backend/runtime/contracts';
import type { EntityId, RunStatus, SessionKind } from '@/app/backend/runtime/contracts';

import type { Selectable } from 'kysely';

type SessionRow = Selectable<SessionsTable>;
type RunRow = Selectable<RunsTable>;

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
    return allowed.some((candidate) => candidate === value);
}

function parseRunStatus(value: string): RunStatus {
    if (isOneOf(value, runStatuses)) {
        return value;
    }

    throw new Error(`Invalid session run status in persistence row: "${value}".`);
}

function mapSessionSummary(row: SessionRow, turnCount: number): SessionSummaryRecord {
    return {
        id: parseEntityId(row.id, 'sessions.id', 'sess'),
        profileId: row.profile_id,
        conversationId: row.conversation_id,
        threadId: row.thread_id,
        kind: parseEnumValue(row.kind, 'sessions.kind', sessionKinds),
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
    private async countTurns(profileId: string, sessionId: string): Promise<number> {
        const { db } = getPersistence();

        const result = await db
            .selectFrom('runs')
            .select((eb) => eb.fn.count<number>('id').as('count'))
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .executeTakeFirst();

        return result?.count ?? 0;
    }

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

    private async listRunsAscending(profileId: string, sessionId: string): Promise<RunRow[]> {
        const { db } = getPersistence();
        return db
            .selectFrom('runs')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();
    }

    private async syncSessionStatus(profileId: string, sessionId: string): Promise<SessionSummaryRecord> {
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
            .executeTakeFirstOrThrow();

        return mapSessionSummary(updatedSession, await this.countTurns(profileId, updatedSession.id));
    }

    async create(profileId: string, threadId: string, kind: SessionKind): Promise<SessionSummaryRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const thread = await db
            .selectFrom('threads')
            .select(['id', 'conversation_id'])
            .where('id', '=', threadId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();
        if (!thread) {
            throw new Error(`Thread "${threadId}" does not exist for profile "${profileId}".`);
        }

        const inserted = await db
            .insertInto('sessions')
            .values({
                id: createEntityId('sess'),
                profile_id: profileId,
                conversation_id: thread.conversation_id,
                thread_id: thread.id,
                kind,
                run_status: 'idle',
                pending_completion_run_id: null,
                created_at: now,
                updated_at: now,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        await threadStore.touchByThread(profileId, thread.id);
        return mapSessionSummary(inserted, 0);
    }

    async list(profileId: string): Promise<SessionSummaryRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('sessions')
            .selectAll()
            .where('profile_id', '=', profileId)
            .orderBy('updated_at', 'desc')
            .execute();

        const summaries: SessionSummaryRecord[] = [];
        for (const row of rows) {
            summaries.push(mapSessionSummary(row, await this.countTurns(profileId, row.id)));
        }

        return summaries;
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
        const session = await this.getSessionById(profileId, sessionId);
        if (!session) {
            return { found: false };
        }

        const turnCount = await this.countTurns(profileId, session.id);

        return {
            found: true,
            session: mapSessionSummary(session, turnCount),
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

    async truncateFromRun(
        profileId: string,
        sessionId: EntityId<'sess'>,
        runId: EntityId<'run'>
    ): Promise<
        | { truncated: false; reason: 'session_not_found' | 'run_not_found' | 'no_turns' }
        | { truncated: true; session: SessionSummaryRecord; deletedRunIds: EntityId<'run'>[] }
    > {
        const { db } = getPersistence();
        const session = await this.getSessionById(profileId, sessionId);
        if (!session) {
            return { truncated: false, reason: 'session_not_found' };
        }

        const runs = await this.listRunsAscending(profileId, session.id);
        if (runs.length === 0) {
            return { truncated: false, reason: 'no_turns' };
        }

        const index = runs.findIndex((item) => item.id === runId);
        if (index < 0) {
            return { truncated: false, reason: 'run_not_found' };
        }

        const runIdsToDelete = runs.slice(index).map((item) => parseEntityId(item.id, 'runs.id', 'run'));
        await db.deleteFrom('runs').where('id', 'in', runIdsToDelete).where('profile_id', '=', profileId).execute();

        const updated = await this.syncSessionStatus(profileId, session.id);
        await threadStore.touchByThread(profileId, session.thread_id);

        return {
            truncated: true,
            session: updated,
            deletedRunIds: runIdsToDelete,
        };
    }

    async createBranchFromRun(
        profileId: string,
        sessionId: EntityId<'sess'>,
        runId: EntityId<'run'>
    ): Promise<
        | { branched: false; reason: 'session_not_found' | 'run_not_found' }
        | {
              branched: true;
              session: SessionSummaryRecord;
              sourceRunCount: number;
              clonedRunCount: number;
              sourceThreadId: string;
              thread: {
                  id: string;
                  topLevelTab: 'chat' | 'agent' | 'orchestrator';
                  parentThreadId?: string;
                  rootThreadId: string;
              };
          }
    > {
        const { db } = getPersistence();
        const sourceSession = await this.getSessionById(profileId, sessionId);
        if (!sourceSession) {
            return { branched: false, reason: 'session_not_found' };
        }
        const sourceThread = await threadStore.getById(profileId, sourceSession.thread_id);
        if (!sourceThread) {
            return { branched: false, reason: 'session_not_found' };
        }

        const sourceRuns = await this.listRunsAscending(profileId, sourceSession.id);
        const targetIndex = sourceRuns.findIndex((item) => item.id === runId);
        if (targetIndex < 0) {
            return { branched: false, reason: 'run_not_found' };
        }
        const prefixRuns = sourceRuns.slice(0, targetIndex);
        const branchSessionId = createEntityId('sess');
        const branchThread = await threadStore.create({
            profileId,
            conversationId: sourceSession.conversation_id,
            title: `${sourceThread.title} (Branch)`,
            topLevelTab: sourceThread.topLevelTab,
            parentThreadId: sourceThread.id,
            rootThreadId: sourceThread.rootThreadId,
        });
        const now = nowIso();
        let latestAssistantAt: string | undefined;

        await db.transaction().execute(async (trx) => {
            await trx
                .insertInto('sessions')
                .values({
                    id: branchSessionId,
                    profile_id: profileId,
                    conversation_id: sourceSession.conversation_id,
                    thread_id: branchThread.id,
                    kind: sourceSession.kind,
                    run_status: 'idle',
                    pending_completion_run_id: null,
                    created_at: now,
                    updated_at: now,
                })
                .execute();

            for (const sourceRun of prefixRuns) {
                const clonedRunId = createEntityId('run');
                await trx
                    .insertInto('runs')
                    .values({
                        id: clonedRunId,
                        session_id: branchSessionId,
                        profile_id: profileId,
                        prompt: sourceRun.prompt,
                        status: sourceRun.status,
                        provider_id: sourceRun.provider_id,
                        model_id: sourceRun.model_id,
                        auth_method: sourceRun.auth_method,
                        reasoning_effort: sourceRun.reasoning_effort,
                        reasoning_summary: sourceRun.reasoning_summary,
                        reasoning_include_encrypted: sourceRun.reasoning_include_encrypted,
                        cache_strategy: sourceRun.cache_strategy,
                        cache_key: sourceRun.cache_key,
                        cache_applied: sourceRun.cache_applied,
                        cache_skip_reason: sourceRun.cache_skip_reason,
                        transport_openai_preference: sourceRun.transport_openai_preference,
                        transport_selected: sourceRun.transport_selected,
                        transport_degraded_reason: sourceRun.transport_degraded_reason,
                        started_at: sourceRun.started_at,
                        completed_at: sourceRun.completed_at,
                        aborted_at: sourceRun.aborted_at,
                        error_code: sourceRun.error_code,
                        error_message: sourceRun.error_message,
                        created_at: sourceRun.created_at,
                        updated_at: sourceRun.updated_at,
                    })
                    .execute();

                const usage = await trx
                    .selectFrom('run_usage')
                    .selectAll()
                    .where('run_id', '=', sourceRun.id)
                    .executeTakeFirst();
                if (usage) {
                    await trx
                        .insertInto('run_usage')
                        .values({
                            run_id: clonedRunId,
                            provider_id: usage.provider_id,
                            model_id: usage.model_id,
                            input_tokens: usage.input_tokens,
                            output_tokens: usage.output_tokens,
                            cached_tokens: usage.cached_tokens,
                            reasoning_tokens: usage.reasoning_tokens,
                            total_tokens: usage.total_tokens,
                            latency_ms: usage.latency_ms,
                            cost_microunits: usage.cost_microunits,
                            billed_via: usage.billed_via,
                            recorded_at: usage.recorded_at,
                        })
                        .execute();
                }

                const sourceMessages = await trx
                    .selectFrom('messages')
                    .selectAll()
                    .where('run_id', '=', sourceRun.id)
                    .where('profile_id', '=', profileId)
                    .orderBy('created_at', 'asc')
                    .orderBy('id', 'asc')
                    .execute();

                for (const sourceMessage of sourceMessages) {
                    const clonedMessageId = createEntityId('msg');
                    await trx
                        .insertInto('messages')
                        .values({
                            id: clonedMessageId,
                            profile_id: profileId,
                            session_id: branchSessionId,
                            run_id: clonedRunId,
                            role: sourceMessage.role,
                            created_at: sourceMessage.created_at,
                            updated_at: sourceMessage.updated_at,
                        })
                        .execute();
                    if (sourceMessage.role === 'assistant') {
                        latestAssistantAt = latestAssistantAt
                            ? latestAssistantAt > sourceMessage.updated_at
                                ? latestAssistantAt
                                : sourceMessage.updated_at
                            : sourceMessage.updated_at;
                    }

                    const sourceParts = await trx
                        .selectFrom('message_parts')
                        .selectAll()
                        .where('message_id', '=', sourceMessage.id)
                        .orderBy('sequence', 'asc')
                        .execute();

                    for (const sourcePart of sourceParts) {
                        await trx
                            .insertInto('message_parts')
                            .values({
                                id: createEntityId('part'),
                                message_id: clonedMessageId,
                                sequence: sourcePart.sequence,
                                part_type: sourcePart.part_type,
                                payload_json: sourcePart.payload_json,
                                created_at: sourcePart.created_at,
                            })
                            .execute();
                    }
                }
            }
        });

        const summary = await this.syncSessionStatus(profileId, branchSessionId);
        await threadStore.touchByThread(profileId, sourceSession.thread_id);
        await threadStore.touchByThread(profileId, branchThread.id);
        if (latestAssistantAt) {
            await threadStore.markAssistantActivity(profileId, branchThread.id, latestAssistantAt);
        }

        return {
            branched: true,
            session: summary,
            sourceRunCount: sourceRuns.length,
            clonedRunCount: prefixRuns.length,
            sourceThreadId: sourceThread.id,
            thread: {
                id: branchThread.id,
                topLevelTab: branchThread.topLevelTab,
                ...(branchThread.parentThreadId ? { parentThreadId: branchThread.parentThreadId } : {}),
                rootThreadId: branchThread.rootThreadId,
            },
        };
    }

    async revert(
        profileId: string,
        sessionId: EntityId<'sess'>
    ): Promise<
        { reverted: false; reason: 'not_found' | 'no_turns' } | { reverted: true; session: SessionSummaryRecord }
    > {
        const { db } = getPersistence();
        const session = await this.getSessionById(profileId, sessionId);
        if (!session) {
            return { reverted: false, reason: 'not_found' };
        }

        const latestRun = await this.getLatestRun(profileId, session.id);
        if (!latestRun) {
            return { reverted: false, reason: 'no_turns' };
        }

        await db.deleteFrom('runs').where('id', '=', latestRun.id).where('profile_id', '=', profileId).execute();

        const updatedSession = await this.syncSessionStatus(profileId, session.id);
        await threadStore.touchByThread(profileId, session.thread_id);

        return {
            reverted: true,
            session: updatedSession,
        };
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

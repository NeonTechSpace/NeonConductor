import { getPersistence } from '@/app/backend/persistence/db';
import type {
    MessagePartsTable,
    MessagesTable,
    RunUsageTable,
    RunsTable,
    SessionsTable,
} from '@/app/backend/persistence/schema';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';

import type { Selectable } from 'kysely';

type SessionRow = Selectable<SessionsTable>;
type RunRow = Selectable<RunsTable>;
type MessageRow = Selectable<MessagesTable>;
type MessagePartRow = Selectable<MessagePartsTable>;
type RunUsageRow = Selectable<RunUsageTable>;

interface SourceHistoryGraph {
    runs: RunRow[];
    runUsage: RunUsageRow[];
    messages: MessageRow[];
    messageParts: MessagePartRow[];
}

export class SessionHistoryStore {
    async getSessionRecord(profileId: string, sessionId: string): Promise<SessionRow | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('sessions')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', sessionId)
            .executeTakeFirst();

        return row ?? null;
    }

    async listRunsAscending(profileId: string, sessionId: string): Promise<RunRow[]> {
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

    async getLatestRun(profileId: string, sessionId: string): Promise<RunRow | null> {
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

    async deleteRuns(profileId: string, runIds: readonly string[]): Promise<void> {
        if (runIds.length === 0) {
            return;
        }

        const { db } = getPersistence();
        await db
            .deleteFrom('runs')
            .where('profile_id', '=', profileId)
            .where('id', 'in', [...runIds])
            .execute();
    }

    private async loadSourceHistoryGraph(
        profileId: string,
        sourceRunIds: readonly string[]
    ): Promise<SourceHistoryGraph> {
        if (sourceRunIds.length === 0) {
            return {
                runs: [],
                runUsage: [],
                messages: [],
                messageParts: [],
            };
        }

        const { db } = getPersistence();
        const runs = await db
            .selectFrom('runs')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', 'in', [...sourceRunIds])
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();
        const runUsage = await db
            .selectFrom('run_usage')
            .selectAll()
            .where('run_id', 'in', [...sourceRunIds])
            .execute();
        const messages = await db
            .selectFrom('messages')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('run_id', 'in', [...sourceRunIds])
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();
        const sourceMessageIds = messages.map((message) => message.id);
        const messageParts =
            sourceMessageIds.length === 0
                ? []
                : await db
                      .selectFrom('message_parts')
                      .selectAll()
                      .where('message_id', 'in', sourceMessageIds)
                      .orderBy('sequence', 'asc')
                      .orderBy('id', 'asc')
                      .execute();

        return {
            runs,
            runUsage,
            messages,
            messageParts,
        };
    }

    async createBranchFromRun(input: {
        profileId: string;
        sourceSession: SessionRow;
        branchThreadId: string;
        targetRunId: string;
        includeTargetRun?: boolean;
    }): Promise<
        | { created: false; reason: 'run_not_found' }
        | {
              created: true;
              branchSessionId: string;
              sourceRunCount: number;
              clonedRunCount: number;
              latestAssistantAt?: string;
          }
    > {
        const sourceRuns = await this.listRunsAscending(input.profileId, input.sourceSession.id);
        const targetIndex = sourceRuns.findIndex((run) => run.id === input.targetRunId);
        if (targetIndex < 0) {
            return { created: false, reason: 'run_not_found' };
        }

        const prefixRuns = sourceRuns.slice(0, input.includeTargetRun ? targetIndex + 1 : targetIndex);
        const sourceRunIds = prefixRuns.map((run) => run.id);
        const sourceGraph = await this.loadSourceHistoryGraph(input.profileId, sourceRunIds);
        const branchSessionId = createEntityId('sess');
        const createdAt = nowIso();
        let latestAssistantAt: string | undefined;

        const { db } = getPersistence();
        await db.transaction().execute(async (trx) => {
            await trx
                .insertInto('sessions')
                .values({
                    id: branchSessionId,
                    profile_id: input.profileId,
                    conversation_id: input.sourceSession.conversation_id,
                    thread_id: input.branchThreadId,
                    kind: input.sourceSession.kind,
                    sandbox_id: input.sourceSession.sandbox_id,
                    run_status: 'idle',
                    pending_completion_run_id: null,
                    created_at: createdAt,
                    updated_at: createdAt,
                })
                .execute();

            const clonedRunIdsBySourceId = new Map<string, string>();
            if (sourceGraph.runs.length > 0) {
                await trx
                    .insertInto('runs')
                    .values(
                        sourceGraph.runs.map((run) => {
                            const clonedRunId = createEntityId('run');
                            clonedRunIdsBySourceId.set(run.id, clonedRunId);

                            return {
                                id: clonedRunId,
                                session_id: branchSessionId,
                                profile_id: input.profileId,
                                prompt: run.prompt,
                                status: run.status,
                                provider_id: run.provider_id,
                                model_id: run.model_id,
                                auth_method: run.auth_method,
                                reasoning_effort: run.reasoning_effort,
                                reasoning_summary: run.reasoning_summary,
                                reasoning_include_encrypted: run.reasoning_include_encrypted,
                                cache_strategy: run.cache_strategy,
                                cache_key: run.cache_key,
                                cache_applied: run.cache_applied,
                                cache_skip_reason: run.cache_skip_reason,
                                transport_requested_family: run.transport_requested_family,
                                transport_selected: run.transport_selected,
                                transport_degraded_reason: run.transport_degraded_reason,
                                started_at: run.started_at,
                                completed_at: run.completed_at,
                                aborted_at: run.aborted_at,
                                error_code: run.error_code,
                                error_message: run.error_message,
                                created_at: run.created_at,
                                updated_at: run.updated_at,
                            };
                        })
                    )
                    .execute();
            }

            if (sourceGraph.runUsage.length > 0) {
                await trx
                    .insertInto('run_usage')
                    .values(
                        sourceGraph.runUsage.map((usage) => {
                            const clonedRunId = clonedRunIdsBySourceId.get(usage.run_id);
                            if (!clonedRunId) {
                                throw new InvariantError(`Missing cloned run id for usage row "${usage.run_id}".`);
                            }

                            return {
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
                            };
                        })
                    )
                    .execute();
            }

            const clonedMessageIdsBySourceId = new Map<string, string>();
            if (sourceGraph.messages.length > 0) {
                await trx
                    .insertInto('messages')
                    .values(
                        sourceGraph.messages.map((message) => {
                            const clonedRunId = clonedRunIdsBySourceId.get(message.run_id);
                            if (!clonedRunId) {
                                throw new InvariantError(`Missing cloned run id for message row "${message.id}".`);
                            }

                            const clonedMessageId = createEntityId('msg');
                            clonedMessageIdsBySourceId.set(message.id, clonedMessageId);

                            if (message.role === 'assistant') {
                                latestAssistantAt =
                                    !latestAssistantAt || message.updated_at > latestAssistantAt
                                        ? message.updated_at
                                        : latestAssistantAt;
                            }

                            return {
                                id: clonedMessageId,
                                profile_id: input.profileId,
                                session_id: branchSessionId,
                                run_id: clonedRunId,
                                role: message.role,
                                created_at: message.created_at,
                                updated_at: message.updated_at,
                            };
                        })
                    )
                    .execute();
            }

            if (sourceGraph.messageParts.length > 0) {
                await trx
                    .insertInto('message_parts')
                    .values(
                        sourceGraph.messageParts.map((part) => {
                            const clonedMessageId = clonedMessageIdsBySourceId.get(part.message_id);
                            if (!clonedMessageId) {
                                throw new InvariantError(`Missing cloned message id for part row "${part.id}".`);
                            }

                            return {
                                id: createEntityId('part'),
                                message_id: clonedMessageId,
                                sequence: part.sequence,
                                part_type: part.part_type,
                                payload_json: part.payload_json,
                                created_at: part.created_at,
                            };
                        })
                    )
                    .execute();
            }
        });

        return {
            created: true,
            branchSessionId,
            sourceRunCount: sourceRuns.length,
            clonedRunCount: prefixRuns.length,
            ...(latestAssistantAt ? { latestAssistantAt } : {}),
        };
    }
}

export const sessionHistoryStore = new SessionHistoryStore();

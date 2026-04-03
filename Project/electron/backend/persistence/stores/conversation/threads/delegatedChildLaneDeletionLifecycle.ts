import { getPersistence } from '@/app/backend/persistence/db';
import type { DeleteDelegatedChildLaneInput } from '@/app/backend/persistence/stores/conversation/threads/threadLifecycle.types';

export async function deleteDelegatedChildLane(input: DeleteDelegatedChildLaneInput): Promise<boolean> {
    const { db } = getPersistence();

    return db.transaction().execute(async (transaction) => {
        const delegatedChildLane = await (async () => {
            if ('orchestratorRunId' in input) {
                return input.sessionId
                    ? await transaction
                          .selectFrom('threads')
                          .innerJoin('sessions', 'sessions.thread_id', 'threads.id')
                          .select(['threads.id as thread_id', 'sessions.id as session_id'])
                          .where('threads.profile_id', '=', input.profileId)
                          .where('sessions.profile_id', '=', input.profileId)
                          .where('threads.id', '=', input.threadId)
                          .where('sessions.id', '=', input.sessionId)
                          .where('threads.delegated_from_orchestrator_run_id', '=', input.orchestratorRunId)
                          .where('sessions.delegated_from_orchestrator_run_id', '=', input.orchestratorRunId)
                          .executeTakeFirst()
                    : await transaction
                          .selectFrom('threads')
                          .select(['threads.id as thread_id'])
                          .where('threads.profile_id', '=', input.profileId)
                          .where('threads.id', '=', input.threadId)
                          .where('threads.delegated_from_orchestrator_run_id', '=', input.orchestratorRunId)
                          .executeTakeFirst();
            }

            if ('planResearchBatchId' in input) {
                return input.sessionId
                    ? await transaction
                          .selectFrom('threads')
                          .innerJoin('sessions', 'sessions.thread_id', 'threads.id')
                          .select(['threads.id as thread_id', 'sessions.id as session_id'])
                          .where('threads.profile_id', '=', input.profileId)
                          .where('sessions.profile_id', '=', input.profileId)
                          .where('threads.id', '=', input.threadId)
                          .where('sessions.id', '=', input.sessionId)
                          .where('threads.delegated_from_plan_research_batch_id', '=', input.planResearchBatchId)
                          .where('sessions.delegated_from_plan_research_batch_id', '=', input.planResearchBatchId)
                          .executeTakeFirst()
                    : await transaction
                          .selectFrom('threads')
                          .select(['threads.id as thread_id'])
                          .where('threads.profile_id', '=', input.profileId)
                          .where('threads.id', '=', input.threadId)
                          .where('threads.delegated_from_plan_research_batch_id', '=', input.planResearchBatchId)
                          .executeTakeFirst();
            }

            return input.sessionId
                ? await transaction
                      .selectFrom('threads')
                      .innerJoin('sessions', 'sessions.thread_id', 'threads.id')
                      .select(['threads.id as thread_id', 'sessions.id as session_id'])
                      .where('threads.profile_id', '=', input.profileId)
                      .where('sessions.profile_id', '=', input.profileId)
                      .where('threads.id', '=', input.threadId)
                      .where('sessions.id', '=', input.sessionId)
                      .where('threads.delegated_from_flow_instance_id', '=', input.flowInstanceId)
                      .where('sessions.delegated_from_flow_instance_id', '=', input.flowInstanceId)
                      .executeTakeFirst()
                : await transaction
                      .selectFrom('threads')
                      .select(['threads.id as thread_id'])
                      .where('threads.profile_id', '=', input.profileId)
                      .where('threads.id', '=', input.threadId)
                      .where('threads.delegated_from_flow_instance_id', '=', input.flowInstanceId)
                      .executeTakeFirst();
        })();

        if (!delegatedChildLane) {
            return false;
        }

        const runtimeEventEntityIds = input.sessionId ? [input.threadId, input.sessionId] : [input.threadId];
        await transaction.deleteFrom('runtime_events').where('entity_id', 'in', runtimeEventEntityIds).execute();

        await transaction
            .deleteFrom('threads')
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.threadId)
            .execute();

        return true;
    });
}

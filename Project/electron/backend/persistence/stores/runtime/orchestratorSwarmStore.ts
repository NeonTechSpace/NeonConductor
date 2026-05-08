import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { OrchestratorSwarmContextEntryRecord, OrchestratorSwarmLaneRecord } from '@/app/backend/persistence/types';
import {
    orchestratorSwarmContextEntryKinds,
    orchestratorSwarmLaneStatuses,
    orchestratorSwarmRoles,
} from '@/app/backend/runtime/contracts';
import type {
    EntityId,
    OrchestratorSwarmContextEntryKind,
    OrchestratorSwarmLaneStatus,
    OrchestratorSwarmRole,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

function mapSwarmLaneRecord(row: {
    id: string;
    orchestrator_run_id: string;
    step_id: string | null;
    sequence: number;
    role: string;
    status: string;
    child_thread_id: string | null;
    child_session_id: string | null;
    active_run_id: string | null;
    run_id: string | null;
    prompt_markdown: string;
    result_summary_markdown: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}): OrchestratorSwarmLaneRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_swarm_lanes.id', 'olane'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_swarm_lanes.orchestrator_run_id', 'orch'),
        ...(row.step_id ? { stepId: parseEntityId(row.step_id, 'orchestrator_swarm_lanes.step_id', 'step') } : {}),
        sequence: row.sequence,
        role: parseEnumValue(row.role, 'orchestrator_swarm_lanes.role', orchestratorSwarmRoles),
        status: parseEnumValue(row.status, 'orchestrator_swarm_lanes.status', orchestratorSwarmLaneStatuses),
        ...(row.child_thread_id
            ? { childThreadId: parseEntityId(row.child_thread_id, 'orchestrator_swarm_lanes.child_thread_id', 'thr') }
            : {}),
        ...(row.child_session_id
            ? {
                  childSessionId: parseEntityId(
                      row.child_session_id,
                      'orchestrator_swarm_lanes.child_session_id',
                      'sess'
                  ),
              }
            : {}),
        ...(row.active_run_id
            ? { activeRunId: parseEntityId(row.active_run_id, 'orchestrator_swarm_lanes.active_run_id', 'run') }
            : {}),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'orchestrator_swarm_lanes.run_id', 'run') } : {}),
        promptMarkdown: row.prompt_markdown,
        ...(row.result_summary_markdown ? { resultSummaryMarkdown: row.result_summary_markdown } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapSwarmContextEntryRecord(row: {
    id: string;
    orchestrator_run_id: string;
    source_lane_id: string | null;
    sequence: number;
    entry_kind: string;
    content_markdown: string;
    created_at: string;
}): OrchestratorSwarmContextEntryRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_swarm_context_entries.id', 'octx'),
        orchestratorRunId: parseEntityId(
            row.orchestrator_run_id,
            'orchestrator_swarm_context_entries.orchestrator_run_id',
            'orch'
        ),
        ...(row.source_lane_id
            ? {
                  sourceLaneId: parseEntityId(
                      row.source_lane_id,
                      'orchestrator_swarm_context_entries.source_lane_id',
                      'olane'
                  ),
              }
            : {}),
        sequence: row.sequence,
        entryKind: parseEnumValue(
            row.entry_kind,
            'orchestrator_swarm_context_entries.entry_kind',
            orchestratorSwarmContextEntryKinds
        ),
        contentMarkdown: row.content_markdown,
        createdAt: row.created_at,
    };
}

export class OrchestratorSwarmStore {
    async createLane(input: {
        orchestratorRunId: EntityId<'orch'>;
        stepId?: EntityId<'step'>;
        sequence: number;
        role: OrchestratorSwarmRole;
        promptMarkdown: string;
    }): Promise<OrchestratorSwarmLaneRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('olane');

        await db
            .insertInto('orchestrator_swarm_lanes')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                step_id: input.stepId ?? null,
                sequence: input.sequence,
                role: input.role,
                status: 'pending',
                child_thread_id: null,
                child_session_id: null,
                active_run_id: null,
                run_id: null,
                prompt_markdown: input.promptMarkdown,
                result_summary_markdown: null,
                error_message: null,
                created_at: now,
                updated_at: now,
            })
            .execute();

        return this.getLaneById(id);
    }

    async getLaneById(laneId: EntityId<'olane'>): Promise<OrchestratorSwarmLaneRecord> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('orchestrator_swarm_lanes')
            .selectAll()
            .where('id', '=', laneId)
            .executeTakeFirstOrThrow();

        return mapSwarmLaneRecord(row);
    }

    async listLanes(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorSwarmLaneRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('orchestrator_swarm_lanes')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapSwarmLaneRecord);
    }

    async updateLane(
        laneId: EntityId<'olane'>,
        input: {
            status?: OrchestratorSwarmLaneStatus;
            childThreadId?: EntityId<'thr'> | null;
            childSessionId?: EntityId<'sess'> | null;
            activeRunId?: EntityId<'run'> | null;
            runId?: EntityId<'run'> | null;
            resultSummaryMarkdown?: string | null;
            errorMessage?: string | null;
        }
    ): Promise<OrchestratorSwarmLaneRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const row = await db
            .updateTable('orchestrator_swarm_lanes')
            .set({
                ...(input.status ? { status: input.status } : {}),
                ...(input.childThreadId !== undefined ? { child_thread_id: input.childThreadId } : {}),
                ...(input.childSessionId !== undefined ? { child_session_id: input.childSessionId } : {}),
                ...(input.activeRunId !== undefined ? { active_run_id: input.activeRunId } : {}),
                ...(input.runId !== undefined ? { run_id: input.runId } : {}),
                ...(input.resultSummaryMarkdown !== undefined
                    ? { result_summary_markdown: input.resultSummaryMarkdown }
                    : {}),
                ...(input.errorMessage !== undefined ? { error_message: input.errorMessage } : {}),
                updated_at: now,
            })
            .where('id', '=', laneId)
            .returningAll()
            .executeTakeFirstOrThrow();

        return mapSwarmLaneRecord(row);
    }

    async appendContextEntry(input: {
        orchestratorRunId: EntityId<'orch'>;
        sourceLaneId?: EntityId<'olane'>;
        entryKind: OrchestratorSwarmContextEntryKind;
        contentMarkdown: string;
    }): Promise<OrchestratorSwarmContextEntryRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('octx');
        const latest = await db
            .selectFrom('orchestrator_swarm_context_entries')
            .select('sequence')
            .where('orchestrator_run_id', '=', input.orchestratorRunId)
            .orderBy('sequence', 'desc')
            .executeTakeFirst();
        const sequence = (latest?.sequence ?? 0) + 1;

        await db
            .insertInto('orchestrator_swarm_context_entries')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                source_lane_id: input.sourceLaneId ?? null,
                sequence,
                entry_kind: input.entryKind,
                content_markdown: input.contentMarkdown,
                created_at: now,
            })
            .execute();

        const row = await db
            .selectFrom('orchestrator_swarm_context_entries')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirstOrThrow();

        return mapSwarmContextEntryRecord(row);
    }

    async listContextEntries(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorSwarmContextEntryRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('orchestrator_swarm_context_entries')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapSwarmContextEntryRecord);
    }
}

export const orchestratorSwarmStore = new OrchestratorSwarmStore();

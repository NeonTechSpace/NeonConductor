import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { CheckpointRecord } from '@/app/backend/persistence/types';
import { topLevelTabs } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

function mapCheckpointRecord(row: {
    id: string;
    profile_id: string;
    session_id: string;
    thread_id: string;
    run_id: string | null;
    diff_id: string | null;
    workspace_fingerprint: string;
    sandbox_id: string | null;
    execution_target_key: string;
    execution_target_kind: string;
    execution_target_label: string;
    created_by_kind: string;
    checkpoint_kind: string;
    milestone_title: string | null;
    snapshot_file_count: number;
    top_level_tab: string;
    mode_key: string;
    summary: string;
    created_at: string;
    updated_at: string;
}): CheckpointRecord {
    return {
        id: parseEntityId(row.id, 'checkpoints.id', 'ckpt'),
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'checkpoints.session_id', 'sess'),
        threadId: parseEntityId(row.thread_id, 'checkpoints.thread_id', 'thr'),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'checkpoints.run_id', 'run') } : {}),
        ...(row.diff_id ? { diffId: row.diff_id } : {}),
        workspaceFingerprint: row.workspace_fingerprint,
        ...(row.sandbox_id ? { sandboxId: parseEntityId(row.sandbox_id, 'checkpoints.sandbox_id', 'sb') } : {}),
        executionTargetKey: row.execution_target_key,
        executionTargetKind: row.execution_target_kind === 'sandbox' ? 'sandbox' : 'workspace',
        executionTargetLabel: row.execution_target_label,
        createdByKind: row.created_by_kind === 'user' ? 'user' : 'system',
        checkpointKind:
            row.checkpoint_kind === 'safety' ? 'safety' : row.checkpoint_kind === 'named' ? 'named' : 'auto',
        ...(row.milestone_title ? { milestoneTitle: row.milestone_title } : {}),
        snapshotFileCount: row.snapshot_file_count,
        topLevelTab: parseEnumValue(row.top_level_tab, 'checkpoints.top_level_tab', topLevelTabs),
        modeKey: row.mode_key,
        summary: row.summary,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const CHECKPOINT_COLUMNS = [
    'id',
    'profile_id',
    'session_id',
    'thread_id',
    'run_id',
    'diff_id',
    'workspace_fingerprint',
    'sandbox_id',
    'execution_target_key',
    'execution_target_kind',
    'execution_target_label',
    'created_by_kind',
    'checkpoint_kind',
    'milestone_title',
    'snapshot_file_count',
    'top_level_tab',
    'mode_key',
    'summary',
    'created_at',
    'updated_at',
] as const;

interface CheckpointInsertInput {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
    threadId: CheckpointRecord['threadId'];
    runId?: CheckpointRecord['runId'];
    diffId?: string;
    workspaceFingerprint: string;
    sandboxId?: CheckpointRecord['sandboxId'];
    executionTargetKey: string;
    executionTargetKind: CheckpointRecord['executionTargetKind'];
    executionTargetLabel: string;
    createdByKind: CheckpointRecord['createdByKind'];
    checkpointKind: CheckpointRecord['checkpointKind'];
    milestoneTitle?: string;
    snapshotFileCount: number;
    topLevelTab: CheckpointRecord['topLevelTab'];
    modeKey: string;
    summary: string;
}

export class CheckpointStore {
    async create(input: CheckpointInsertInput): Promise<CheckpointRecord> {
        if (input.runId) {
            const existing = await this.getByRunId(input.profileId, input.runId);
            if (existing) {
                return existing;
            }
        }

        const { db } = getPersistence();
        const now = nowIso();
        const inserted = await db
            .insertInto('checkpoints')
            .values({
                id: createEntityId('ckpt'),
                profile_id: input.profileId,
                session_id: input.sessionId,
                thread_id: input.threadId,
                run_id: input.runId ?? null,
                diff_id: input.diffId ?? null,
                workspace_fingerprint: input.workspaceFingerprint,
                sandbox_id: input.sandboxId ?? null,
                execution_target_key: input.executionTargetKey,
                execution_target_kind: input.executionTargetKind,
                execution_target_label: input.executionTargetLabel,
                created_by_kind: input.createdByKind,
                checkpoint_kind: input.checkpointKind,
                milestone_title: input.milestoneTitle ?? null,
                snapshot_file_count: input.snapshotFileCount,
                top_level_tab: input.topLevelTab,
                mode_key: input.modeKey,
                summary: input.summary,
                created_at: now,
                updated_at: now,
            })
            .returning(CHECKPOINT_COLUMNS)
            .executeTakeFirstOrThrow();

        return mapCheckpointRecord(inserted);
    }

    async attachDiff(input: {
        profileId: string;
        checkpointId: CheckpointRecord['id'];
        diffId: string;
        summary: string;
    }): Promise<CheckpointRecord | null> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('checkpoints')
            .set({
                diff_id: input.diffId,
                summary: input.summary,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.checkpointId)
            .returning(CHECKPOINT_COLUMNS)
            .executeTakeFirst();

        return updated ? mapCheckpointRecord(updated) : null;
    }

    async updateMilestone(input: {
        profileId: string;
        checkpointId: CheckpointRecord['id'];
        milestoneTitle: string;
    }): Promise<CheckpointRecord | null> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('checkpoints')
            .set({
                checkpoint_kind: 'named',
                milestone_title: input.milestoneTitle,
                summary: input.milestoneTitle,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.checkpointId)
            .returning(CHECKPOINT_COLUMNS)
            .executeTakeFirst();

        return updated ? mapCheckpointRecord(updated) : null;
    }

    async renameMilestone(input: {
        profileId: string;
        checkpointId: CheckpointRecord['id'];
        milestoneTitle: string;
    }): Promise<CheckpointRecord | null> {
        const { db } = getPersistence();
        const updated = await db
            .updateTable('checkpoints')
            .set({
                milestone_title: input.milestoneTitle,
                summary: input.milestoneTitle,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.checkpointId)
            .where('checkpoint_kind', '=', 'named')
            .returning(CHECKPOINT_COLUMNS)
            .executeTakeFirst();

        return updated ? mapCheckpointRecord(updated) : null;
    }

    async listBySession(profileId: string, sessionId: CheckpointRecord['sessionId']): Promise<CheckpointRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('checkpoints')
            .select(CHECKPOINT_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'desc')
            .execute();

        return rows.map(mapCheckpointRecord);
    }

    async listByExecutionTargetKey(profileId: string, executionTargetKey: string): Promise<CheckpointRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('checkpoints')
            .select(CHECKPOINT_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('execution_target_key', '=', executionTargetKey)
            .orderBy('created_at', 'desc')
            .execute();

        return rows.map(mapCheckpointRecord);
    }

    async getById(profileId: string, checkpointId: CheckpointRecord['id']): Promise<CheckpointRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('checkpoints')
            .select(CHECKPOINT_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('id', '=', checkpointId)
            .executeTakeFirst();

        return row ? mapCheckpointRecord(row) : null;
    }

    async getByRunId(profileId: string, runId: CheckpointRecord['runId']): Promise<CheckpointRecord | null> {
        if (!runId) {
            return null;
        }

        const { db } = getPersistence();
        const row = await db
            .selectFrom('checkpoints')
            .select(CHECKPOINT_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('run_id', '=', runId)
            .executeTakeFirst();

        return row ? mapCheckpointRecord(row) : null;
    }

    async listByProfile(profileId: string): Promise<CheckpointRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('checkpoints')
            .select(CHECKPOINT_COLUMNS)
            .where('profile_id', '=', profileId)
            .orderBy('created_at', 'desc')
            .execute();

        return rows.map(mapCheckpointRecord);
    }

    async deleteById(profileId: string, checkpointId: CheckpointRecord['id']): Promise<boolean> {
        const { db } = getPersistence();
        const deleted = await db
            .deleteFrom('checkpoints')
            .where('profile_id', '=', profileId)
            .where('id', '=', checkpointId)
            .returning('id')
            .executeTakeFirst();

        return Boolean(deleted);
    }

    async deleteByIds(profileId: string, checkpointIds: CheckpointRecord['id'][]): Promise<CheckpointRecord['id'][]> {
        if (checkpointIds.length === 0) {
            return [];
        }

        const { db } = getPersistence();
        const deletedRows = await db
            .deleteFrom('checkpoints')
            .where('profile_id', '=', profileId)
            .where('id', 'in', checkpointIds)
            .returning('id')
            .execute();

        return deletedRows.map((row) => parseEntityId(row.id, 'checkpoints.id', 'ckpt'));
    }
}

export const checkpointStore = new CheckpointStore();

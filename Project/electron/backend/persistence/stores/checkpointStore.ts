import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { CheckpointRecord } from '@/app/backend/persistence/types';
import { createEntityId, topLevelTabs } from '@/app/backend/runtime/contracts';

function mapCheckpointRecord(row: {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string;
    diff_id: string;
    workspace_fingerprint: string;
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
        runId: parseEntityId(row.run_id, 'checkpoints.run_id', 'run'),
        diffId: row.diff_id,
        workspaceFingerprint: row.workspace_fingerprint,
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
    'run_id',
    'diff_id',
    'workspace_fingerprint',
    'top_level_tab',
    'mode_key',
    'summary',
    'created_at',
    'updated_at',
] as const;

export class CheckpointStore {
    async create(input: {
        profileId: string;
        sessionId: CheckpointRecord['sessionId'];
        runId: CheckpointRecord['runId'];
        diffId: string;
        workspaceFingerprint: string;
        topLevelTab: CheckpointRecord['topLevelTab'];
        modeKey: string;
        summary: string;
    }): Promise<CheckpointRecord> {
        const existing = await this.getByRunId(input.profileId, input.runId);
        if (existing) {
            return existing;
        }

        const { db } = getPersistence();
        const now = nowIso();
        const inserted = await db
            .insertInto('checkpoints')
            .values({
                id: createEntityId('ckpt'),
                profile_id: input.profileId,
                session_id: input.sessionId,
                run_id: input.runId,
                diff_id: input.diffId,
                workspace_fingerprint: input.workspaceFingerprint,
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
}

export const checkpointStore = new CheckpointStore();

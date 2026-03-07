import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { isJsonRecord, isJsonString, isJsonUnknownArray, nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';
import type { DiffArtifact, DiffFileArtifact, DiffRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';

function createDiffId(): string {
    return `diff_${randomUUID()}`;
}

function mapDiffFileArtifact(value: unknown): DiffFileArtifact | null {
    if (!isJsonRecord(value)) {
        return null;
    }

    const path = value['path'];
    const status = value['status'];
    const previousPath = value['previousPath'];
    if (
        !isJsonString(path) ||
        !isJsonString(status) ||
        !['added', 'modified', 'deleted', 'renamed', 'copied', 'type_changed', 'untracked'].includes(status)
    ) {
        return null;
    }

    return {
        path,
        status: status as DiffFileArtifact['status'],
        ...(isJsonString(previousPath) ? { previousPath } : {}),
    };
}

function mapDiffArtifact(value: string): DiffArtifact {
    const parsed = parseJsonValue(value, {}, isJsonRecord);
    const kind = parsed['kind'];
    const workspaceRootPath = parsed['workspaceRootPath'];
    const workspaceLabel = parsed['workspaceLabel'];
    if (!isJsonString(kind) || !isJsonString(workspaceRootPath) || !isJsonString(workspaceLabel)) {
        return {
            kind: 'unsupported',
            workspaceRootPath: 'Unknown workspace',
            workspaceLabel: 'Unknown workspace',
            reason: 'capture_failed',
            detail: 'Diff artifact payload was invalid.',
        };
    }

    if (kind === 'git') {
        const fileCount = parsed['fileCount'];
        const files = isJsonUnknownArray(parsed['files'])
            ? parsed['files'].map(mapDiffFileArtifact).filter((value): value is DiffFileArtifact => value !== null)
            : [];
        const fullPatch = isJsonString(parsed['fullPatch']) ? parsed['fullPatch'] : '';
        const patchesRaw = isJsonRecord(parsed['patchesByPath']) ? parsed['patchesByPath'] : {};
        const patchesByPath = Object.fromEntries(
            Object.entries(patchesRaw).flatMap(([path, patch]) => (typeof patch === 'string' ? [[path, patch]] : []))
        );

        return {
            kind: 'git',
            workspaceRootPath,
            workspaceLabel,
            baseRef: 'HEAD',
            fileCount: typeof fileCount === 'number' && Number.isFinite(fileCount) ? fileCount : files.length,
            files,
            fullPatch,
            patchesByPath,
        };
    }

    const reason = parsed['reason'];
    const detail = parsed['detail'];
    return {
        kind: 'unsupported',
        workspaceRootPath,
        workspaceLabel,
        reason:
            isJsonString(reason) &&
            ['workspace_not_git', 'git_unavailable', 'workspace_unresolved', 'capture_failed'].includes(reason)
                ? (reason as Extract<DiffArtifact, { kind: 'unsupported' }>['reason'])
                : 'capture_failed',
        detail: isJsonString(detail) ? detail : 'Diff capture is unavailable for this workspace.',
    };
}

const DIFF_COLUMNS = [
    'id',
    'profile_id',
    'session_id',
    'run_id',
    'summary',
    'artifact_json',
    'created_at',
    'updated_at',
] as const;

function mapDiffRecord(row: {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string | null;
    summary: string;
    artifact_json: string;
    created_at: string;
    updated_at: string;
}): DiffRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        sessionId: row.session_id,
        runId: row.run_id,
        summary: row.summary,
        artifact: mapDiffArtifact(row.artifact_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class DiffStore {
    async create(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        runId: EntityId<'run'> | null;
        summary: string;
        artifact: DiffArtifact;
    }): Promise<DiffRecord> {
        const { db } = getPersistence();
        const now = nowIso();

        const inserted = await db
            .insertInto('diffs')
            .values({
                id: createDiffId(),
                profile_id: input.profileId,
                session_id: input.sessionId,
                run_id: input.runId,
                summary: input.summary,
                payload_json: JSON.stringify({ kind: input.artifact.kind }),
                artifact_json: JSON.stringify(input.artifact),
                created_at: now,
                updated_at: now,
            })
            .returning(DIFF_COLUMNS)
            .executeTakeFirstOrThrow();

        return mapDiffRecord(inserted);
    }

    async getById(profileId: string, diffId: string): Promise<DiffRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('diffs')
            .select(DIFF_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('id', '=', diffId)
            .executeTakeFirst();

        return row ? mapDiffRecord(row) : null;
    }

    async listByRun(profileId: string, runId: EntityId<'run'>): Promise<DiffRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('diffs')
            .select(DIFF_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('run_id', '=', runId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapDiffRecord);
    }

    async listBySession(profileId: string, sessionId: EntityId<'sess'>): Promise<DiffRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('diffs')
            .select(DIFF_COLUMNS)
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapDiffRecord);
    }

    async listByProfile(profileId: string): Promise<DiffRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('diffs')
            .select(DIFF_COLUMNS)
            .where('profile_id', '=', profileId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapDiffRecord);
    }
}

export const diffStore = new DiffStore();

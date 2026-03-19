import path from 'node:path';

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { SandboxRecord } from '@/app/backend/persistence/types';
import { sandboxStatuses } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

function toPathKey(absolutePath: string): string {
    return process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
}

function canonicalizeAbsolutePath(value: string): string {
    return path.resolve(value.trim());
}

function mapSandboxRecord(row: {
    id: string;
    profile_id: string;
    workspace_fingerprint: string;
    absolute_path: string;
    label: string;
    status: string;
    creation_strategy: 'clone' | 'copy';
    created_at: string;
    updated_at: string;
    last_used_at: string;
}): SandboxRecord {
    return {
        id: parseEntityId(row.id, 'sandboxes.id', 'sb'),
        profileId: row.profile_id,
        workspaceFingerprint: row.workspace_fingerprint,
        absolutePath: row.absolute_path,
        label: row.label,
        status: parseEnumValue(row.status, 'sandboxes.status', sandboxStatuses),
        creationStrategy: row.creation_strategy,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
    };
}

export class SandboxStore {
    async listByProfile(profileId: string): Promise<SandboxRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('sandboxes')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('status', '!=', 'removed')
            .orderBy('updated_at', 'desc')
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapSandboxRecord);
    }

    async listByWorkspace(profileId: string, workspaceFingerprint: string): Promise<SandboxRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('sandboxes')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('workspace_fingerprint', '=', workspaceFingerprint)
            .where('status', '!=', 'removed')
            .orderBy('updated_at', 'desc')
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapSandboxRecord);
    }

    async getById(profileId: string, sandboxId: string): Promise<SandboxRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('sandboxes')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', sandboxId)
            .executeTakeFirst();

        return row ? mapSandboxRecord(row) : null;
    }

    async getByAbsolutePath(profileId: string, absolutePath: string): Promise<SandboxRecord | null> {
        const { db } = getPersistence();
        const canonicalAbsolutePath = canonicalizeAbsolutePath(absolutePath);
        const row = await db
            .selectFrom('sandboxes')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('path_key', '=', toPathKey(canonicalAbsolutePath))
            .executeTakeFirst();

        return row ? mapSandboxRecord(row) : null;
    }

    async create(input: {
        profileId: string;
        workspaceFingerprint: string;
        absolutePath: string;
        label: string;
        status: SandboxRecord['status'];
        creationStrategy: SandboxRecord['creationStrategy'];
    }): Promise<SandboxRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const absolutePath = canonicalizeAbsolutePath(input.absolutePath);
        const inserted = await db
            .insertInto('sandboxes')
            .values({
                id: createEntityId('sb'),
                profile_id: input.profileId,
                workspace_fingerprint: input.workspaceFingerprint,
                absolute_path: absolutePath,
                path_key: toPathKey(absolutePath),
                label: input.label,
                status: input.status,
                creation_strategy: input.creationStrategy,
                created_at: now,
                updated_at: now,
                last_used_at: now,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return mapSandboxRecord(inserted);
    }

    async update(input: {
        profileId: string;
        sandboxId: string;
        absolutePath?: string;
        label?: string;
        status?: SandboxRecord['status'];
        touchLastUsed?: boolean;
    }): Promise<SandboxRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const absolutePath = input.absolutePath ? canonicalizeAbsolutePath(input.absolutePath) : undefined;
        const updated = await db
            .updateTable('sandboxes')
            .set({
                ...(absolutePath ? { absolute_path: absolutePath, path_key: toPathKey(absolutePath) } : {}),
                ...(input.label ? { label: input.label } : {}),
                ...(input.status ? { status: input.status } : {}),
                ...(input.touchLastUsed ? { last_used_at: now } : {}),
                updated_at: now,
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.sandboxId)
            .returningAll()
            .executeTakeFirst();

        return updated ? mapSandboxRecord(updated) : null;
    }

    async delete(profileId: string, sandboxId: string): Promise<boolean> {
        const { db } = getPersistence();
        const deleted = await db
            .deleteFrom('sandboxes')
            .where('profile_id', '=', profileId)
            .where('id', '=', sandboxId)
            .returning('id')
            .executeTakeFirst();

        return Boolean(deleted);
    }

    async listOrphaned(profileId: string): Promise<SandboxRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('sandboxes')
            .leftJoin('threads', (join) =>
                join.onRef('threads.sandbox_id', '=', 'sandboxes.id').onRef('threads.profile_id', '=', 'sandboxes.profile_id')
            )
            .leftJoin('sessions', (join) =>
                join.onRef('sessions.sandbox_id', '=', 'sandboxes.id').onRef('sessions.profile_id', '=', 'sandboxes.profile_id')
            )
            .select([
                'sandboxes.id',
                'sandboxes.profile_id',
                'sandboxes.workspace_fingerprint',
                'sandboxes.absolute_path',
                'sandboxes.label',
                'sandboxes.status',
                'sandboxes.creation_strategy',
                'sandboxes.created_at',
                'sandboxes.updated_at',
                'sandboxes.last_used_at',
            ])
            .where('sandboxes.profile_id', '=', profileId)
            .where('sandboxes.status', '!=', 'removed')
            .groupBy([
                'sandboxes.id',
                'sandboxes.profile_id',
                'sandboxes.workspace_fingerprint',
                'sandboxes.absolute_path',
                'sandboxes.label',
                'sandboxes.status',
                'sandboxes.creation_strategy',
                'sandboxes.created_at',
                'sandboxes.updated_at',
                'sandboxes.last_used_at',
            ])
            .having((eb) => eb.fn.count('threads.id'), '=', 0)
            .having((eb) => eb.fn.count('sessions.id'), '=', 0)
            .execute();

        return rows.map(mapSandboxRecord);
    }

    async hasRunningSession(profileId: string, sandboxId: string): Promise<boolean> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('sessions')
            .select('id')
            .where('profile_id', '=', profileId)
            .where('sandbox_id', '=', sandboxId)
            .where('run_status', '=', 'running')
            .executeTakeFirst();

        return Boolean(row);
    }
}

export const sandboxStore = new SandboxStore();


import path from 'node:path';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { WorkspaceRootRecord } from '@/app/backend/persistence/types';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';

function canonicalizeWorkspacePath(inputPath: string): string {
    return path.resolve(inputPath.trim());
}

function toPathKey(absolutePath: string): string {
    return process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
}

function toWorkspaceLabel(absolutePath: string): string {
    const baseName = path.basename(absolutePath);
    return baseName.length > 0 ? baseName : absolutePath;
}

function resolveWorkspaceLabel(absolutePath: string, labelOverride?: string): string {
    const trimmedLabel = labelOverride?.trim();
    return trimmedLabel && trimmedLabel.length > 0 ? trimmedLabel : toWorkspaceLabel(absolutePath);
}

function mapWorkspaceRootRecord(row: {
    fingerprint: string;
    profile_id: string;
    absolute_path: string;
    label: string;
    created_at: string;
    updated_at: string;
}): WorkspaceRootRecord {
    return {
        fingerprint: row.fingerprint,
        profileId: row.profile_id,
        absolutePath: row.absolute_path,
        label: row.label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class WorkspaceRootStore {
    async listByProfile(profileId: string): Promise<WorkspaceRootRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('workspace_roots')
            .select(['fingerprint', 'profile_id', 'absolute_path', 'label', 'created_at', 'updated_at'])
            .where('profile_id', '=', profileId)
            .orderBy('updated_at', 'desc')
            .orderBy('label', 'asc')
            .execute();

        return rows.map(mapWorkspaceRootRecord);
    }

    async getByFingerprint(profileId: string, fingerprint: string): Promise<WorkspaceRootRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('workspace_roots')
            .select(['fingerprint', 'profile_id', 'absolute_path', 'label', 'created_at', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('fingerprint', '=', fingerprint)
            .executeTakeFirst();

        return row ? mapWorkspaceRootRecord(row) : null;
    }

    async resolveOrCreate(
        profileId: string,
        workspacePath: string,
        labelOverride?: string
    ): Promise<WorkspaceRootRecord> {
        const { db } = getPersistence();
        const absolutePath = canonicalizeWorkspacePath(workspacePath);
        const pathKey = toPathKey(absolutePath);
        const now = nowIso();
        const label = resolveWorkspaceLabel(absolutePath, labelOverride);

        const existing = await db
            .selectFrom('workspace_roots')
            .select(['fingerprint', 'profile_id', 'absolute_path', 'label', 'created_at', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('path_key', '=', pathKey)
            .executeTakeFirst();
        if (existing) {
            await db
                .updateTable('workspace_roots')
                .set({
                    absolute_path: absolutePath,
                    label,
                    updated_at: now,
                })
                .where('profile_id', '=', profileId)
                .where('fingerprint', '=', existing.fingerprint)
                .execute();

            const refreshed = await this.getByFingerprint(profileId, existing.fingerprint);
            if (!refreshed) {
                throw new InvariantError('Workspace root disappeared after update.');
            }
            return refreshed;
        }

        const inserted = await db
            .insertInto('workspace_roots')
            .values({
                fingerprint: createEntityId('ws'),
                profile_id: profileId,
                absolute_path: absolutePath,
                path_key: pathKey,
                label,
                created_at: now,
                updated_at: now,
            })
            .returning(['fingerprint', 'profile_id', 'absolute_path', 'label', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow();

        return mapWorkspaceRootRecord(inserted);
    }

    async deleteByProfile(profileId: string): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('workspace_roots')
            .where('profile_id', '=', profileId)
            .returning('fingerprint')
            .execute();
        return rows.length;
    }
}

export const workspaceRootStore = new WorkspaceRootStore();

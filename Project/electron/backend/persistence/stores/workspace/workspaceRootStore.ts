import path from 'node:path';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { WorkspaceRootRecord } from '@/app/backend/persistence/types';
import type { WorkspaceIconKind, WorkspaceIconSourceKind } from '@/app/backend/runtime/contracts';
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

const workspaceRootSelectColumns = [
    'fingerprint',
    'profile_id',
    'absolute_path',
    'label',
    'icon_kind',
    'icon_source_kind',
    'icon_detected_relative_path',
    'icon_updated_at',
    'created_at',
    'updated_at',
] as const;

function mapWorkspaceRootRecord(row: {
    fingerprint: string;
    profile_id: string;
    absolute_path: string;
    label: string;
    icon_kind: string;
    icon_source_kind: string | null;
    icon_detected_relative_path: string | null;
    icon_updated_at: string;
    created_at: string;
    updated_at: string;
}): WorkspaceRootRecord {
    const iconKind = row.icon_kind === 'manual' || row.icon_kind === 'detected' ? row.icon_kind : 'fallback';
    const sourceKind =
        iconKind === 'detected' &&
        (row.icon_source_kind === 'well_known_file' ||
            row.icon_source_kind === 'html_link' ||
            row.icon_source_kind === 'manifest_icon')
            ? row.icon_source_kind
            : undefined;
    return {
        fingerprint: row.fingerprint,
        profileId: row.profile_id,
        absolutePath: row.absolute_path,
        label: row.label,
        workspaceIconSummary: {
            kind: iconKind,
            ...(sourceKind ? { sourceKind } : {}),
            ...(iconKind === 'detected' && row.icon_detected_relative_path
                ? { detectedRelativePath: row.icon_detected_relative_path }
                : {}),
            updatedAt: row.icon_updated_at,
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export interface WorkspaceRootIconMetadataPatch {
    iconKind: WorkspaceIconKind;
    iconSourceKind?: WorkspaceIconSourceKind;
    iconDetectedRelativePath?: string;
    iconManualStorageRelativePath?: string;
    iconManualMimeType?: string;
    iconManualSha256?: string;
    iconUpdatedAt: string;
}

export interface WorkspaceRootAssetMetadata {
    profileId: string;
    fingerprint: string;
    absolutePath: string;
    iconKind: WorkspaceIconKind;
    iconDetectedRelativePath?: string;
    iconManualStorageRelativePath?: string;
    iconManualMimeType?: string;
}

export class WorkspaceRootStore {
    async listByProfile(profileId: string): Promise<WorkspaceRootRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('workspace_roots')
            .select(workspaceRootSelectColumns)
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
            .select(workspaceRootSelectColumns)
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
            .select(workspaceRootSelectColumns)
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
                icon_kind: 'fallback',
                icon_source_kind: null,
                icon_detected_relative_path: null,
                icon_manual_storage_relative_path: null,
                icon_manual_mime_type: null,
                icon_manual_sha256: null,
                icon_updated_at: now,
                created_at: now,
                updated_at: now,
            })
            .returning(workspaceRootSelectColumns)
            .executeTakeFirstOrThrow();

        return mapWorkspaceRootRecord(inserted);
    }

    async updateMetadata(input: {
        profileId: string;
        fingerprint: string;
        label?: string;
        icon?: WorkspaceRootIconMetadataPatch;
    }): Promise<WorkspaceRootRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const update: {
            label?: string;
            icon_kind?: WorkspaceIconKind;
            icon_source_kind?: WorkspaceIconSourceKind | null;
            icon_detected_relative_path?: string | null;
            icon_manual_storage_relative_path?: string | null;
            icon_manual_mime_type?: string | null;
            icon_manual_sha256?: string | null;
            icon_updated_at?: string;
            updated_at: string;
        } = {
            updated_at: now,
        };
        if (input.label !== undefined) {
            update.label = input.label.trim();
        }
        if (input.icon) {
            update.icon_kind = input.icon.iconKind;
            update.icon_source_kind = input.icon.iconSourceKind ?? null;
            update.icon_detected_relative_path = input.icon.iconDetectedRelativePath ?? null;
            update.icon_manual_storage_relative_path = input.icon.iconManualStorageRelativePath ?? null;
            update.icon_manual_mime_type = input.icon.iconManualMimeType ?? null;
            update.icon_manual_sha256 = input.icon.iconManualSha256 ?? null;
            update.icon_updated_at = input.icon.iconUpdatedAt;
        }

        await db
            .updateTable('workspace_roots')
            .set(update)
            .where('profile_id', '=', input.profileId)
            .where('fingerprint', '=', input.fingerprint)
            .execute();

        return this.getByFingerprint(input.profileId, input.fingerprint);
    }

    async updateDetectedIconMetadata(input: {
        profileId: string;
        fingerprint: string;
        label?: string;
        iconSourceKind?: WorkspaceIconSourceKind;
        iconDetectedRelativePath?: string;
        iconUpdatedAt: string;
    }): Promise<WorkspaceRootRecord | null> {
        const existing = await this.getAssetMetadata(input.profileId, input.fingerprint);
        if (!existing) {
            return null;
        }

        const { db } = getPersistence();
        const now = nowIso();
        const hasDetectedIcon = Boolean(input.iconSourceKind && input.iconDetectedRelativePath);
        await db
            .updateTable('workspace_roots')
            .set({
                icon_kind: existing.iconManualStorageRelativePath
                    ? 'manual'
                    : hasDetectedIcon
                      ? 'detected'
                      : 'fallback',
                icon_source_kind: input.iconSourceKind ?? null,
                icon_detected_relative_path: input.iconDetectedRelativePath ?? null,
                icon_updated_at: input.iconUpdatedAt,
                ...(input.label !== undefined ? { label: input.label.trim() } : {}),
                updated_at: now,
            })
            .where('profile_id', '=', input.profileId)
            .where('fingerprint', '=', input.fingerprint)
            .execute();

        return this.getByFingerprint(input.profileId, input.fingerprint);
    }

    async getAssetMetadata(profileId: string, fingerprint: string): Promise<WorkspaceRootAssetMetadata | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('workspace_roots')
            .select([
                'profile_id',
                'fingerprint',
                'absolute_path',
                'icon_kind',
                'icon_detected_relative_path',
                'icon_manual_storage_relative_path',
                'icon_manual_mime_type',
            ])
            .where('profile_id', '=', profileId)
            .where('fingerprint', '=', fingerprint)
            .executeTakeFirst();

        if (!row) {
            return null;
        }

        return {
            profileId: row.profile_id,
            fingerprint: row.fingerprint,
            absolutePath: row.absolute_path,
            iconKind: row.icon_kind === 'manual' || row.icon_kind === 'detected' ? row.icon_kind : 'fallback',
            ...(row.icon_detected_relative_path ? { iconDetectedRelativePath: row.icon_detected_relative_path } : {}),
            ...(row.icon_manual_storage_relative_path
                ? { iconManualStorageRelativePath: row.icon_manual_storage_relative_path }
                : {}),
            ...(row.icon_manual_mime_type ? { iconManualMimeType: row.icon_manual_mime_type } : {}),
        };
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

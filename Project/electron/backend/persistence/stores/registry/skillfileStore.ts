import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { isJsonString, isJsonUnknownArray, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type { SkillfileDefinitionRecord } from '@/app/backend/persistence/types';
import {
    registryAssetTargetKinds,
    registryPresetKeys,
    registryScopes,
    registrySourceKinds,
} from '@/app/backend/runtime/contracts';
import { normalizeSkillDynamicContextSources } from '@/app/backend/runtime/services/sessionSkills/dynamicContextSources';

function parseTags(value: string): string[] | undefined {
    const parsed = parseJsonValue(value, [], isJsonUnknownArray).filter(isJsonString);
    return parsed.length > 0 ? parsed : undefined;
}

function parseTargetMode(row: {
    target_top_level_tab: string | null;
    target_mode_key: string | null;
}): SkillfileDefinitionRecord['targetMode'] {
    if (!row.target_top_level_tab || !row.target_mode_key) {
        return undefined;
    }

    if (
        row.target_top_level_tab !== 'chat' &&
        row.target_top_level_tab !== 'agent' &&
        row.target_top_level_tab !== 'orchestrator'
    ) {
        throw new Error(`Invalid skillfiles.target_top_level_tab value: ${row.target_top_level_tab}`);
    }

    return {
        topLevelTab: row.target_top_level_tab,
        modeKey: row.target_mode_key,
    };
}

function mapSkillfileDefinition(row: {
    id: string;
    profile_id: string;
    asset_key: string;
    target_kind: string;
    scope: string;
    workspace_fingerprint: string | null;
    preset_key: string | null;
    target_top_level_tab: string | null;
    target_mode_key: string | null;
    name: string;
    dynamic_context_sources_json: string;
    source: string;
    source_kind: string;
    origin_path: string | null;
    relative_root_path: string | null;
    description: string | null;
    tags_json: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}): SkillfileDefinitionRecord {
    const tags = parseTags(row.tags_json);
    const targetMode = parseTargetMode(row);
    return {
        id: row.id,
        profileId: row.profile_id,
        assetKey: row.asset_key,
        targetKind: parseEnumValue(row.target_kind, 'skillfiles.target_kind', registryAssetTargetKinds),
        scope: parseEnumValue(row.scope, 'skillfiles.scope', registryScopes),
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        ...(row.preset_key
            ? { presetKey: parseEnumValue(row.preset_key, 'skillfiles.preset_key', registryPresetKeys) }
            : {}),
        ...(targetMode ? { targetMode } : {}),
        name: row.name,
        dynamicContextSources: normalizeSkillDynamicContextSources(
            parseJsonValue(row.dynamic_context_sources_json, [], isJsonUnknownArray)
        ),
        source: row.source,
        sourceKind: parseEnumValue(row.source_kind, 'skillfiles.source_kind', registrySourceKinds),
        ...(row.origin_path ? { originPath: row.origin_path } : {}),
        ...(row.relative_root_path ? { relativeRootPath: row.relative_root_path } : {}),
        ...(row.description ? { description: row.description } : {}),
        ...(tags ? { tags } : {}),
        enabled: row.enabled === 1,
        precedence: row.precedence,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class SkillfileStore {
    async listByProfile(profileId: string): Promise<SkillfileDefinitionRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('skillfiles')
            .select([
                'id',
                'profile_id',
                'asset_key',
                'target_kind',
                'scope',
                'workspace_fingerprint',
                'preset_key',
                'target_top_level_tab',
                'target_mode_key',
                'name',
                'dynamic_context_sources_json',
                'source',
                'source_kind',
                'origin_path',
                'relative_root_path',
                'description',
                'tags_json',
                'enabled',
                'precedence',
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .orderBy('precedence', 'desc')
            .orderBy('updated_at', 'desc')
            .execute();

        return rows.map(mapSkillfileDefinition);
    }

    async findById(profileId: string, skillId: string): Promise<SkillfileDefinitionRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('skillfiles')
            .select([
                'id',
                'profile_id',
                'asset_key',
                'target_kind',
                'scope',
                'workspace_fingerprint',
                'preset_key',
                'target_top_level_tab',
                'target_mode_key',
                'name',
                'dynamic_context_sources_json',
                'source',
                'source_kind',
                'origin_path',
                'relative_root_path',
                'description',
                'tags_json',
                'enabled',
                'precedence',
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('id', '=', skillId)
            .executeTakeFirst();

        return row ? mapSkillfileDefinition(row) : null;
    }
}

export const skillfileStore = new SkillfileStore();

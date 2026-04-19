import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { isJsonString, isJsonUnknownArray, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type { SkillfileDefinitionRecord } from '@/app/backend/persistence/types';
import { registryPresetKeys, registryScopes, registrySourceKinds } from '@/app/backend/runtime/contracts';
import { normalizeSkillDynamicContextSources } from '@/app/backend/runtime/services/sessionSkills/dynamicContextSources';

function parseTags(value: string): string[] | undefined {
    const parsed = parseJsonValue(value, [], isJsonUnknownArray).filter(isJsonString);
    return parsed.length > 0 ? parsed : undefined;
}

function mapSkillfileDefinition(row: {
    id: string;
    profile_id: string;
    asset_key: string;
    scope: string;
    workspace_fingerprint: string | null;
    preset_key: string | null;
    name: string;
    body_markdown: string;
    dynamic_context_sources_json: string;
    source: string;
    source_kind: string;
    origin_path: string | null;
    description: string | null;
    tags_json: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}): SkillfileDefinitionRecord {
    const tags = parseTags(row.tags_json);
    return {
        id: row.id,
        profileId: row.profile_id,
        assetKey: row.asset_key,
        scope: parseEnumValue(row.scope, 'skillfiles.scope', registryScopes),
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        ...(row.preset_key
            ? { presetKey: parseEnumValue(row.preset_key, 'skillfiles.preset_key', registryPresetKeys) }
            : {}),
        name: row.name,
        bodyMarkdown: row.body_markdown,
        dynamicContextSources: normalizeSkillDynamicContextSources(parseJsonValue(row.dynamic_context_sources_json, [], isJsonUnknownArray)),
        source: row.source,
        sourceKind: parseEnumValue(row.source_kind, 'skillfiles.source_kind', registrySourceKinds),
        ...(row.origin_path ? { originPath: row.origin_path } : {}),
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
                'scope',
                'workspace_fingerprint',
                'preset_key',
                'name',
                'body_markdown',
                'dynamic_context_sources_json',
                'source',
                'source_kind',
                'origin_path',
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
}

export const skillfileStore = new SkillfileStore();

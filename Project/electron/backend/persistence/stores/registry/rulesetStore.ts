import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { isJsonString, isJsonUnknownArray, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type { RulesetDefinitionRecord } from '@/app/backend/persistence/types';
import {
    registryAssetTargetKinds,
    registryPresetKeys,
    registryScopes,
    registrySourceKinds,
    ruleActivationModes,
} from '@/app/backend/runtime/contracts';

function parseTags(value: string): string[] | undefined {
    const parsed = parseJsonValue(value, [], isJsonUnknownArray).filter(isJsonString);
    return parsed.length > 0 ? parsed : undefined;
}

function parseTargetMode(row: {
    target_top_level_tab: string | null;
    target_mode_key: string | null;
}): RulesetDefinitionRecord['targetMode'] {
    if (!row.target_top_level_tab || !row.target_mode_key) {
        return undefined;
    }

    if (
        row.target_top_level_tab !== 'chat' &&
        row.target_top_level_tab !== 'agent' &&
        row.target_top_level_tab !== 'orchestrator'
    ) {
        throw new Error(`Invalid rulesets.target_top_level_tab value: ${row.target_top_level_tab}`);
    }

    return {
        topLevelTab: row.target_top_level_tab,
        modeKey: row.target_mode_key,
    };
}

function mapRulesetDefinition(row: {
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
    body_markdown: string;
    source: string;
    source_kind: string;
    origin_path: string | null;
    relative_root_path: string | null;
    description: string | null;
    tags_json: string;
    activation_mode: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}): RulesetDefinitionRecord {
    const tags = parseTags(row.tags_json);
    const targetMode = parseTargetMode(row);
    return {
        id: row.id,
        profileId: row.profile_id,
        assetKey: row.asset_key,
        targetKind: parseEnumValue(row.target_kind, 'rulesets.target_kind', registryAssetTargetKinds),
        scope: parseEnumValue(row.scope, 'rulesets.scope', registryScopes),
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        ...(row.preset_key
            ? { presetKey: parseEnumValue(row.preset_key, 'rulesets.preset_key', registryPresetKeys) }
            : {}),
        ...(targetMode ? { targetMode } : {}),
        name: row.name,
        bodyMarkdown: row.body_markdown,
        activationMode: parseEnumValue(row.activation_mode, 'rulesets.activation_mode', ruleActivationModes),
        source: row.source,
        sourceKind: parseEnumValue(row.source_kind, 'rulesets.source_kind', registrySourceKinds),
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

export class RulesetStore {
    async listByProfile(profileId: string): Promise<RulesetDefinitionRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('rulesets')
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
                'body_markdown',
                'source',
                'source_kind',
                'origin_path',
                'relative_root_path',
                'description',
                'tags_json',
                'activation_mode',
                'enabled',
                'precedence',
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .orderBy('precedence', 'desc')
            .orderBy('updated_at', 'desc')
            .execute();

        return rows.map(mapRulesetDefinition);
    }
}

export const rulesetStore = new RulesetStore();

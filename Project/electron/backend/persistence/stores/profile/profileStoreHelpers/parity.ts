import { randomUUID } from 'node:crypto';

import type { ProfileStoreDb } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/types';

async function copyModeDefinitions(
    tx: ProfileStoreDb,
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const modes = await tx
        .selectFrom('mode_definitions')
        .select([
            'top_level_tab',
            'mode_key',
            'label',
            'asset_key',
            'prompt_json',
            'prompt_layer_overrides_json',
            'execution_policy_json',
            'source',
            'source_kind',
            'scope',
            'workspace_fingerprint',
            'origin_path',
            'description',
            'when_to_use',
            'groups_json',
            'tags_json',
            'enabled',
            'precedence',
        ])
        .where('profile_id', '=', sourceProfileId)
        .orderBy('top_level_tab', 'asc')
        .orderBy('mode_key', 'asc')
        .execute();

    if (modes.length === 0) {
        return;
    }

    await tx
        .insertInto('mode_definitions')
        .values(
            modes.map((mode) => ({
                id: `mode_${targetProfileId}_${mode.top_level_tab}_${mode.mode_key}_${randomUUID()}`,
                profile_id: targetProfileId,
                top_level_tab: mode.top_level_tab,
                mode_key: mode.mode_key,
                label: mode.label,
                asset_key: mode.asset_key,
                prompt_json: mode.prompt_json,
                prompt_layer_overrides_json: mode.prompt_layer_overrides_json,
                execution_policy_json: mode.execution_policy_json,
                source: mode.source,
                source_kind: mode.source_kind,
                scope: mode.scope,
                workspace_fingerprint: mode.workspace_fingerprint,
                origin_path: mode.origin_path,
                description: mode.description,
                when_to_use: mode.when_to_use,
                groups_json: mode.groups_json,
                tags_json: mode.tags_json,
                enabled: mode.enabled,
                precedence: mode.precedence,
                created_at: timestamp,
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function copyRulesets(
    tx: ProfileStoreDb,
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const rows = await tx
        .selectFrom('rulesets')
        .select([
            'asset_key',
            'scope',
            'workspace_fingerprint',
            'preset_key',
            'name',
            'body_markdown',
            'source',
            'source_kind',
            'origin_path',
            'description',
            'tags_json',
            'activation_mode',
            'enabled',
            'precedence',
        ])
        .where('profile_id', '=', sourceProfileId)
        .execute();

    if (rows.length === 0) {
        return;
    }

    await tx
        .insertInto('rulesets')
        .values(
            rows.map((row) => ({
                id: `ruleset_${randomUUID()}`,
                profile_id: targetProfileId,
                asset_key: row.asset_key,
                scope: row.scope,
                workspace_fingerprint: row.workspace_fingerprint,
                preset_key: row.preset_key,
                name: row.name,
                body_markdown: row.body_markdown,
                source: row.source,
                source_kind: row.source_kind,
                origin_path: row.origin_path,
                description: row.description,
                tags_json: row.tags_json,
                activation_mode: row.activation_mode,
                enabled: row.enabled,
                precedence: row.precedence,
                created_at: timestamp,
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function copySkillfiles(
    tx: ProfileStoreDb,
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const rows = await tx
        .selectFrom('skillfiles')
        .select([
            'asset_key',
            'scope',
            'workspace_fingerprint',
            'preset_key',
            'name',
            'body_markdown',
            'source',
            'source_kind',
            'origin_path',
            'description',
            'tags_json',
            'enabled',
            'precedence',
        ])
        .where('profile_id', '=', sourceProfileId)
        .execute();

    if (rows.length === 0) {
        return;
    }

    await tx
        .insertInto('skillfiles')
        .values(
            rows.map((row) => ({
                id: `skillfile_${randomUUID()}`,
                profile_id: targetProfileId,
                asset_key: row.asset_key,
                scope: row.scope,
                workspace_fingerprint: row.workspace_fingerprint,
                preset_key: row.preset_key,
                name: row.name,
                body_markdown: row.body_markdown,
                source: row.source,
                source_kind: row.source_kind,
                origin_path: row.origin_path,
                description: row.description,
                tags_json: row.tags_json,
                enabled: row.enabled,
                precedence: row.precedence,
                created_at: timestamp,
                updated_at: timestamp,
            }))
        )
        .execute();
}

export async function copyProfileParityRows(input: {
    tx: ProfileStoreDb;
    sourceProfileId: string;
    targetProfileId: string;
    timestamp: string;
}): Promise<void> {
    await copyModeDefinitions(input.tx, input.sourceProfileId, input.targetProfileId, input.timestamp);
    await copyRulesets(input.tx, input.sourceProfileId, input.targetProfileId, input.timestamp);
    await copySkillfiles(input.tx, input.sourceProfileId, input.targetProfileId, input.timestamp);
}

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso, isJsonRecord, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type { BuiltInModePromptOverrideRecord } from '@/app/backend/persistence/types';
import {
    normalizePreparedContextModeOverrides,
    normalizeModePromptDefinition,
    topLevelTabs,
    type ModePromptDefinition,
    type PreparedContextModeOverrides,
    type TopLevelTab,
} from '@/app/backend/runtime/contracts';

function mapBuiltInModePromptOverride(row: {
    profile_id: string;
    top_level_tab: string;
    mode_key: string;
    prompt_json: string;
    prompt_layer_overrides_json: string;
    updated_at: string;
}): BuiltInModePromptOverrideRecord {
    return {
        profileId: row.profile_id,
        topLevelTab: parseEnumValue(row.top_level_tab, 'built_in_mode_prompt_overrides.top_level_tab', topLevelTabs),
        modeKey: row.mode_key,
        prompt: normalizeModePromptDefinition(parseJsonValue(row.prompt_json, {}, isJsonRecord)),
        promptLayerOverrides: normalizePreparedContextModeOverrides(
            parseJsonValue(row.prompt_layer_overrides_json, {}, isJsonRecord)
        ),
        updatedAt: row.updated_at,
    };
}

export class BuiltInModePromptOverrideStore {
    async listByProfile(profileId: string): Promise<BuiltInModePromptOverrideRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('built_in_mode_prompt_overrides')
            .select(['profile_id', 'top_level_tab', 'mode_key', 'prompt_json', 'prompt_layer_overrides_json', 'updated_at'])
            .where('profile_id', '=', profileId)
            .orderBy('top_level_tab', 'asc')
            .orderBy('mode_key', 'asc')
            .execute();

        return rows.map(mapBuiltInModePromptOverride);
    }

    async getByProfileTabMode(
        profileId: string,
        topLevelTab: TopLevelTab,
        modeKey: string
    ): Promise<BuiltInModePromptOverrideRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('built_in_mode_prompt_overrides')
            .select(['profile_id', 'top_level_tab', 'mode_key', 'prompt_json', 'prompt_layer_overrides_json', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('top_level_tab', '=', topLevelTab)
            .where('mode_key', '=', modeKey)
            .executeTakeFirst();

        return row ? mapBuiltInModePromptOverride(row) : null;
    }

    async setPrompt(input: {
        profileId: string;
        topLevelTab: TopLevelTab;
        modeKey: string;
        prompt: ModePromptDefinition;
        promptLayerOverrides: PreparedContextModeOverrides;
    }): Promise<BuiltInModePromptOverrideRecord> {
        const { db } = getPersistence();
        const normalizedPrompt = normalizeModePromptDefinition(input.prompt);
        const promptLayerOverrides = normalizePreparedContextModeOverrides(input.promptLayerOverrides);
        const updatedAt = nowIso();

        await db
            .insertInto('built_in_mode_prompt_overrides')
            .values({
                profile_id: input.profileId,
                top_level_tab: input.topLevelTab,
                mode_key: input.modeKey,
                prompt_json: JSON.stringify(normalizedPrompt),
                prompt_layer_overrides_json: JSON.stringify(promptLayerOverrides),
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'top_level_tab', 'mode_key']).doUpdateSet({
                    prompt_json: JSON.stringify(normalizedPrompt),
                    prompt_layer_overrides_json: JSON.stringify(promptLayerOverrides),
                    updated_at: updatedAt,
                })
            )
            .execute();

        return {
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            prompt: normalizedPrompt,
            promptLayerOverrides,
            updatedAt,
        };
    }

    async delete(profileId: string, topLevelTab: TopLevelTab, modeKey: string): Promise<void> {
        const { db } = getPersistence();
        await db
            .deleteFrom('built_in_mode_prompt_overrides')
            .where('profile_id', '=', profileId)
            .where('top_level_tab', '=', topLevelTab)
            .where('mode_key', '=', modeKey)
            .execute();
    }
}

export const builtInModePromptOverrideStore = new BuiltInModePromptOverrideStore();

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import {
    isJsonRecord,
    isJsonString,
    isJsonUnknownArray,
    parseJsonValue,
} from '@/app/backend/persistence/stores/shared/utils';
import type { ModeDefinitionRecord } from '@/app/backend/persistence/types';
import { normalizeModeMetadata, normalizeModePromptDefinition, registryScopes, registrySourceKinds, topLevelTabs } from '@/app/backend/runtime/contracts';
import type { ModeExecutionPolicy, ToolCapability, RuntimeRequirementProfile, TopLevelTab } from '@/app/backend/runtime/contracts';

import {
    behaviorFlags as knownBehaviorFlags,
    runtimeRequirementProfiles as knownRuntimeRequirementProfiles,
    toolCapabilities as knownToolCapabilities,
    workflowCapabilities as knownWorkflowCapabilities,
} from '@/shared/contracts/enums';

function parseToolCapabilities(value: unknown): ToolCapability[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const capabilities = value.filter(
        (capability): capability is ToolCapability =>
            typeof capability === 'string' && knownToolCapabilities.includes(capability as ToolCapability)
    );
    return Array.from(new Set(capabilities));
}

function parseEnumArray<const T extends readonly string[]>(
    value: unknown,
    allowedValues: T
): T[number][] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const capabilities = value.filter(
        (capability): capability is T[number] =>
            typeof capability === 'string' && allowedValues.includes(capability as T[number])
    );
    return capabilities.length > 0 ? Array.from(new Set(capabilities)) : undefined;
}

function parseExecutionPolicy(value: string): ModeExecutionPolicy {
    const parsed = parseJsonValue(value, {}, isJsonRecord);
    const planningOnly = parsed['planningOnly'];
    const readOnly = parsed['readOnly'];
    const toolCapabilities = parseToolCapabilities(parsed['toolCapabilities']);
    const workflowCapabilities = parseEnumArray(parsed['workflowCapabilities'], knownWorkflowCapabilities);
    const behaviorFlags = parseEnumArray(parsed['behaviorFlags'], knownBehaviorFlags);
    const runtimeProfile =
        typeof parsed['runtimeProfile'] === 'string' &&
        knownRuntimeRequirementProfiles.includes(parsed['runtimeProfile'] as RuntimeRequirementProfile)
            ? (parsed['runtimeProfile'] as RuntimeRequirementProfile)
            : undefined;
    const normalizedToolCapabilities = toolCapabilities ?? (readOnly === true ? ['filesystem_read'] : undefined);

    return {
        ...(typeof planningOnly === 'boolean' ? { planningOnly } : {}),
        ...(normalizedToolCapabilities ? { toolCapabilities: normalizedToolCapabilities } : {}),
        ...(workflowCapabilities ? { workflowCapabilities } : {}),
        ...(behaviorFlags ? { behaviorFlags } : {}),
        ...(runtimeProfile ? { runtimeProfile } : {}),
    };
}

function parseTags(value: string): string[] | undefined {
    const parsed = parseJsonValue(value, [], isJsonUnknownArray).filter(isJsonString);
    return parsed.length > 0 ? parsed : undefined;
}

function parseLegacyGroupAlias(value: string): string[] | undefined {
    const parsed = parseJsonValue(value, [], isJsonUnknownArray)
        .filter(isJsonString)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return parsed.length > 0 ? Array.from(new Set(parsed)) : undefined;
}

function mergeTags(values: Array<string[] | undefined>): string[] | undefined {
    const mergedTags = values.flatMap((value) => value ?? []);
    return mergedTags.length > 0 ? Array.from(new Set(mergedTags)) : undefined;
}

function mapModeDefinition(row: {
    id: string;
    profile_id: string;
    top_level_tab: string;
    mode_key: string;
    label: string;
    asset_key: string;
    prompt_json: string;
    execution_policy_json: string;
    source: string;
    source_kind: string;
    scope: string;
    workspace_fingerprint: string | null;
    origin_path: string | null;
    description: string | null;
    when_to_use: string | null;
    groups_json: string;
    tags_json: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}): ModeDefinitionRecord {
    const tags = mergeTags([parseTags(row.tags_json), parseLegacyGroupAlias(row.groups_json)]);
    const metadata = normalizeModeMetadata({
        whenToUse: row.when_to_use,
        ...(tags ? { tags } : {}),
    });
    return {
        id: row.id,
        profileId: row.profile_id,
        topLevelTab: parseEnumValue(row.top_level_tab, 'mode_definitions.top_level_tab', topLevelTabs),
        modeKey: row.mode_key,
        label: row.label,
        assetKey: row.asset_key,
        prompt: normalizeModePromptDefinition(parseJsonValue(row.prompt_json, {}, isJsonRecord)),
        executionPolicy: parseExecutionPolicy(row.execution_policy_json),
        source: row.source,
        sourceKind: parseEnumValue(row.source_kind, 'mode_definitions.source_kind', registrySourceKinds),
        scope: parseEnumValue(row.scope, 'mode_definitions.scope', registryScopes),
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        ...(row.origin_path ? { originPath: row.origin_path } : {}),
        ...(row.description ? { description: row.description } : {}),
        ...metadata,
        ...(tags ? { tags } : {}),
        enabled: row.enabled === 1,
        precedence: row.precedence,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class ModeStore {
    async getByProfileTabMode(
        profileId: string,
        topLevelTab: TopLevelTab,
        modeKey: string
    ): Promise<ModeDefinitionRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('mode_definitions')
            .select([
                'id',
                'profile_id',
                'top_level_tab',
                'mode_key',
                'label',
                'asset_key',
                'prompt_json',
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
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('top_level_tab', '=', topLevelTab)
            .where('mode_key', '=', modeKey)
            .executeTakeFirst();

        return row ? mapModeDefinition(row) : null;
    }

    async listByProfileAndTab(profileId: string, topLevelTab: TopLevelTab): Promise<ModeDefinitionRecord[]> {
        const all = await this.listByProfile(profileId);
        return all.filter((mode) => mode.topLevelTab === topLevelTab);
    }

    async listByProfile(profileId: string): Promise<ModeDefinitionRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('mode_definitions')
            .select([
                'id',
                'profile_id',
                'top_level_tab',
                'mode_key',
                'label',
                'asset_key',
                'prompt_json',
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
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .orderBy('top_level_tab', 'asc')
            .orderBy('precedence', 'desc')
            .orderBy('mode_key', 'asc')
            .execute();

        return rows.map(mapModeDefinition);
    }
}

export const modeStore = new ModeStore();

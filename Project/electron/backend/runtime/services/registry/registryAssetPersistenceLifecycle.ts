import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { RegistryScope } from '@/app/backend/runtime/contracts';
import type {
    ParsedRegistryModeAsset,
    ParsedRegistryRulesetAsset,
    ParsedRegistrySkillAsset,
} from '@/app/backend/runtime/services/registry/registryLifecycle.types';
import { toSourceKind } from '@/app/backend/runtime/services/registry/filesystem';

export async function replaceDiscoveredModes(input: {
    profileId: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
    modes: ParsedRegistryModeAsset[];
}): Promise<void> {
    const { db } = getPersistence();
    const now = nowIso();
    const sourceKind = toSourceKind(input.scope);

    await db
        .deleteFrom('mode_definitions')
        .where('profile_id', '=', input.profileId)
        .where('source_kind', '=', sourceKind)
        .where((eb) =>
            input.scope === 'workspace'
                ? eb('workspace_fingerprint', '=', input.workspaceFingerprint ?? '')
                : eb('workspace_fingerprint', 'is', null)
        )
        .execute();

    if (input.modes.length === 0) {
        return;
    }

    await db
        .insertInto('mode_definitions')
        .values(
            input.modes.map((mode) => ({
                id: `mode_${mode.modeKey}_${randomUUID()}`,
                profile_id: input.profileId,
                top_level_tab: mode.topLevelTab,
                mode_key: mode.modeKey,
                label: mode.label,
                asset_key: mode.assetKey,
                prompt_json: JSON.stringify(mode.prompt),
                prompt_layer_overrides_json: JSON.stringify(mode.promptLayerOverrides),
                execution_policy_json: JSON.stringify(mode.executionPolicy),
                source: mode.source,
                source_kind: mode.sourceKind,
                scope: mode.scope,
                workspace_fingerprint: mode.workspaceFingerprint ?? null,
                origin_path: mode.originPath,
                ...(mode.description ? { description: mode.description } : {}),
                ...(mode.whenToUse ? { when_to_use: mode.whenToUse } : {}),
                groups_json: JSON.stringify([]),
                tags_json: JSON.stringify(mode.tags ?? []),
                enabled: mode.enabled ? 1 : 0,
                precedence: mode.precedence,
                created_at: now,
                updated_at: now,
            }))
        )
        .execute();
}

export async function replaceDiscoveredRulesets(input: {
    profileId: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
    rulesets: ParsedRegistryRulesetAsset[];
}): Promise<void> {
    const { db } = getPersistence();
    const now = nowIso();
    const sourceKind = toSourceKind(input.scope);

    await db
        .deleteFrom('rulesets')
        .where('profile_id', '=', input.profileId)
        .where('source_kind', '=', sourceKind)
        .where((eb) =>
            input.scope === 'workspace'
                ? eb('workspace_fingerprint', '=', input.workspaceFingerprint ?? '')
                : eb('workspace_fingerprint', 'is', null)
        )
        .execute();

    if (input.rulesets.length === 0) {
        return;
    }

    await db
        .insertInto('rulesets')
        .values(
            input.rulesets.map((ruleset) => ({
                id: `ruleset_${randomUUID()}`,
                profile_id: input.profileId,
                asset_key: ruleset.assetKey,
                scope: ruleset.scope,
                workspace_fingerprint: ruleset.workspaceFingerprint ?? null,
                ...(ruleset.presetKey ? { preset_key: ruleset.presetKey } : {}),
                name: ruleset.name,
                body_markdown: ruleset.bodyMarkdown,
                source: ruleset.source,
                source_kind: ruleset.sourceKind,
                origin_path: ruleset.originPath,
                ...(ruleset.description ? { description: ruleset.description } : {}),
                tags_json: JSON.stringify(ruleset.tags ?? []),
                activation_mode: ruleset.activationMode,
                enabled: ruleset.enabled ? 1 : 0,
                precedence: ruleset.precedence,
                created_at: now,
                updated_at: now,
            }))
        )
        .execute();
}

export async function replaceDiscoveredSkillfiles(input: {
    profileId: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
    skillfiles: ParsedRegistrySkillAsset[];
}): Promise<void> {
    const { db } = getPersistence();
    const now = nowIso();
    const sourceKind = toSourceKind(input.scope);

    await db
        .deleteFrom('skillfiles')
        .where('profile_id', '=', input.profileId)
        .where('source_kind', '=', sourceKind)
        .where((eb) =>
            input.scope === 'workspace'
                ? eb('workspace_fingerprint', '=', input.workspaceFingerprint ?? '')
                : eb('workspace_fingerprint', 'is', null)
        )
        .execute();

    if (input.skillfiles.length === 0) {
        return;
    }

    await db
        .insertInto('skillfiles')
        .values(
            input.skillfiles.map((skillfile) => ({
                id: `skillfile_${randomUUID()}`,
                profile_id: input.profileId,
                asset_key: skillfile.assetKey,
                scope: skillfile.scope,
                workspace_fingerprint: skillfile.workspaceFingerprint ?? null,
                ...(skillfile.presetKey ? { preset_key: skillfile.presetKey } : {}),
                name: skillfile.name,
                body_markdown: skillfile.bodyMarkdown,
                dynamic_context_sources_json: JSON.stringify(skillfile.dynamicContextSources),
                source: skillfile.source,
                source_kind: skillfile.sourceKind,
                origin_path: skillfile.originPath,
                ...(skillfile.description ? { description: skillfile.description } : {}),
                tags_json: JSON.stringify(skillfile.tags ?? []),
                enabled: skillfile.enabled ? 1 : 0,
                precedence: skillfile.precedence,
                created_at: now,
                updated_at: now,
            }))
        )
        .execute();
}

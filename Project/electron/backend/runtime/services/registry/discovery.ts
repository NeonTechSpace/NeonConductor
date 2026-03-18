import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    ModeExecutionPolicy,
    RegistryScope,
    RegistrySourceKind,
    ToolCapability,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { toolCapabilities as knownToolCapabilities } from '@/app/backend/runtime/contracts';
import {
    loadRegistryAssetFiles,
    slugifyAssetKey,
    titleCaseFromKey,
    toSourceKind,
} from '@/app/backend/runtime/services/registry/filesystem';

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readTopLevelTab(value: unknown): TopLevelTab | undefined {
    return value === 'chat' || value === 'agent' || value === 'orchestrator' ? value : undefined;
}

function readTags(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const tags = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0);
    return tags.length > 0 ? tags : undefined;
}

function readToolCapabilities(value: unknown): ToolCapability[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const capabilities = value.filter(
        (capability): capability is ToolCapability =>
            typeof capability === 'string' && knownToolCapabilities.includes(capability as ToolCapability)
    );
    return capabilities.length > 0 ? Array.from(new Set(capabilities)) : undefined;
}

function mapModePrompt(bodyMarkdown: string): Record<string, unknown> {
    return {
        instructionsMarkdown: bodyMarkdown,
    };
}

interface DiscoveredModeInput {
    topLevelTab: 'agent';
    modeKey: string;
    label: string;
    assetKey: string;
    prompt: Record<string, unknown>;
    executionPolicy: ModeExecutionPolicy;
    source: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    sourceKind: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
    originPath: string;
    description?: string;
    tags?: string[];
    enabled: boolean;
    precedence: number;
}

interface DiscoveredModeDraft extends Omit<DiscoveredModeInput, 'workspaceFingerprint' | 'description' | 'tags'> {
    workspaceFingerprint?: string | undefined;
    description?: string | undefined;
    tags?: string[] | undefined;
}

interface DiscoveredAssetInput {
    assetKey: string;
    name: string;
    bodyMarkdown: string;
    source: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    sourceKind: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
    originPath: string;
    description?: string;
    tags?: string[];
    enabled: boolean;
    precedence: number;
}

interface DiscoveredAssetDraft extends Omit<DiscoveredAssetInput, 'workspaceFingerprint' | 'description' | 'tags'> {
    workspaceFingerprint?: string | undefined;
    description?: string | undefined;
    tags?: string[] | undefined;
}

function buildModeExecutionPolicy(input: {
    planningOnly?: boolean | undefined;
    readOnly?: boolean | undefined;
    toolCapabilities?: ToolCapability[] | undefined;
}): ModeExecutionPolicy {
    const normalizedToolCapabilities: ToolCapability[] | undefined =
        input.toolCapabilities && input.toolCapabilities.length > 0
            ? Array.from(new Set(input.toolCapabilities))
            : input.readOnly
              ? ['filesystem_read']
              : undefined;

    return {
        ...(input.planningOnly !== undefined ? { planningOnly: input.planningOnly } : {}),
        ...(normalizedToolCapabilities ? { toolCapabilities: normalizedToolCapabilities } : {}),
    };
}

function buildDiscoveredMode(input: DiscoveredModeDraft): DiscoveredModeInput {
    return {
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        label: input.label,
        assetKey: input.assetKey,
        prompt: input.prompt,
        executionPolicy: buildModeExecutionPolicy(input.executionPolicy),
        source: input.source,
        sourceKind: input.sourceKind,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        originPath: input.originPath,
        ...(input.description ? { description: input.description } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        enabled: input.enabled,
        precedence: input.precedence,
    };
}

function buildDiscoveredAsset(input: DiscoveredAssetDraft): DiscoveredAssetInput {
    return {
        assetKey: input.assetKey,
        name: input.name,
        bodyMarkdown: input.bodyMarkdown,
        source: input.source,
        sourceKind: input.sourceKind,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        originPath: input.originPath,
        ...(input.description ? { description: input.description } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        enabled: input.enabled,
        precedence: input.precedence,
    };
}

export async function replaceDiscoveredModes(input: {
    profileId: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
    modes: DiscoveredModeInput[];
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
                execution_policy_json: JSON.stringify(mode.executionPolicy),
                source: mode.source,
                source_kind: mode.sourceKind,
                scope: mode.scope,
                workspace_fingerprint: mode.workspaceFingerprint ?? null,
                origin_path: mode.originPath,
                description: mode.description ?? null,
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
    rulesets: DiscoveredAssetInput[];
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
                name: ruleset.name,
                body_markdown: ruleset.bodyMarkdown,
                source: ruleset.source,
                source_kind: ruleset.sourceKind,
                origin_path: ruleset.originPath,
                description: ruleset.description ?? null,
                tags_json: JSON.stringify(ruleset.tags ?? []),
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
    skillfiles: DiscoveredAssetInput[];
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
                name: skillfile.name,
                body_markdown: skillfile.bodyMarkdown,
                source: skillfile.source,
                source_kind: skillfile.sourceKind,
                origin_path: skillfile.originPath,
                description: skillfile.description ?? null,
                tags_json: JSON.stringify(skillfile.tags ?? []),
                enabled: skillfile.enabled ? 1 : 0,
                precedence: skillfile.precedence,
                created_at: now,
                updated_at: now,
            }))
        )
        .execute();
}

export async function buildDiscoveredAssets(input: {
    rootPath: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
}): Promise<{
    modes: DiscoveredModeInput[];
    rulesets: DiscoveredAssetInput[];
    skillfiles: DiscoveredAssetInput[];
}> {
    const sourceKind = toSourceKind(input.scope);
    const [modeFiles, rulesetFiles, skillFiles] = await Promise.all([
        loadRegistryAssetFiles({ rootPath: input.rootPath, directory: 'modes' }),
        loadRegistryAssetFiles({ rootPath: input.rootPath, directory: 'rules' }),
        loadRegistryAssetFiles({ rootPath: input.rootPath, directory: 'skills' }),
    ]);

    const modes = modeFiles.flatMap<DiscoveredModeInput>((file) => {
        const topLevelTab = readTopLevelTab(file.parsed.attributes['topLevelTab']) ?? 'agent';
        if (topLevelTab !== 'agent') {
            return [];
        }

        const modeKey = slugifyAssetKey(readString(file.parsed.attributes['modeKey']) ?? file.relativePath).replace(
            /\//g,
            '_'
        );
        if (!modeKey) {
            return [];
        }

        return [
            buildDiscoveredMode({
                topLevelTab,
                modeKey,
                label:
                    readString(file.parsed.attributes['label']) ??
                    readString(file.parsed.attributes['name']) ??
                    titleCaseFromKey(modeKey),
                assetKey: slugifyAssetKey(
                    readString(file.parsed.attributes['assetKey']) ??
                        readString(file.parsed.attributes['key']) ??
                        file.relativePath
                ),
                prompt: mapModePrompt(file.parsed.bodyMarkdown),
                executionPolicy: buildModeExecutionPolicy({
                    planningOnly: readBoolean(file.parsed.attributes['planningOnly']),
                    readOnly: readBoolean(file.parsed.attributes['readOnly']),
                    toolCapabilities: readToolCapabilities(file.parsed.attributes['toolCapabilities']),
                }),
                source: sourceKind,
                sourceKind,
                scope: input.scope,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                originPath: file.absolutePath,
                ...(readString(file.parsed.attributes['description'])
                    ? { description: readString(file.parsed.attributes['description']) }
                    : {}),
                ...(readTags(file.parsed.attributes['tags']) ? { tags: readTags(file.parsed.attributes['tags']) } : {}),
                enabled: readBoolean(file.parsed.attributes['enabled']) ?? true,
                precedence: readNumber(file.parsed.attributes['precedence']) ?? 0,
            }),
        ];
    });

    const rulesets = rulesetFiles.map((file) =>
        buildDiscoveredAsset({
            assetKey: slugifyAssetKey(
                readString(file.parsed.attributes['assetKey']) ??
                    readString(file.parsed.attributes['key']) ??
                    file.relativePath
            ),
            name: readString(file.parsed.attributes['name']) ?? titleCaseFromKey(file.relativePath),
            bodyMarkdown: file.parsed.bodyMarkdown,
            source: sourceKind,
            sourceKind,
            scope: input.scope,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            originPath: file.absolutePath,
            ...(readString(file.parsed.attributes['description'])
                ? { description: readString(file.parsed.attributes['description']) }
                : {}),
            ...(readTags(file.parsed.attributes['tags']) ? { tags: readTags(file.parsed.attributes['tags']) } : {}),
            enabled: readBoolean(file.parsed.attributes['enabled']) ?? true,
            precedence: readNumber(file.parsed.attributes['precedence']) ?? 0,
        })
    );

    const skillfiles = skillFiles.map((file) =>
        buildDiscoveredAsset({
            assetKey: slugifyAssetKey(
                readString(file.parsed.attributes['assetKey']) ??
                    readString(file.parsed.attributes['key']) ??
                    file.relativePath
            ),
            name: readString(file.parsed.attributes['name']) ?? titleCaseFromKey(file.relativePath),
            bodyMarkdown: file.parsed.bodyMarkdown,
            source: sourceKind,
            sourceKind,
            scope: input.scope,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            originPath: file.absolutePath,
            ...(readString(file.parsed.attributes['description'])
                ? { description: readString(file.parsed.attributes['description']) }
                : {}),
            ...(readTags(file.parsed.attributes['tags']) ? { tags: readTags(file.parsed.attributes['tags']) } : {}),
            enabled: readBoolean(file.parsed.attributes['enabled']) ?? true,
            precedence: readNumber(file.parsed.attributes['precedence']) ?? 0,
        })
    );

    return {
        modes,
        rulesets,
        skillfiles,
    };
}

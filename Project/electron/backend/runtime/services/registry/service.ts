import { modeStore, rulesetStore, settingsStore, skillfileStore } from '@/app/backend/persistence/stores';
import type {
    ModeDefinitionRecord,
    RulesetDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { pickActiveMode, toActiveModeKey } from '@/app/backend/runtime/services/mode/selection';
import { getRegistryPresetKeysForMode } from '@/app/backend/runtime/contracts';
import { buildDiscoveredAssets, replaceDiscoveredModes, replaceDiscoveredRulesets, replaceDiscoveredSkillfiles } from '@/app/backend/runtime/services/registry/discovery';
import { resolveRegistryPaths } from '@/app/backend/runtime/services/registry/filesystem';
import {
    resolveAssetDefinitions,
    resolveContextualAssetDefinitions,
    resolveModeDefinitions,
} from '@/app/backend/runtime/services/registry/resolution';
import type { RegistryListResolvedResult, RegistryRefreshResult } from '@/app/backend/runtime/services/registry/types';

function buildDiscoveredRegistryView(input: {
    modes: ModeDefinitionRecord[];
    rulesets: Awaited<ReturnType<typeof rulesetStore.listByProfile>>;
    skillfiles: SkillfileDefinitionRecord[];
    workspaceFingerprint?: string;
}): RegistryListResolvedResult['discovered'] {
    const global = {
        modes: input.modes.filter((mode) => mode.scope === 'global'),
        rulesets: input.rulesets.filter((ruleset) => ruleset.scope === 'global'),
        skillfiles: input.skillfiles.filter((skillfile) => skillfile.scope === 'global'),
    };

    if (!input.workspaceFingerprint) {
        return { global };
    }

    return {
        global,
        workspace: {
            modes: input.modes.filter(
                (mode) => mode.scope === 'workspace' && mode.workspaceFingerprint === input.workspaceFingerprint
            ),
            rulesets: input.rulesets.filter(
                (ruleset) =>
                    ruleset.scope === 'workspace' && ruleset.workspaceFingerprint === input.workspaceFingerprint
            ),
            skillfiles: input.skillfiles.filter(
                (skillfile) =>
                    skillfile.scope === 'workspace' && skillfile.workspaceFingerprint === input.workspaceFingerprint
            ),
        },
    };
}

function buildResolvedRegistryView(input: {
    modes: ModeDefinitionRecord[];
    rulesets: Awaited<ReturnType<typeof rulesetStore.listByProfile>>;
    skillfiles: SkillfileDefinitionRecord[];
    workspaceFingerprint?: string;
}): RegistryListResolvedResult['resolved'] {
    return {
        modes: [
            ...resolveModeDefinitions({
                modes: input.modes,
                topLevelTab: 'chat',
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            }),
            ...resolveModeDefinitions({
                modes: input.modes,
                topLevelTab: 'agent',
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            }),
            ...resolveModeDefinitions({
                modes: input.modes,
                topLevelTab: 'orchestrator',
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            }),
        ],
        rulesets: resolveAssetDefinitions({
            items: input.rulesets,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        }),
        skillfiles: resolveAssetDefinitions({
            items: input.skillfiles,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        }),
    };
}

export async function listResolvedRegistry(input: {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}): Promise<RegistryListResolvedResult> {
    const [paths, allModes, allRulesets, allSkillfiles] = await Promise.all([
        resolveRegistryPaths(input),
        modeStore.listByProfile(input.profileId),
        rulesetStore.listByProfile(input.profileId),
        skillfileStore.listByProfile(input.profileId),
    ]);

    return {
        paths,
        discovered: buildDiscoveredRegistryView({
            modes: allModes,
            rulesets: allRulesets,
            skillfiles: allSkillfiles,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        }),
        resolved: buildResolvedRegistryView({
            modes: allModes,
            rulesets: allRulesets,
            skillfiles: allSkillfiles,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        }),
    };
}

export async function searchResolvedSkillfiles(input: {
    profileId: string;
    query?: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab?: 'chat' | 'agent' | 'orchestrator';
    modeKey?: string;
}): Promise<SkillfileDefinitionRecord[]> {
    const resolved = await listResolvedRegistry(input);
    const skillfiles =
        input.topLevelTab && input.modeKey
            ? resolveContextualAssetDefinitions({
                  items: resolved.resolved.skillfiles,
                  ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                  activePresetKeys: getRegistryPresetKeysForMode({
                      topLevelTab: input.topLevelTab,
                      modeKey: input.modeKey,
                  }),
              })
            : resolved.resolved.skillfiles;
    const query = input.query?.trim().toLowerCase();
    if (!query) {
        return skillfiles;
    }

    return skillfiles.filter((skillfile) => {
        const haystacks = [skillfile.name, skillfile.description ?? '', ...(skillfile.tags ?? [])].map((value) =>
            value.toLowerCase()
        );
        return haystacks.some((value) => value.includes(query));
    });
}

export async function searchResolvedRulesets(input: {
    profileId: string;
    query?: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab?: 'chat' | 'agent' | 'orchestrator';
    modeKey?: string;
}): Promise<RulesetDefinitionRecord[]> {
    const resolved = await listResolvedRegistry(input);
    const rulesets =
        input.topLevelTab && input.modeKey
            ? resolveContextualAssetDefinitions({
                  items: resolved.resolved.rulesets,
                  ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                  activePresetKeys: getRegistryPresetKeysForMode({
                      topLevelTab: input.topLevelTab,
                      modeKey: input.modeKey,
                  }),
              })
            : resolved.resolved.rulesets;
    const query = input.query?.trim().toLowerCase();
    if (!query) {
        return rulesets;
    }

    return rulesets.filter((ruleset) => {
        const haystacks = [ruleset.name, ruleset.description ?? '', ...(ruleset.tags ?? [])].map((value) =>
            value.toLowerCase()
        );
        return haystacks.some((value) => value.includes(query));
    });
}

function resolveContextualAssetKeys<T extends RulesetDefinitionRecord | SkillfileDefinitionRecord>(input: {
    items: T[];
    assetKeys: string[];
    workspaceFingerprint?: string;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}): { items: T[]; missingAssetKeys: string[] } {
    const uniqueAssetKeys = Array.from(
        new Set(input.assetKeys.map((assetKey) => assetKey.trim()).filter((assetKey) => assetKey.length > 0))
    );
    if (uniqueAssetKeys.length === 0) {
        return {
            items: [],
            missingAssetKeys: [],
        };
    }

    const resolvedItems = resolveContextualAssetDefinitions({
        items: input.items,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        activePresetKeys: getRegistryPresetKeysForMode({
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
        }),
    });
    const itemByAssetKey = new Map(resolvedItems.map((item) => [item.assetKey, item] as const));

    const items: T[] = [];
    const missingAssetKeys: string[] = [];
    for (const assetKey of uniqueAssetKeys) {
        const item = itemByAssetKey.get(assetKey);
        if (!item) {
            missingAssetKeys.push(assetKey);
            continue;
        }
        items.push(item);
    }

    return {
        items,
        missingAssetKeys,
    };
}

export async function resolveSkillfilesByAssetKeys(input: {
    profileId: string;
    assetKeys: string[];
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}): Promise<{ skillfiles: SkillfileDefinitionRecord[]; missingAssetKeys: string[] }> {
    const resolved = await listResolvedRegistry(input);
    const skillfiles = resolveContextualAssetKeys({
        items: resolved.resolved.skillfiles,
        assetKeys: input.assetKeys,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    });

    return {
        skillfiles: skillfiles.items,
        missingAssetKeys: skillfiles.missingAssetKeys,
    };
}

export async function resolveRulesetsByAssetKeys(input: {
    profileId: string;
    assetKeys: string[];
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}): Promise<{ rulesets: RulesetDefinitionRecord[]; missingAssetKeys: string[] }> {
    const resolved = await listResolvedRegistry(input);
    const rulesets = resolveContextualAssetKeys({
        items: resolved.resolved.rulesets,
        assetKeys: input.assetKeys,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    });

    return {
        rulesets: rulesets.items,
        missingAssetKeys: rulesets.missingAssetKeys,
    };
}

export async function refreshRegistry(input: {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}): Promise<RegistryRefreshResult> {
    const paths = await resolveRegistryPaths(input);
    const globalAssets = await buildDiscoveredAssets({
        rootPath: paths.globalAssetsRoot,
        scope: 'global',
    });
    await Promise.all([
        replaceDiscoveredModes({
            profileId: input.profileId,
            scope: 'global',
            modes: globalAssets.modes,
        }),
        replaceDiscoveredRulesets({
            profileId: input.profileId,
            scope: 'global',
            rulesets: globalAssets.rulesets,
        }),
        replaceDiscoveredSkillfiles({
            profileId: input.profileId,
            scope: 'global',
            skillfiles: globalAssets.skillfiles,
        }),
    ]);

    let workspaceCounts: RegistryRefreshResult['refreshed']['workspace'] | undefined;
    if (input.workspaceFingerprint && paths.workspaceAssetsRoot) {
        const workspaceAssets = await buildDiscoveredAssets({
            rootPath: paths.workspaceAssetsRoot,
            scope: 'workspace',
            workspaceFingerprint: input.workspaceFingerprint,
        });
        await Promise.all([
            replaceDiscoveredModes({
                profileId: input.profileId,
                scope: 'workspace',
                workspaceFingerprint: input.workspaceFingerprint,
                modes: workspaceAssets.modes,
            }),
            replaceDiscoveredRulesets({
                profileId: input.profileId,
                scope: 'workspace',
                workspaceFingerprint: input.workspaceFingerprint,
                rulesets: workspaceAssets.rulesets,
            }),
            replaceDiscoveredSkillfiles({
                profileId: input.profileId,
                scope: 'workspace',
                workspaceFingerprint: input.workspaceFingerprint,
                skillfiles: workspaceAssets.skillfiles,
            }),
        ]);
        workspaceCounts = {
            modes: workspaceAssets.modes.length,
            rulesets: workspaceAssets.rulesets.length,
            skillfiles: workspaceAssets.skillfiles.length,
        };
    }

    const [resolvedRegistry, persistedAgentModeKey] = await Promise.all([
        listResolvedRegistry(input),
        settingsStore.getStringOptional(input.profileId, toActiveModeKey('agent', input.workspaceFingerprint)),
    ]);
    const agentModes = resolvedRegistry.resolved.modes.filter((mode) => mode.topLevelTab === 'agent');
    const activeAgentMode = pickActiveMode(agentModes, persistedAgentModeKey, 'agent') ?? agentModes[0];
    if (!activeAgentMode) {
        throw new InvariantError(`No enabled agent modes found for profile "${input.profileId}".`);
    }

    return {
        paths,
        refreshed: {
            global: {
                modes: globalAssets.modes.length,
                rulesets: globalAssets.rulesets.length,
                skillfiles: globalAssets.skillfiles.length,
            },
                ...(workspaceCounts ? { workspace: workspaceCounts } : {}),
        },
        resolvedRegistry,
        agentModes,
        activeAgentMode,
    };
}

export async function resolveModesForTab(input: {
    profileId: string;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    workspaceFingerprint?: string;
}): Promise<ModeDefinitionRecord[]> {
    const allModes = await modeStore.listByProfile(input.profileId);
    return resolveModeDefinitions({
        modes: allModes,
        topLevelTab: input.topLevelTab,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
}

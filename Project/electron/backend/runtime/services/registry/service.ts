import { modeStore, rulesetStore, skillfileStore } from '@/app/backend/persistence/stores';
import type {
    ModeDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';
import { buildDiscoveredAssets, replaceDiscoveredModes, replaceDiscoveredRulesets, replaceDiscoveredSkillfiles } from '@/app/backend/runtime/services/registry/discovery';
import { resolveRegistryPaths } from '@/app/backend/runtime/services/registry/filesystem';
import { resolveAssetDefinitions, resolveModeDefinitions } from '@/app/backend/runtime/services/registry/resolution';
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
    worktreeId?: `wt_${string}`;
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
    worktreeId?: `wt_${string}`;
}): Promise<SkillfileDefinitionRecord[]> {
    const resolved = await listResolvedRegistry(input);
    const query = input.query?.trim().toLowerCase();
    if (!query) {
        return resolved.resolved.skillfiles;
    }

    return resolved.resolved.skillfiles.filter((skillfile) => {
        const haystacks = [skillfile.name, skillfile.description ?? '', ...(skillfile.tags ?? [])].map((value) =>
            value.toLowerCase()
        );
        return haystacks.some((value) => value.includes(query));
    });
}

export async function resolveSkillfilesByAssetKeys(input: {
    profileId: string;
    assetKeys: string[];
    workspaceFingerprint?: string;
    worktreeId?: `wt_${string}`;
}): Promise<{ skillfiles: SkillfileDefinitionRecord[]; missingAssetKeys: string[] }> {
    const uniqueAssetKeys = Array.from(
        new Set(input.assetKeys.map((assetKey) => assetKey.trim()).filter((assetKey) => assetKey.length > 0))
    );
    if (uniqueAssetKeys.length === 0) {
        return {
            skillfiles: [],
            missingAssetKeys: [],
        };
    }

    const resolved = await listResolvedRegistry(input);
    const skillfileByAssetKey = new Map(
        resolved.resolved.skillfiles.map((skillfile) => [skillfile.assetKey, skillfile] as const)
    );

    const skillfiles: SkillfileDefinitionRecord[] = [];
    const missingAssetKeys: string[] = [];
    for (const assetKey of uniqueAssetKeys) {
        const skillfile = skillfileByAssetKey.get(assetKey);
        if (!skillfile) {
            missingAssetKeys.push(assetKey);
            continue;
        }
        skillfiles.push(skillfile);
    }

    return {
        skillfiles,
        missingAssetKeys,
    };
}

export async function refreshRegistry(input: {
    profileId: string;
    workspaceFingerprint?: string;
    worktreeId?: `wt_${string}`;
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

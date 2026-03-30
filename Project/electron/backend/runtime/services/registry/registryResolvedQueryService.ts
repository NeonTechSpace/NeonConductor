import { builtInModePromptOverrideStore, modeStore, rulesetStore, skillfileStore } from '@/app/backend/persistence/stores';
import type {
    ModeDefinitionRecord,
    RulesetDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';
import { getRegistryPresetKeysForMode } from '@/app/backend/runtime/contracts';
import {
    resolveAssetDefinitions,
    resolveContextualAssetDefinitions,
    resolveModeDefinitions,
} from '@/app/backend/runtime/services/registry/resolution';
import { resolveRegistryPaths } from '@/app/backend/runtime/services/registry/filesystem';
import type { RegistryListResolvedResult } from '@/app/backend/runtime/services/registry/types';

export interface RegistryResolvedBaseInput {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}

export interface RegistryResolvedQueryInput extends RegistryResolvedBaseInput {
    query?: string;
    topLevelTab?: 'chat' | 'agent' | 'orchestrator';
    modeKey?: string;
}

export interface RegistryResolvedLookupInput extends RegistryResolvedBaseInput {
    assetKeys: string[];
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}

function isBuiltInMode(mode: Pick<ModeDefinitionRecord, 'scope' | 'sourceKind'>): boolean {
    return mode.scope === 'system' && mode.sourceKind === 'system_seed';
}

async function applyBuiltInModePromptOverrides(input: {
    profileId: string;
    modes: ModeDefinitionRecord[];
}): Promise<ModeDefinitionRecord[]> {
    const overrides = await builtInModePromptOverrideStore.listByProfile(input.profileId);
    const overrideByKey = new Map(
        overrides.map((override) => [`${override.topLevelTab}:${override.modeKey}`, override] as const)
    );

    return input.modes.map((mode) => {
        if (!isBuiltInMode(mode)) {
            return mode;
        }

        const override = overrideByKey.get(`${mode.topLevelTab}:${mode.modeKey}`);
        if (!override) {
            return mode;
        }

        return {
            ...mode,
            prompt: {
                ...mode.prompt,
                ...override.prompt,
            },
        };
    });
}

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
                (ruleset) => ruleset.scope === 'workspace' && ruleset.workspaceFingerprint === input.workspaceFingerprint
            ),
            skillfiles: input.skillfiles.filter(
                (skillfile) => skillfile.scope === 'workspace' && skillfile.workspaceFingerprint === input.workspaceFingerprint
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

export class RegistryResolvedQueryService {
    async listResolvedRegistry(input: RegistryResolvedBaseInput): Promise<RegistryListResolvedResult> {
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

    async searchResolvedSkillfiles(input: RegistryResolvedQueryInput): Promise<SkillfileDefinitionRecord[]> {
        const resolved = await this.listResolvedRegistry(input);
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

    async searchResolvedRulesets(input: RegistryResolvedQueryInput): Promise<RulesetDefinitionRecord[]> {
        const resolved = await this.listResolvedRegistry(input);
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

    async resolveSkillfilesByAssetKeys(
        input: RegistryResolvedLookupInput
    ): Promise<{ skillfiles: SkillfileDefinitionRecord[]; missingAssetKeys: string[] }> {
        const resolved = await this.listResolvedRegistry(input);
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

    async resolveRulesetsByAssetKeys(
        input: RegistryResolvedLookupInput
    ): Promise<{ rulesets: RulesetDefinitionRecord[]; missingAssetKeys: string[] }> {
        const resolved = await this.listResolvedRegistry(input);
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

    async resolveModesForTab(input: {
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        workspaceFingerprint?: string;
    }): Promise<ModeDefinitionRecord[]> {
        const allModes = await modeStore.listByProfile(input.profileId);
        const resolvedModes = resolveModeDefinitions({
            modes: allModes,
            topLevelTab: input.topLevelTab,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        return applyBuiltInModePromptOverrides({
            profileId: input.profileId,
            modes: resolvedModes,
        });
    }
}

export const registryResolvedQueryService = new RegistryResolvedQueryService();

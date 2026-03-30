import type { RegistryPresetKey, RegistryScope } from '@/app/backend/runtime/contracts';
import { loadRegistryAssetFiles } from '@/app/backend/runtime/services/registry/filesystem';
import {
    createRegistryAssetParserContext,
    parseRegistryModeAsset,
    parseRegistryRulesetAsset,
    parseRegistrySkillAsset,
} from '@/app/backend/runtime/services/registry/registryAssetParser';
import type { RegistryDiscoveryBatch } from '@/app/backend/runtime/services/registry/registryLifecycle.types';

interface RegistryDirectoryInput {
    relativeDirectory: string;
    presetKey?: RegistryPresetKey;
}

const RULESET_DIRECTORIES: RegistryDirectoryInput[] = [
    { relativeDirectory: 'rules' },
    { relativeDirectory: 'rules-ask', presetKey: 'ask' },
    { relativeDirectory: 'rules-code', presetKey: 'code' },
    { relativeDirectory: 'rules-debug', presetKey: 'debug' },
    { relativeDirectory: 'rules-orchestrator', presetKey: 'orchestrator' },
];

const SKILL_DIRECTORIES: RegistryDirectoryInput[] = [
    { relativeDirectory: 'skills' },
    { relativeDirectory: 'skills-ask', presetKey: 'ask' },
    { relativeDirectory: 'skills-code', presetKey: 'code' },
    { relativeDirectory: 'skills-debug', presetKey: 'debug' },
    { relativeDirectory: 'skills-orchestrator', presetKey: 'orchestrator' },
];

export async function buildDiscoveredAssets(input: {
    rootPath: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
}): Promise<RegistryDiscoveryBatch> {
    const context = createRegistryAssetParserContext(input);

    const [modeFiles, rulesetFileGroups, skillFileGroups] = await Promise.all([
        loadRegistryAssetFiles({ rootPath: input.rootPath, relativeDirectory: 'modes', assetKind: 'modes' }),
        Promise.all(
            RULESET_DIRECTORIES.map((directory) =>
                loadRegistryAssetFiles({
                    rootPath: input.rootPath,
                    relativeDirectory: directory.relativeDirectory,
                    assetKind: 'rules',
                    ...(directory.presetKey ? { presetKey: directory.presetKey } : {}),
                })
            )
        ),
        Promise.all(
            SKILL_DIRECTORIES.map((directory) =>
                loadRegistryAssetFiles({
                    rootPath: input.rootPath,
                    relativeDirectory: directory.relativeDirectory,
                    assetKind: 'skills',
                    ...(directory.presetKey ? { presetKey: directory.presetKey } : {}),
                })
            )
        ),
    ]);

    return {
        modes: modeFiles.flatMap((file) => {
            const parsedMode = parseRegistryModeAsset(file, context);
            return parsedMode ? [parsedMode] : [];
        }),
        rulesets: rulesetFileGroups.flat().map((file) => parseRegistryRulesetAsset(file, context)),
        skillfiles: skillFileGroups.flat().map((file) => parseRegistrySkillAsset(file, context)),
    };
}

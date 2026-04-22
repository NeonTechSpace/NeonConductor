import type { RegistryScope } from '@/app/backend/runtime/contracts';
import {
    loadNativeRegistryAssetFiles,
    loadRegistryModeAssetFiles,
} from '@/app/backend/runtime/services/registry/filesystem';
import {
    createRegistryAssetParserContext,
    parseRegistryModeAsset,
    parseRegistryRulesetAsset,
    parseRegistrySkillAsset,
} from '@/app/backend/runtime/services/registry/registryAssetParser';
import type { RegistryDiscoveryBatch } from '@/app/backend/runtime/services/registry/registryLifecycle.types';

export async function buildDiscoveredAssets(input: {
    modeRootPath: string;
    nativeRootPath: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
}): Promise<RegistryDiscoveryBatch> {
    const context = createRegistryAssetParserContext(input);

    const [modeFiles, rulesetFiles, skillDiscovery] = await Promise.all([
        loadRegistryModeAssetFiles({ rootPath: input.modeRootPath }),
        loadNativeRegistryAssetFiles({
            rootPath: input.nativeRootPath,
            assetKind: 'rules',
            scope: input.scope,
        }),
        loadNativeRegistryAssetFiles({
            rootPath: input.nativeRootPath,
            assetKind: 'skills',
            scope: input.scope,
        }),
    ]);

    return {
        modes: modeFiles.flatMap((file) => {
            const parsedMode = parseRegistryModeAsset(file, context);
            return parsedMode ? [parsedMode] : [];
        }),
        rulesets: rulesetFiles.files.map((file) => parseRegistryRulesetAsset(file, context)),
        skillfiles: skillDiscovery.files.map((file) => parseRegistrySkillAsset(file, context)),
        diagnostics: [...rulesetFiles.diagnostics, ...skillDiscovery.diagnostics],
    };
}

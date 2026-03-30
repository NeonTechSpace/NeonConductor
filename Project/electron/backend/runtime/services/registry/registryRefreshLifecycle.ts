import type { RegistryRefreshResult } from '@/app/backend/runtime/contracts/types/registry';
import { buildDiscoveredAssets } from '@/app/backend/runtime/services/registry/registryDiscoveredAssetBuilder';
import { readActiveAgentModeAfterRefresh } from '@/app/backend/runtime/services/registry/registryActiveModeReadModel';
import { replaceDiscoveredModes, replaceDiscoveredRulesets, replaceDiscoveredSkillfiles } from '@/app/backend/runtime/services/registry/registryAssetPersistenceLifecycle';
import { registryResolvedQueryService } from '@/app/backend/runtime/services/registry/registryResolvedQueryService';
import { resolveRegistryPaths } from '@/app/backend/runtime/services/registry/filesystem';

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

    const resolvedRegistry = await registryResolvedQueryService.listResolvedRegistry(input);
    const activeAgentModeSelection = await readActiveAgentModeAfterRefresh({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        agentModes: resolvedRegistry.resolved.modes.filter((mode) => mode.topLevelTab === 'agent'),
    });

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
        agentModes: activeAgentModeSelection.agentModes,
        activeAgentMode: activeAgentModeSelection.activeAgentMode,
    };
}

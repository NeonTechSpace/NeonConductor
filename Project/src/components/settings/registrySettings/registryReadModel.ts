import { filterResolvedSkillfiles } from '@/web/components/settings/registrySettings/registrySkillSearch';

import type { RegistryListResolvedResult } from '@/app/backend/runtime/contracts/types/registry';
import type { WorkspaceRootRecord } from '@/shared/contracts/types/runtime';

export interface RegistryReadModel {
    workspaceRoots: WorkspaceRootRecord[];
    selectedWorkspaceFingerprint?: string;
    selectedWorkspaceRoot?: WorkspaceRootRecord;
    resolvedRules: RegistryListResolvedResult['resolved']['rulesets'];
    resolvedSkills: RegistryListResolvedResult['resolved']['skillfiles'];
    resolvedAgentModes: RegistryListResolvedResult['resolved']['modes'];
    discoveredGlobalModes: RegistryListResolvedResult['discovered']['global']['modes'];
    discoveredWorkspaceModes: NonNullable<RegistryListResolvedResult['discovered']['workspace']>['modes'];
    discoveredGlobalRules: RegistryListResolvedResult['discovered']['global']['rulesets'];
    discoveredWorkspaceRules: NonNullable<RegistryListResolvedResult['discovered']['workspace']>['rulesets'];
    discoveredGlobalSkills: RegistryListResolvedResult['discovered']['global']['skillfiles'];
    discoveredWorkspaceSkills: NonNullable<RegistryListResolvedResult['discovered']['workspace']>['skillfiles'];
    globalModeRoot?: string;
    globalNativeRoot?: string;
    workspaceModeRoot?: string;
    workspaceNativeRoot?: string;
    globalDiagnostics: RegistryListResolvedResult['diagnostics']['global'];
    workspaceDiagnostics: NonNullable<RegistryListResolvedResult['diagnostics']['workspace']>;
    skillMatches: RegistryListResolvedResult['resolved']['skillfiles'];
}

export function buildRegistryReadModel(input: {
    workspaceRoots: WorkspaceRootRecord[];
    selectedWorkspaceFingerprint: string | undefined;
    registryData: RegistryListResolvedResult | undefined;
    deferredSkillQuery: string;
}): RegistryReadModel {
    const resolvedAgentModes =
        input.registryData?.resolved.modes.filter((mode) => mode.topLevelTab === 'agent') ?? [];
    const selectedWorkspaceRoot = input.selectedWorkspaceFingerprint
        ? input.workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === input.selectedWorkspaceFingerprint)
        : undefined;

    return {
        workspaceRoots: input.workspaceRoots,
        ...(input.selectedWorkspaceFingerprint ? { selectedWorkspaceFingerprint: input.selectedWorkspaceFingerprint } : {}),
        ...(selectedWorkspaceRoot ? { selectedWorkspaceRoot } : {}),
        resolvedRules: input.registryData?.resolved.rulesets ?? [],
        resolvedSkills: input.registryData?.resolved.skillfiles ?? [],
        resolvedAgentModes,
        discoveredGlobalModes: input.registryData?.discovered.global.modes ?? [],
        discoveredWorkspaceModes: input.registryData?.discovered.workspace?.modes ?? [],
        discoveredGlobalRules: input.registryData?.discovered.global.rulesets ?? [],
        discoveredWorkspaceRules: input.registryData?.discovered.workspace?.rulesets ?? [],
        discoveredGlobalSkills: input.registryData?.discovered.global.skillfiles ?? [],
        discoveredWorkspaceSkills: input.registryData?.discovered.workspace?.skillfiles ?? [],
        ...(input.registryData?.paths.modeRoots.globalRoot
            ? { globalModeRoot: input.registryData.paths.modeRoots.globalRoot }
            : {}),
        ...(input.registryData?.paths.nativeRulesSkillsRoots.globalRoot
            ? { globalNativeRoot: input.registryData.paths.nativeRulesSkillsRoots.globalRoot }
            : {}),
        ...(input.registryData?.paths.modeRoots.workspaceRoot
            ? { workspaceModeRoot: input.registryData.paths.modeRoots.workspaceRoot }
            : {}),
        ...(input.registryData?.paths.nativeRulesSkillsRoots.workspaceRoot
            ? { workspaceNativeRoot: input.registryData.paths.nativeRulesSkillsRoots.workspaceRoot }
            : {}),
        globalDiagnostics: input.registryData?.diagnostics.global ?? [],
        workspaceDiagnostics: input.registryData?.diagnostics.workspace ?? [],
        skillMatches: filterResolvedSkillfiles(input.registryData?.resolved.skillfiles ?? [], input.deferredSkillQuery),
    };
}

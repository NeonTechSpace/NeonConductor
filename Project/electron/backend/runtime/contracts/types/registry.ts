import type {
    ModeDefinitionRecord,
    RulesetDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';
import type { TopLevelTab } from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface RegistryRefreshInput extends ProfileInput {
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
}

export interface RegistryListResolvedInput extends ProfileInput {
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
}

export interface RegistrySearchSkillsInput extends ProfileInput {
    query?: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    topLevelTab?: TopLevelTab;
    modeKey?: string;
}

export interface RegistrySearchRulesInput extends ProfileInput {
    query?: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    topLevelTab?: TopLevelTab;
    modeKey?: string;
}

export interface RegistryReadSkillBodyInput extends ProfileInput {
    skillId: string;
}

export interface RegistryModeRoots {
    globalRoot: string;
    workspaceRoot?: string;
}

export interface NativeRulesSkillsRoots {
    globalRoot: string;
    workspaceRoot?: string;
}

export interface RegistryDiscoveryDiagnostic {
    id: string;
    assetKind: 'rules' | 'skills';
    scope: 'global' | 'workspace';
    relativePath: string;
    severity: 'error';
    code:
        | 'invalid_target_layout'
        | 'invalid_target_folder'
        | 'invalid_target_mode'
        | 'invalid_package_layout';
    message: string;
    createdAt: string;
    updatedAt: string;
}

export interface RegistryPaths {
    modeRoots: RegistryModeRoots;
    nativeRulesSkillsRoots: NativeRulesSkillsRoots;
}

export interface RegistryResolvedView {
    modes: ModeDefinitionRecord[];
    rulesets: RulesetDefinitionRecord[];
    skillfiles: SkillfileDefinitionRecord[];
}

export interface RegistryDiscoveredView {
    global: RegistryResolvedView;
    workspace?: RegistryResolvedView;
}

export interface RegistryDiscoveryDiagnosticsView {
    global: RegistryDiscoveryDiagnostic[];
    workspace?: RegistryDiscoveryDiagnostic[];
}

export interface RegistryListResolvedResult {
    paths: RegistryPaths;
    discovered: RegistryDiscoveredView;
    diagnostics: RegistryDiscoveryDiagnosticsView;
    resolved: RegistryResolvedView;
}

export interface RegistryRefreshResult {
    paths: RegistryPaths;
    refreshed: {
        global: {
            modes: number;
            rulesets: number;
            skillfiles: number;
        };
        workspace?: {
            modes: number;
            rulesets: number;
            skillfiles: number;
        };
    };
    resolvedRegistry: RegistryListResolvedResult;
    agentModes: ModeDefinitionRecord[];
    activeAgentMode: ModeDefinitionRecord;
}

export type RegistryReadSkillBodyResult =
    | {
          found: false;
      }
    | {
          found: true;
          skillId: string;
          assetKey: string;
          name: string;
          bodyMarkdown: string;
      };

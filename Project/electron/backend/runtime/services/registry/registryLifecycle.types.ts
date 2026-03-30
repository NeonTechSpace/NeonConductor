import type {
    ModeExecutionPolicy,
    ModePromptDefinition,
    RegistryPresetKey,
    RegistryScope,
    RegistrySourceKind,
    RuleActivationMode,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import type {
    ModeDefinitionRecord,
    RulesetDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';
import type { RegistryListResolvedResult, RegistryPaths, RegistryRefreshResult } from '@/app/backend/runtime/services/registry/types';

export interface ParsedRegistryModeAsset {
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    assetKey: string;
    prompt: ModePromptDefinition;
    executionPolicy: ModeExecutionPolicy;
    source: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    sourceKind: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
    originPath: string;
    description?: string;
    whenToUse?: string;
    tags?: string[];
    enabled: boolean;
    precedence: number;
}

export interface ParsedRegistryAsset {
    assetKey: string;
    presetKey?: RegistryPresetKey;
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

export interface ParsedRegistryRulesetAsset extends ParsedRegistryAsset {
    activationMode: RuleActivationMode;
}

export interface ParsedRegistrySkillAsset extends ParsedRegistryAsset {}

export interface RegistryDiscoveryBatch {
    modes: ParsedRegistryModeAsset[];
    rulesets: ParsedRegistryRulesetAsset[];
    skillfiles: ParsedRegistrySkillAsset[];
}

export interface RegistryPersistenceScope {
    profileId: string;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
}

export interface RegistryRefreshContext {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}

export interface RegistryResolvedData {
    modes: ModeDefinitionRecord[];
    rulesets: RulesetDefinitionRecord[];
    skillfiles: SkillfileDefinitionRecord[];
}

export interface RegistryResolvedProjectionInput extends RegistryResolvedData {
    workspaceFingerprint?: string;
}

export interface RegistryListResolvedData extends RegistryResolvedData {
    paths: RegistryPaths;
    workspaceFingerprint?: string;
}

export interface RegistryActiveModeSelectionResult {
    agentModes: ModeDefinitionRecord[];
    activeAgentMode: ModeDefinitionRecord;
}

export interface RegistryRefreshExecutionResult {
    paths: RegistryPaths;
    resolvedRegistry: RegistryListResolvedResult;
    refreshed: RegistryRefreshResult['refreshed'];
}

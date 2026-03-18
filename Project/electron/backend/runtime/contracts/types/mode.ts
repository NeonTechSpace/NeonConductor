import type { RegistryScope, RegistrySourceKind, ToolCapability, TopLevelTab } from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface ModeExecutionPolicy {
    planningOnly?: boolean;
    toolCapabilities?: ToolCapability[];
}

export interface ModeDefinition {
    id: string;
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    assetKey: string;
    prompt: Record<string, unknown>;
    executionPolicy: ModeExecutionPolicy;
    source: string;
    sourceKind: RegistrySourceKind;
    scope: RegistryScope;
    workspaceFingerprint?: string;
    originPath?: string;
    description?: string;
    tags?: string[];
    enabled: boolean;
    precedence: number;
    createdAt: string;
    updatedAt: string;
}

export interface RulesetDefinition {
    id: string;
    profileId: string;
    assetKey: string;
    scope: RegistryScope;
    workspaceFingerprint?: string;
    name: string;
    bodyMarkdown: string;
    source: string;
    sourceKind: RegistrySourceKind;
    originPath?: string;
    description?: string;
    tags?: string[];
    enabled: boolean;
    precedence: number;
    createdAt: string;
    updatedAt: string;
}

export interface SkillfileDefinition {
    id: string;
    profileId: string;
    assetKey: string;
    scope: RegistryScope;
    workspaceFingerprint?: string;
    name: string;
    bodyMarkdown: string;
    source: string;
    sourceKind: RegistrySourceKind;
    originPath?: string;
    description?: string;
    tags?: string[];
    enabled: boolean;
    precedence: number;
    createdAt: string;
    updatedAt: string;
}

export interface ModeListInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
}

export interface ModeGetActiveInput extends ModeListInput {
    workspaceFingerprint?: string;
}

export interface ModeSetActiveInput extends ModeGetActiveInput {
    modeKey: string;
}

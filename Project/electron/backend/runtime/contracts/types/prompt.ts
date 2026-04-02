import type { TopLevelTab } from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { ModePromptDefinition } from '@/app/backend/runtime/contracts/types/mode';

import type {
    BehaviorFlag,
    RuntimeRequirementProfile,
    ToolCapability,
    WorkflowCapability,
} from '@/shared/contracts';

export interface FileBackedCustomModeSettingsItem {
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    description?: string;
    whenToUse?: string;
    tags?: string[];
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export interface FileBackedCustomModeSettingsByScope {
    global: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
    workspace?: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
}

export interface BuiltInModePromptSettingsItem {
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    prompt: ModePromptDefinition;
    hasOverride: boolean;
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export interface PromptLayerSettings {
    appGlobalInstructions: string;
    profileGlobalInstructions: string;
    topLevelInstructions: Record<TopLevelTab, string>;
    builtInModes: Record<TopLevelTab, BuiltInModePromptSettingsItem[]>;
    fileBackedCustomModes: FileBackedCustomModeSettingsByScope;
}

export interface PromptLayerGetSettingsInput extends ProfileInput {
    workspaceFingerprint?: string;
}

export interface PromptLayerSetAppGlobalInstructionsInput extends ProfileInput {
    value: string;
}

export type PromptLayerResetAppGlobalInstructionsInput = ProfileInput;

export interface PromptLayerSetProfileGlobalInstructionsInput extends ProfileInput {
    value: string;
}

export type PromptLayerResetProfileGlobalInstructionsInput = ProfileInput;

export interface PromptLayerSetTopLevelInstructionsInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    value: string;
}

export interface PromptLayerResetTopLevelInstructionsInput extends ProfileInput {
    topLevelTab: TopLevelTab;
}

export interface PromptLayerSetBuiltInModePromptInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
    roleDefinition: string;
    customInstructions: string;
}

export interface PromptLayerResetBuiltInModePromptInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
}

export interface PromptLayerExportCustomModeInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}

export interface PromptLayerCustomModePayload {
    slug: string;
    name: string;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export interface PromptLayerEditableCustomModePayload {
    name: string;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export interface PromptLayerCustomModeRecord {
    scope: 'global' | 'workspace';
    topLevelTab: TopLevelTab;
    modeKey: string;
    slug: string;
    name: string;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export interface PromptLayerGetCustomModeInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}

export interface PromptLayerCreateCustomModeInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    mode: PromptLayerCustomModePayload;
}

export interface PromptLayerUpdateCustomModeInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    mode: PromptLayerEditableCustomModePayload;
}

export interface PromptLayerDeleteCustomModeInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    confirm: boolean;
}

export interface PromptLayerImportCustomModeInput extends ProfileInput {
    topLevelTab: TopLevelTab;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    jsonText: string;
    overwrite: boolean;
}

export interface PromptLayerExportCustomModeResult {
    modeKey: string;
    scope: 'global' | 'workspace';
    jsonText: string;
}

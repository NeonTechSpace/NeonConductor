import type { InternalModelRole, ModeAuthoringRole, ModeRoleTemplateKey, TopLevelTab } from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { ModePromptDefinition } from '@/app/backend/runtime/contracts/types/mode';

import type {
    BehaviorFlag,
    RuntimeRequirementProfile,
    ToolCapability,
    WorkflowCapability,
} from '@/shared/contracts';

export const preparedContextEditablePromptLayerGroups = [
    'app_global_instructions',
    'profile_global_instructions',
    'top_level_instructions',
] as const;

export type PreparedContextEditablePromptLayerGroup =
    (typeof preparedContextEditablePromptLayerGroups)[number];

export const preparedContextInjectionCheckpoints = ['bootstrap', 'post_compaction_reseed'] as const;

export type PreparedContextInjectionCheckpoint = (typeof preparedContextInjectionCheckpoints)[number];

export const preparedContextProfileDefaultValues = ['include', 'exclude'] as const;

export type PreparedContextProfileDefaultValue = (typeof preparedContextProfileDefaultValues)[number];

export const preparedContextModeOverrideValues = ['inherit', 'include', 'exclude'] as const;

export type PreparedContextModeOverrideValue = (typeof preparedContextModeOverrideValues)[number];

export type PreparedContextProfileDefaults = Record<
    PreparedContextEditablePromptLayerGroup,
    Record<PreparedContextInjectionCheckpoint, PreparedContextProfileDefaultValue>
>;

export type PreparedContextModeOverrides = Record<
    PreparedContextEditablePromptLayerGroup,
    Record<PreparedContextInjectionCheckpoint, PreparedContextModeOverrideValue>
>;

function createCheckpointRecord<TValue>(value: TValue): Record<PreparedContextInjectionCheckpoint, TValue> {
    return {
        bootstrap: value,
        post_compaction_reseed: value,
    };
}

export function createDefaultPreparedContextProfileDefaults(): PreparedContextProfileDefaults {
    return {
        app_global_instructions: createCheckpointRecord('include'),
        profile_global_instructions: createCheckpointRecord('include'),
        top_level_instructions: createCheckpointRecord('include'),
    };
}

export function createDefaultPreparedContextModeOverrides(): PreparedContextModeOverrides {
    return {
        app_global_instructions: createCheckpointRecord('inherit'),
        profile_global_instructions: createCheckpointRecord('inherit'),
        top_level_instructions: createCheckpointRecord('inherit'),
    };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readProfileDefaultValue(value: unknown): PreparedContextProfileDefaultValue | undefined {
    return value === 'include' || value === 'exclude' ? value : undefined;
}

function readModeOverrideValue(value: unknown): PreparedContextModeOverrideValue | undefined {
    return value === 'inherit' || value === 'include' || value === 'exclude' ? value : undefined;
}

export function normalizePreparedContextProfileDefaults(value: unknown): PreparedContextProfileDefaults {
    const defaults = createDefaultPreparedContextProfileDefaults();
    if (!isJsonRecord(value)) {
        return defaults;
    }

    for (const group of preparedContextEditablePromptLayerGroups) {
        const groupValue = value[group];
        if (!isJsonRecord(groupValue)) {
            continue;
        }
        for (const checkpoint of preparedContextInjectionCheckpoints) {
            const normalizedValue = readProfileDefaultValue(groupValue[checkpoint]);
            if (normalizedValue) {
                defaults[group][checkpoint] = normalizedValue;
            }
        }
    }

    return defaults;
}

export function normalizePreparedContextModeOverrides(value: unknown): PreparedContextModeOverrides {
    const defaults = createDefaultPreparedContextModeOverrides();
    if (!isJsonRecord(value)) {
        return defaults;
    }

    for (const group of preparedContextEditablePromptLayerGroups) {
        const groupValue = value[group];
        if (!isJsonRecord(groupValue)) {
            continue;
        }
        for (const checkpoint of preparedContextInjectionCheckpoints) {
            const normalizedValue = readModeOverrideValue(groupValue[checkpoint]);
            if (normalizedValue) {
                defaults[group][checkpoint] = normalizedValue;
            }
        }
    }

    return defaults;
}

export interface FileBackedCustomModeSettingsItem {
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    internalModelRole: InternalModelRole;
    delegatedOnly: boolean;
    sessionSelectable: boolean;
    description?: string;
    whenToUse?: string;
    tags?: string[];
    promptLayerOverrides: PreparedContextModeOverrides;
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export interface FileBackedCustomModeSettingsByScope {
    global: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
    workspace?: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
}

export interface DelegatedCustomModeSettingsByScope {
    global: FileBackedCustomModeSettingsItem[];
    workspace?: FileBackedCustomModeSettingsItem[];
}

export interface BuiltInModePromptSettingsItem {
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    prompt: ModePromptDefinition;
    hasOverride: boolean;
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    internalModelRole: InternalModelRole;
    promptLayerOverrides: PreparedContextModeOverrides;
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export type ModeDraftSourceKind =
    | 'manual'
    | 'portable_json_v1'
    | 'portable_json_v2'
    | 'pasted_source_material';

export type ModeDraftValidationState = 'unvalidated' | 'valid' | 'invalid';

export interface PromptLayerModeDraftPayload {
    topLevelTab?: TopLevelTab;
    slug?: string;
    name?: string;
    authoringRole?: ModeAuthoringRole;
    roleTemplate?: ModeRoleTemplateKey;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    promptLayerOverrides?: PreparedContextModeOverrides;
}

export interface ModeDraftRecord {
    id: string;
    profileId: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    sourceKind: ModeDraftSourceKind;
    sourceText?: string;
    mode: PromptLayerModeDraftPayload;
    validationState: ModeDraftValidationState;
    validationErrors: string[];
    createdAt: string;
    updatedAt: string;
}

export interface PromptLayerSettings {
    appGlobalInstructions: string;
    profileGlobalInstructions: string;
    topLevelInstructions: Record<TopLevelTab, string>;
    preparedContextProfileDefaults: PreparedContextProfileDefaults;
    builtInModes: Record<TopLevelTab, BuiltInModePromptSettingsItem[]>;
    fileBackedCustomModes: FileBackedCustomModeSettingsByScope;
    delegatedWorkerModes: DelegatedCustomModeSettingsByScope;
    modeDrafts: ModeDraftRecord[];
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
    promptLayerOverrides: PreparedContextModeOverrides;
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
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    promptLayerOverrides?: PreparedContextModeOverrides;
}

export interface PromptLayerEditableCustomModePayload {
    name: string;
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    promptLayerOverrides?: PreparedContextModeOverrides;
}

export interface PromptLayerCustomModeRecord {
    scope: 'global' | 'workspace';
    topLevelTab: TopLevelTab;
    modeKey: string;
    slug: string;
    name: string;
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    internalModelRole: InternalModelRole;
    delegatedOnly: boolean;
    sessionSelectable: boolean;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    promptLayerOverrides: PreparedContextModeOverrides;
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
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    jsonText: string;
    topLevelTab?: TopLevelTab;
}

export interface PromptLayerExportCustomModeResult {
    modeKey: string;
    scope: 'global' | 'workspace';
    jsonText: string;
}

export interface PromptLayerCreateModeDraftInput extends ProfileInput {
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    sourceKind: ModeDraftSourceKind;
    sourceText?: string;
    mode: PromptLayerModeDraftPayload;
}

export interface PromptLayerUpdateModeDraftInput extends ProfileInput {
    draftId: string;
    mode: PromptLayerModeDraftPayload;
    sourceText?: string;
}

export interface PromptLayerValidateModeDraftInput extends ProfileInput {
    draftId: string;
}

export interface PromptLayerApplyModeDraftInput extends ProfileInput {
    draftId: string;
    overwrite: boolean;
}

export interface PromptLayerDiscardModeDraftInput extends ProfileInput {
    draftId: string;
}

export interface PromptLayerSetPreparedContextProfileDefaultsInput extends ProfileInput {
    defaults: PreparedContextProfileDefaults;
}

export type PromptLayerResetPreparedContextProfileDefaultsInput = ProfileInput;

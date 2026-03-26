import type {
    RegistryScope,
    RegistrySourceKind,
    RuleActivationMode,
    ToolCapability,
    TopLevelTab,
    RegistryPresetKey,
} from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface ModeExecutionPolicy {
    planningOnly?: boolean;
    toolCapabilities?: ToolCapability[];
}

export interface ModePromptDefinition {
    roleDefinition?: string;
    customInstructions?: string;
}

function readPromptTextArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const items = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0);
    return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

function isModePromptRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPromptText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeModePromptDefinition(value: unknown): ModePromptDefinition {
    if (!isModePromptRecord(value)) {
        return {};
    }

    const roleDefinition = readPromptText(value['roleDefinition']);
    const customInstructions =
        readPromptText(value['customInstructions']) ?? readPromptText(value['instructionsMarkdown']);

    return {
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
    };
}

export function normalizeModeMetadata(value: unknown): { whenToUse?: string; tags?: string[] } {
    if (!isModePromptRecord(value)) {
        return {};
    }

    const whenToUse = readPromptText(value['whenToUse']);
    const tags = readPromptTextArray(value['tags']);

    return {
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
    };
}

export function formatModePromptMarkdown(prompt: ModePromptDefinition): string {
    const roleDefinition = readPromptText(prompt.roleDefinition);
    const customInstructions = readPromptText(prompt.customInstructions);

    if (!roleDefinition && !customInstructions) {
        return '';
    }

    if (!roleDefinition && customInstructions) {
        return customInstructions;
    }

    const sections: string[] = [];
    if (roleDefinition) {
        sections.push(`## Role Definition\n\n${roleDefinition}`);
    }
    if (customInstructions) {
        sections.push(`## Custom Instructions\n\n${customInstructions}`);
    }

    return sections.join('\n\n');
}

export interface ModeDefinition {
    id: string;
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    assetKey: string;
    prompt: ModePromptDefinition;
    executionPolicy: ModeExecutionPolicy;
    source: string;
    sourceKind: RegistrySourceKind;
    scope: RegistryScope;
    workspaceFingerprint?: string;
    originPath?: string;
    description?: string;
    whenToUse?: string;
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
    presetKey?: RegistryPresetKey;
    scope: RegistryScope;
    workspaceFingerprint?: string;
    name: string;
    bodyMarkdown: string;
    activationMode: RuleActivationMode;
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
    presetKey?: RegistryPresetKey;
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

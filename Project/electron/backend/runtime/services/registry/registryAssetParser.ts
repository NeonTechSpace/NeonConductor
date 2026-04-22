import type {
    RegistryScope,
    RegistrySourceKind,
    RuleActivationMode,
    BehaviorFlag,
    ToolCapability,
    WorkflowCapability,
    RuntimeRequirementProfile,
    TopLevelTab,
    ModeExecutionPolicy,
    ModePromptDefinition,
    PreparedContextModeOverrides,
} from '@/app/backend/runtime/contracts';
import { normalizePreparedContextModeOverrides, ruleActivationModes } from '@/app/backend/runtime/contracts';
import type { RegistryAssetFile } from '@/app/backend/runtime/services/registry/filesystem';
import { slugifyAssetKey, titleCaseFromKey, toSourceKind } from '@/app/backend/runtime/services/registry/filesystem';
import { normalizeSkillDynamicContextSources } from '@/app/backend/runtime/services/sessionSkills/dynamicContextSources';
import type {
    ParsedRegistryModeAsset,
    ParsedRegistryRulesetAsset,
    ParsedRegistrySkillAsset,
} from '@/app/backend/runtime/services/registry/registryLifecycle.types';

import {
    behaviorFlags as knownBehaviorFlags,
    type InternalModelRole,
    type ModeAuthoringRole,
    type ModeRoleTemplateKey,
    internalModelRoles as knownInternalModelRoles,
    modeAuthoringRoles as knownModeAuthoringRoles,
    modeRoleTemplateKeys as knownModeRoleTemplateKeys,
    runtimeRequirementProfiles as knownRuntimeRequirementProfiles,
    toolCapabilities as knownToolCapabilities,
    workflowCapabilities as knownWorkflowCapabilities,
} from '@/shared/contracts/enums';
import { getModeRoleTemplateDefinition, normalizeModeExecutionMetadata } from '@/shared/modeRoleCatalog';

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readTopLevelTab(value: unknown): TopLevelTab | undefined {
    return value === 'chat' || value === 'agent' || value === 'orchestrator' ? value : undefined;
}

function readRuleActivationMode(value: unknown): RuleActivationMode | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return ruleActivationModes.find((mode) => mode === value);
}

function readTags(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const tags = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0);
    return tags.length > 0 ? tags : undefined;
}

function readOptionalStringList(value: unknown): string[] | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        return null;
    }

    const items = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0);
    return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

function readToolCapabilities(value: unknown): ToolCapability[] | null | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const capabilities: ToolCapability[] = [];
    for (const capability of value) {
        if (typeof capability !== 'string' || !knownToolCapabilities.includes(capability as ToolCapability)) {
            return null;
        }
        capabilities.push(capability as ToolCapability);
    }
    return Array.from(new Set(capabilities));
}

function readEnumList<const T extends readonly string[]>(value: unknown, allowedValues: T): T[number][] | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        return null;
    }

    const capabilities: T[number][] = [];
    for (const capability of value) {
        if (typeof capability !== 'string' || !allowedValues.includes(capability as T[number])) {
            return null;
        }
        capabilities.push(capability as T[number]);
    }
    return Array.from(new Set(capabilities));
}

function readRuntimeRequirementProfile(value: unknown): RuntimeRequirementProfile | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return null;
    }
    return (knownRuntimeRequirementProfiles as readonly string[]).includes(value)
        ? (value as RuntimeRequirementProfile)
        : null;
}

function readModeAuthoringRole(value: unknown): ModeAuthoringRole | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return null;
    }

    return (knownModeAuthoringRoles as readonly string[]).includes(value) ? (value as ModeAuthoringRole) : null;
}

function readModeRoleTemplateKey(value: unknown): ModeRoleTemplateKey | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return null;
    }

    return (knownModeRoleTemplateKeys as readonly string[]).includes(value) ? (value as ModeRoleTemplateKey) : null;
}

function readInternalModelRole(value: unknown): InternalModelRole | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return null;
    }

    return (knownInternalModelRoles as readonly string[]).includes(value) ? (value as InternalModelRole) : null;
}

function mapModePrompt(input: { bodyMarkdown: string; attributes: Record<string, unknown> }): ModePromptDefinition {
    const bodyInstructions = input.bodyMarkdown.trim();
    const customInstructions = readString(input.attributes['customInstructions']) ?? bodyInstructions;
    const roleDefinition = readString(input.attributes['roleDefinition']);

    return {
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions.length > 0 ? { customInstructions } : {}),
    };
}

function readPromptLayerOverrides(value: unknown): PreparedContextModeOverrides | undefined {
    if (value === undefined) {
        return undefined;
    }

    return normalizePreparedContextModeOverrides(isRecord(value) ? value : undefined);
}

function mergeTags(values: Array<string[] | undefined>): string[] | undefined {
    const mergedTags = values.flatMap((value) => value ?? []);
    return mergedTags.length > 0 ? Array.from(new Set(mergedTags)) : undefined;
}

export function buildModeExecutionPolicy(input: {
    authoringRole?: ReturnType<typeof readModeAuthoringRole> extends infer T ? Exclude<T, null | undefined> : never;
    roleTemplate?: ReturnType<typeof readModeRoleTemplateKey> extends infer T ? Exclude<T, null | undefined> : never;
    internalModelRole?: ReturnType<typeof readInternalModelRole> extends infer T ? Exclude<T, null | undefined> : never;
    delegatedOnly?: boolean;
    sessionSelectable?: boolean;
    planningOnly?: boolean;
    readOnly?: boolean;
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
    topLevelTab?: TopLevelTab;
    modeKey?: string;
}): ModeExecutionPolicy {
    const normalizedToolCapabilities: ToolCapability[] | undefined =
        input.toolCapabilities && input.toolCapabilities.length > 0
            ? Array.from(new Set(input.toolCapabilities))
            : input.readOnly
              ? ['filesystem_read']
              : undefined;

    const policy = {
        ...(input.authoringRole ? { authoringRole: input.authoringRole } : {}),
        ...(input.roleTemplate ? { roleTemplate: input.roleTemplate } : {}),
        ...(input.internalModelRole ? { internalModelRole: input.internalModelRole } : {}),
        ...(input.delegatedOnly !== undefined ? { delegatedOnly: input.delegatedOnly } : {}),
        ...(input.sessionSelectable !== undefined ? { sessionSelectable: input.sessionSelectable } : {}),
        ...(input.planningOnly !== undefined ? { planningOnly: input.planningOnly } : {}),
        ...(input.readOnly !== undefined ? { readOnly: input.readOnly } : {}),
        ...(normalizedToolCapabilities ? { toolCapabilities: normalizedToolCapabilities } : {}),
        ...(input.workflowCapabilities && input.workflowCapabilities.length > 0
            ? { workflowCapabilities: Array.from(new Set(input.workflowCapabilities)) }
            : {}),
        ...(input.behaviorFlags && input.behaviorFlags.length > 0
            ? { behaviorFlags: Array.from(new Set(input.behaviorFlags)) }
            : {}),
        ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
    };

    return normalizeModeExecutionMetadata({
        ...(input.topLevelTab ? { topLevelTab: input.topLevelTab } : {}),
        ...(input.modeKey ? { modeKey: input.modeKey } : {}),
        policy,
    });
}

export interface RegistryAssetParserContext {
    source: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    sourceKind: Extract<RegistrySourceKind, 'global_file' | 'workspace_file'>;
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
}

export function createRegistryAssetParserContext(input: {
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    workspaceFingerprint?: string;
}): RegistryAssetParserContext {
    const sourceKind = toSourceKind(input.scope);
    return {
        source: sourceKind,
        sourceKind,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    };
}

export function parseRegistryModeAsset(
    file: RegistryAssetFile,
    context: RegistryAssetParserContext
): ParsedRegistryModeAsset | null {
    const rawTopLevelTab = file.parsed.attributes['topLevelTab'];
    const parsedTopLevelTab = readTopLevelTab(rawTopLevelTab);
    if (rawTopLevelTab !== undefined && !parsedTopLevelTab) {
        return null;
    }

    const rawWhenToUse = file.parsed.attributes['whenToUse'];
    const parsedWhenToUse = rawWhenToUse === undefined ? undefined : readString(rawWhenToUse);
    if (rawWhenToUse !== undefined && !parsedWhenToUse) {
        return null;
    }

    const parsedLegacyGroups = readOptionalStringList(file.parsed.attributes['groups']);
    if (parsedLegacyGroups === null) {
        return null;
    }

    const modeKey = slugifyAssetKey(readString(file.parsed.attributes['modeKey']) ?? file.relativePath).replace(
        /\//g,
        '_'
    );
    if (!modeKey) {
        return null;
    }

    const description = readString(file.parsed.attributes['description']);
    const mergedTags = mergeTags([readTags(file.parsed.attributes['tags']), parsedLegacyGroups ?? undefined]);
    const authoringRole = readModeAuthoringRole(file.parsed.attributes['authoringRole']);
    if (authoringRole === null) {
        return null;
    }
    const roleTemplate = readModeRoleTemplateKey(file.parsed.attributes['roleTemplate']);
    if (roleTemplate === null) {
        return null;
    }
    const internalModelRole = readInternalModelRole(file.parsed.attributes['internalModelRole']);
    if (internalModelRole === null) {
        return null;
    }
    const delegatedOnly = readBoolean(file.parsed.attributes['delegatedOnly']);
    const sessionSelectable = readBoolean(file.parsed.attributes['sessionSelectable']);
    const planningOnly = readBoolean(file.parsed.attributes['planningOnly']);
    const readOnly = readBoolean(file.parsed.attributes['readOnly']);
    const toolCapabilities = readToolCapabilities(file.parsed.attributes['toolCapabilities']);
    if (toolCapabilities === null) {
        return null;
    }
    const workflowCapabilities = readEnumList(file.parsed.attributes['workflowCapabilities'], knownWorkflowCapabilities);
    if (workflowCapabilities === null) {
        return null;
    }
    const behaviorFlags = readEnumList(file.parsed.attributes['behaviorFlags'], knownBehaviorFlags);
    if (behaviorFlags === null) {
        return null;
    }
    const runtimeProfile = readRuntimeRequirementProfile(file.parsed.attributes['runtimeProfile']);
    if (runtimeProfile === null) {
        return null;
    }
    const promptLayerOverrides = readPromptLayerOverrides(file.parsed.attributes['promptLayerOverrides']);
    const templateTopLevelTab = roleTemplate ? getModeRoleTemplateDefinition(roleTemplate).topLevelTab : undefined;
    if (parsedTopLevelTab && templateTopLevelTab && parsedTopLevelTab !== templateTopLevelTab) {
        return null;
    }
    const topLevelTab = templateTopLevelTab ?? parsedTopLevelTab ?? 'agent';

    return {
        topLevelTab,
        modeKey,
        label:
            readString(file.parsed.attributes['label']) ??
            readString(file.parsed.attributes['name']) ??
            titleCaseFromKey(modeKey),
        assetKey: slugifyAssetKey(
            readString(file.parsed.attributes['assetKey']) ??
                readString(file.parsed.attributes['key']) ??
                file.assetPath
        ),
        prompt: mapModePrompt({
            bodyMarkdown: file.parsed.bodyMarkdown,
            attributes: file.parsed.attributes,
        }),
        promptLayerOverrides: promptLayerOverrides ?? normalizePreparedContextModeOverrides(undefined),
        executionPolicy: buildModeExecutionPolicy({
            ...(authoringRole !== undefined ? { authoringRole } : {}),
            ...(roleTemplate !== undefined ? { roleTemplate } : {}),
            ...(internalModelRole !== undefined ? { internalModelRole } : {}),
            ...(delegatedOnly !== undefined ? { delegatedOnly } : {}),
            ...(sessionSelectable !== undefined ? { sessionSelectable } : {}),
            ...(planningOnly !== undefined ? { planningOnly } : {}),
            ...(readOnly !== undefined ? { readOnly } : {}),
            ...(toolCapabilities !== undefined ? { toolCapabilities } : {}),
            ...(workflowCapabilities !== undefined ? { workflowCapabilities } : {}),
            ...(behaviorFlags !== undefined ? { behaviorFlags } : {}),
            ...(runtimeProfile !== undefined ? { runtimeProfile } : {}),
            topLevelTab,
            modeKey,
        }),
        source: context.source,
        sourceKind: context.sourceKind,
        scope: context.scope,
        ...(context.workspaceFingerprint ? { workspaceFingerprint: context.workspaceFingerprint } : {}),
        originPath: file.absolutePath,
        ...(description ? { description } : {}),
        ...(parsedWhenToUse ? { whenToUse: parsedWhenToUse } : {}),
        ...(mergedTags ? { tags: mergedTags } : {}),
        enabled: readBoolean(file.parsed.attributes['enabled']) ?? true,
        precedence: readNumber(file.parsed.attributes['precedence']) ?? 0,
    };
}

export function parseRegistryRulesetAsset(
    file: RegistryAssetFile,
    context: RegistryAssetParserContext
): ParsedRegistryRulesetAsset {
    const description = readString(file.parsed.attributes['description']);
    const tags = readTags(file.parsed.attributes['tags']);
    const targetKind = file.targetKind ?? 'shared';
    return {
        assetKey: slugifyAssetKey(
            readString(file.parsed.attributes['assetKey']) ??
                readString(file.parsed.attributes['key']) ??
                file.assetPath
        ),
        targetKind,
        ...(file.presetKey ? { presetKey: file.presetKey } : {}),
        ...(file.targetMode ? { targetMode: file.targetMode } : {}),
        relativeRootPath: file.relativeRootPath ?? file.relativePath,
        name: readString(file.parsed.attributes['name']) ?? titleCaseFromKey(file.assetPath),
        bodyMarkdown: file.parsed.bodyMarkdown,
        activationMode: readRuleActivationMode(file.parsed.attributes['activationMode']) ?? 'always',
        source: context.source,
        sourceKind: context.sourceKind,
        scope: context.scope,
        ...(context.workspaceFingerprint ? { workspaceFingerprint: context.workspaceFingerprint } : {}),
        originPath: file.absolutePath,
        ...(description ? { description } : {}),
        ...(tags ? { tags } : {}),
        enabled: readBoolean(file.parsed.attributes['enabled']) ?? true,
        precedence: readNumber(file.parsed.attributes['precedence']) ?? 0,
    };
}

export function parseRegistrySkillAsset(
    file: RegistryAssetFile,
    context: RegistryAssetParserContext
): ParsedRegistrySkillAsset {
    const description = readString(file.parsed.attributes['description']);
    const tags = readTags(file.parsed.attributes['tags']);
    const targetKind = file.targetKind ?? 'shared';
    return {
        assetKey: slugifyAssetKey(
            readString(file.parsed.attributes['assetKey']) ??
                readString(file.parsed.attributes['key']) ??
                file.assetPath
        ),
        targetKind,
        ...(file.presetKey ? { presetKey: file.presetKey } : {}),
        ...(file.targetMode ? { targetMode: file.targetMode } : {}),
        relativeRootPath: file.relativeRootPath ?? file.relativePath,
        name: readString(file.parsed.attributes['name']) ?? titleCaseFromKey(file.assetPath),
        dynamicContextSources: normalizeSkillDynamicContextSources(file.parsed.attributes['dynamicContextSources']),
        source: context.source,
        sourceKind: context.sourceKind,
        scope: context.scope,
        ...(context.workspaceFingerprint ? { workspaceFingerprint: context.workspaceFingerprint } : {}),
        originPath: file.absolutePath,
        ...(description ? { description } : {}),
        ...(tags ? { tags } : {}),
        enabled: readBoolean(file.parsed.attributes['enabled']) ?? true,
        precedence: readNumber(file.parsed.attributes['precedence']) ?? 0,
    };
}

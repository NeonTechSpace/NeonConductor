import type {
    RegistryScope,
    RegistrySourceKind,
    RuleActivationMode,
    ToolCapability,
    TopLevelTab,
    ModeExecutionPolicy,
    ModePromptDefinition,
} from '@/app/backend/runtime/contracts';
import { ruleActivationModes, toolCapabilities as knownToolCapabilities } from '@/app/backend/runtime/contracts';
import type { RegistryAssetFile } from '@/app/backend/runtime/services/registry/filesystem';
import { slugifyAssetKey, titleCaseFromKey, toSourceKind } from '@/app/backend/runtime/services/registry/filesystem';
import type {
    ParsedRegistryModeAsset,
    ParsedRegistryRulesetAsset,
    ParsedRegistrySkillAsset,
} from '@/app/backend/runtime/services/registry/registryLifecycle.types';

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readTopLevelTab(value: unknown): TopLevelTab | undefined {
    return value === 'chat' || value === 'agent' || value === 'orchestrator' ? value : undefined;
}

function readRuleActivationMode(value: unknown): RuleActivationMode | undefined {
    return typeof value === 'string' && ruleActivationModes.includes(value as RuleActivationMode)
        ? (value as RuleActivationMode)
        : undefined;
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

function readToolCapabilities(value: unknown): ToolCapability[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const capabilities = value.filter(
        (capability): capability is ToolCapability =>
            typeof capability === 'string' && knownToolCapabilities.includes(capability as ToolCapability)
    );
    return capabilities.length > 0 ? Array.from(new Set(capabilities)) : undefined;
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

function mergeTags(values: Array<string[] | undefined>): string[] | undefined {
    const mergedTags = values.flatMap((value) => value ?? []);
    return mergedTags.length > 0 ? Array.from(new Set(mergedTags)) : undefined;
}

export function buildModeExecutionPolicy(input: {
    planningOnly?: boolean;
    readOnly?: boolean;
    toolCapabilities?: ToolCapability[];
}): ModeExecutionPolicy {
    const normalizedToolCapabilities: ToolCapability[] | undefined =
        input.toolCapabilities && input.toolCapabilities.length > 0
            ? Array.from(new Set(input.toolCapabilities))
            : input.readOnly
              ? ['filesystem_read']
              : undefined;

    return {
        ...(input.planningOnly !== undefined ? { planningOnly: input.planningOnly } : {}),
        ...(normalizedToolCapabilities ? { toolCapabilities: normalizedToolCapabilities } : {}),
    };
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
    const planningOnly = readBoolean(file.parsed.attributes['planningOnly']);
    const readOnly = readBoolean(file.parsed.attributes['readOnly']);
    const toolCapabilities = readToolCapabilities(file.parsed.attributes['toolCapabilities']);
    const topLevelTab = parsedTopLevelTab ?? 'agent';

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
        executionPolicy: buildModeExecutionPolicy({
            ...(planningOnly !== undefined ? { planningOnly } : {}),
            ...(readOnly !== undefined ? { readOnly } : {}),
            ...(toolCapabilities !== undefined ? { toolCapabilities } : {}),
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
    return {
        assetKey: slugifyAssetKey(
            readString(file.parsed.attributes['assetKey']) ??
                readString(file.parsed.attributes['key']) ??
                file.assetPath
        ),
        ...(file.presetKey ? { presetKey: file.presetKey } : {}),
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
    return {
        assetKey: slugifyAssetKey(
            readString(file.parsed.attributes['assetKey']) ??
                readString(file.parsed.attributes['key']) ??
                file.assetPath
        ),
        ...(file.presetKey ? { presetKey: file.presetKey } : {}),
        name: readString(file.parsed.attributes['name']) ?? titleCaseFromKey(file.assetPath),
        bodyMarkdown: file.parsed.bodyMarkdown,
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

import { access, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ModeDefinitionRecord } from '@/app/backend/persistence/types';
import type {
    ModeAuthoringRole,
    ModeRoleTemplateKey,
    PromptLayerCustomModePayload,
    PromptLayerModeDraftPayload,
    PreparedContextModeOverrides,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { createDefaultPreparedContextModeOverrides, normalizePreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
import { slugifyAssetKey, resolveRegistryPaths } from '@/app/backend/runtime/services/registry/filesystem';

import { getModeRoleTemplateDefinition } from '@/shared/modeRoleCatalog';

export interface CanonicalCustomModePayload extends PromptLayerCustomModePayload {}

export interface PortableCustomModePayloadV1 {
    slug: string;
    name: string;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    groups?: string[];
}

export interface PortableCustomModePayloadV2 {
    version: 2;
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

export type ParsedPortableCustomModeJson =
    | { version: 'v1'; payload: PortableCustomModePayloadV1 }
    | { version: 'v2'; payload: PortableCustomModePayloadV2 };

const portableModeV1AllowedKeys = new Set([
    'slug',
    'name',
    'description',
    'roleDefinition',
    'customInstructions',
    'whenToUse',
    'groups',
]);

const portableModeV2AllowedKeys = new Set([
    'version',
    'slug',
    'name',
    'authoringRole',
    'roleTemplate',
    'description',
    'roleDefinition',
    'customInstructions',
    'whenToUse',
    'tags',
    'promptLayerOverrides',
]);

function readOptionalPortableString(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid "${field}": expected string.`);
    }

    return value.trim().length > 0 ? value.replace(/\r\n?/g, '\n').trim() : undefined;
}

function readOptionalPortableStringArray(value: unknown, field: 'groups' | 'tags'): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new Error(`Invalid "${field}": expected string array.`);
    }

    const items = value.map((item, index) => {
        if (typeof item !== 'string') {
            throw new Error(`Invalid "${field}[${String(index)}]": expected string.`);
        }

        return item.trim();
    });

    const filteredItems = items.filter((item) => item.length > 0);
    return filteredItems.length > 0 ? Array.from(new Set(filteredItems)) : undefined;
}

function normalizeCanonicalCustomModePayload(input: CanonicalCustomModePayload): CanonicalCustomModePayload {
    const slug = readOptionalPortableString(input.slug, 'slug');
    if (!slug) {
        throw new Error('Invalid "slug": expected non-empty string.');
    }
    const name = readOptionalPortableString(input.name, 'name');
    if (!name) {
        throw new Error('Invalid "name": expected non-empty string.');
    }

    getModeRoleTemplateDefinition(input.roleTemplate);
    const description = readOptionalPortableString(input.description, 'description');
    const roleDefinition = readOptionalPortableString(input.roleDefinition, 'roleDefinition');
    const customInstructions = readOptionalPortableString(input.customInstructions, 'customInstructions');
    const whenToUse = readOptionalPortableString(input.whenToUse, 'whenToUse');
    const tags = readOptionalPortableStringArray(input.tags, 'tags');

    return {
        slug,
        name,
        authoringRole: input.authoringRole,
        roleTemplate: input.roleTemplate,
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
    };
}

function normalizePortableCustomModePayloadV1(input: PortableCustomModePayloadV1): PortableCustomModePayloadV1 {
    const slug = readOptionalPortableString(input.slug, 'slug');
    if (!slug) {
        throw new Error('Invalid "slug": expected non-empty string.');
    }
    const name = readOptionalPortableString(input.name, 'name');
    if (!name) {
        throw new Error('Invalid "name": expected non-empty string.');
    }

    const description = readOptionalPortableString(input.description, 'description');
    const roleDefinition = readOptionalPortableString(input.roleDefinition, 'roleDefinition');
    const customInstructions = readOptionalPortableString(input.customInstructions, 'customInstructions');
    const whenToUse = readOptionalPortableString(input.whenToUse, 'whenToUse');
    const groups = readOptionalPortableStringArray(input.groups, 'groups');

    return {
        slug,
        name,
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(groups ? { groups } : {}),
    };
}

function normalizePortableCustomModePayloadV2(input: PortableCustomModePayloadV2): PortableCustomModePayloadV2 {
    const normalized = normalizeCanonicalCustomModePayload(input);

    return {
        version: 2,
        slug: normalized.slug,
        name: normalized.name,
        authoringRole: normalized.authoringRole,
        roleTemplate: normalized.roleTemplate,
        ...(normalized.description ? { description: normalized.description } : {}),
        ...(normalized.roleDefinition ? { roleDefinition: normalized.roleDefinition } : {}),
        ...(normalized.customInstructions ? { customInstructions: normalized.customInstructions } : {}),
        ...(normalized.whenToUse ? { whenToUse: normalized.whenToUse } : {}),
        ...(normalized.tags ? { tags: normalized.tags } : {}),
        ...(input.promptLayerOverrides ? { promptLayerOverrides: normalizePreparedContextModeOverrides(input.promptLayerOverrides) } : {}),
    };
}

function resolveLegacyImportRoleTemplate(input: {
    topLevelTab: TopLevelTab;
    groups?: string[];
}): { authoringRole: ModeAuthoringRole; roleTemplate: ModeRoleTemplateKey } {
    const groups = new Set(input.groups ?? []);
    if (input.topLevelTab === 'chat') {
        return {
            authoringRole: 'chat',
            roleTemplate: 'chat/default',
        };
    }
    if (input.topLevelTab === 'orchestrator') {
        return {
            authoringRole: 'orchestrator_primary',
            roleTemplate: groups.size === 0 ? 'orchestrator_primary/debug' : 'orchestrator_primary/orchestrate',
        };
    }

    if (groups.size === 0 || (groups.size === 1 && groups.has('read'))) {
        return {
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/ask',
        };
    }

    return {
        authoringRole: 'single_task_agent',
        roleTemplate: 'single_task_agent/apply',
    };
}

export function parsePortableCustomModeJson(jsonText: string): ParsedPortableCustomModeJson {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`Invalid custom mode JSON: ${(error as Error).message}`, {
            cause: error,
        });
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid custom mode JSON: expected object.');
    }

    const source = parsed as Record<string, unknown>;
    if (source.version === 2) {
        for (const key of Object.keys(source)) {
            if (!portableModeV2AllowedKeys.has(key)) {
                throw new Error(`Invalid custom mode field "${key}".`);
            }
        }

        return {
            version: 'v2',
            payload: normalizePortableCustomModePayloadV2({
                version: 2,
                slug: source.slug as string,
                name: source.name as string,
                authoringRole: source.authoringRole as ModeAuthoringRole,
                roleTemplate: source.roleTemplate as ModeRoleTemplateKey,
                ...(typeof source.description === 'string' ? { description: source.description } : {}),
                ...(typeof source.roleDefinition === 'string' ? { roleDefinition: source.roleDefinition } : {}),
                ...(typeof source.customInstructions === 'string' ? { customInstructions: source.customInstructions } : {}),
                ...(typeof source.whenToUse === 'string' ? { whenToUse: source.whenToUse } : {}),
                ...(source.tags !== undefined ? { tags: source.tags as string[] } : {}),
                ...(source.promptLayerOverrides !== undefined
                    ? { promptLayerOverrides: source.promptLayerOverrides as PreparedContextModeOverrides }
                    : {}),
            }),
        };
    }

    for (const key of Object.keys(source)) {
        if (!portableModeV1AllowedKeys.has(key)) {
            throw new Error(`Invalid custom mode field "${key}".`);
        }
    }

    return {
        version: 'v1',
        payload: normalizePortableCustomModePayloadV1({
            slug: source.slug as string,
            name: source.name as string,
            ...(typeof source.description === 'string' ? { description: source.description } : {}),
            ...(typeof source.roleDefinition === 'string' ? { roleDefinition: source.roleDefinition } : {}),
            ...(typeof source.customInstructions === 'string' ? { customInstructions: source.customInstructions } : {}),
            ...(typeof source.whenToUse === 'string' ? { whenToUse: source.whenToUse } : {}),
            ...(source.groups !== undefined ? { groups: source.groups as string[] } : {}),
        }),
    };
}

export function toDraftModePayloadFromPortableImport(input: {
    parsed: ParsedPortableCustomModeJson;
    topLevelTab?: TopLevelTab;
}): PromptLayerModeDraftPayload {
    if (input.parsed.version === 'v2') {
        return {
            slug: input.parsed.payload.slug,
            name: input.parsed.payload.name,
            authoringRole: input.parsed.payload.authoringRole,
            roleTemplate: input.parsed.payload.roleTemplate,
            ...(input.parsed.payload.description ? { description: input.parsed.payload.description } : {}),
            ...(input.parsed.payload.roleDefinition ? { roleDefinition: input.parsed.payload.roleDefinition } : {}),
            ...(input.parsed.payload.customInstructions
                ? { customInstructions: input.parsed.payload.customInstructions }
                : {}),
            ...(input.parsed.payload.whenToUse ? { whenToUse: input.parsed.payload.whenToUse } : {}),
            ...(input.parsed.payload.tags ? { tags: input.parsed.payload.tags } : {}),
            ...(input.parsed.payload.promptLayerOverrides
                ? { promptLayerOverrides: input.parsed.payload.promptLayerOverrides }
                : {}),
        };
    }

    const topLevelTab = input.topLevelTab;
    if (!topLevelTab) {
        throw new Error('Legacy custom mode JSON requires a topLevelTab during draft import.');
    }

    const resolvedRoleTemplate = resolveLegacyImportRoleTemplate(
        input.parsed.payload.groups
            ? {
                  topLevelTab,
                  groups: input.parsed.payload.groups,
              }
            : {
                  topLevelTab,
              }
    );
    return {
        topLevelTab,
        slug: input.parsed.payload.slug,
        name: input.parsed.payload.name,
        authoringRole: resolvedRoleTemplate.authoringRole,
        roleTemplate: resolvedRoleTemplate.roleTemplate,
        ...(input.parsed.payload.description ? { description: input.parsed.payload.description } : {}),
        ...(input.parsed.payload.roleDefinition ? { roleDefinition: input.parsed.payload.roleDefinition } : {}),
        ...(input.parsed.payload.customInstructions
            ? { customInstructions: input.parsed.payload.customInstructions }
            : {}),
        ...(input.parsed.payload.whenToUse ? { whenToUse: input.parsed.payload.whenToUse } : {}),
    };
}

export function toPortableModePayload(mode: ModeDefinitionRecord): PortableCustomModePayloadV2 {
    return normalizePortableCustomModePayloadV2({
        version: 2,
        slug: mode.modeKey,
        name: mode.label,
        authoringRole: mode.authoringRole,
        roleTemplate: mode.roleTemplate,
        ...(mode.description ? { description: mode.description } : {}),
        ...(mode.prompt.roleDefinition ? { roleDefinition: mode.prompt.roleDefinition } : {}),
        ...(mode.prompt.customInstructions ? { customInstructions: mode.prompt.customInstructions } : {}),
        ...(mode.whenToUse ? { whenToUse: mode.whenToUse } : {}),
        ...(mode.tags ? { tags: mode.tags } : {}),
        ...(mode.promptLayerOverrides !== undefined &&
        JSON.stringify(mode.promptLayerOverrides) !== JSON.stringify(createDefaultPreparedContextModeOverrides())
            ? { promptLayerOverrides: mode.promptLayerOverrides }
            : {}),
    });
}

export function buildCanonicalCustomModePayload(input: CanonicalCustomModePayload): CanonicalCustomModePayload {
    return normalizeCanonicalCustomModePayload(input);
}

function stringifyFrontmatterValue(value: string): string {
    return JSON.stringify(value.replace(/\r\n?/g, '\n'));
}

function renderPromptLayerOverridesFrontmatter(promptLayerOverrides: PreparedContextModeOverrides | undefined): string[] {
    const normalizedOverrides = normalizePreparedContextModeOverrides(promptLayerOverrides);
    if (JSON.stringify(normalizedOverrides) === JSON.stringify(createDefaultPreparedContextModeOverrides())) {
        return [];
    }

    const lines = ['promptLayerOverrides:'];
    for (const group of Object.keys(normalizedOverrides) as Array<keyof PreparedContextModeOverrides>) {
        lines.push(`  ${group}:`);
        for (const checkpoint of Object.keys(normalizedOverrides[group]) as Array<keyof PreparedContextModeOverrides[typeof group]>) {
            lines.push(`    ${checkpoint}: ${normalizedOverrides[group][checkpoint]}`);
        }
    }

    return lines;
}

export function renderCanonicalModeMarkdown(input: { payload: CanonicalCustomModePayload }): {
    topLevelTab: TopLevelTab;
    modeKey: string;
    fileContent: string;
} {
    const payload = normalizeCanonicalCustomModePayload(input.payload);
    const modeKey = slugifyAssetKey(payload.slug).replace(/\//g, '_');
    if (modeKey.length === 0) {
        throw new Error('Invalid "slug": could not derive a file-backed mode key.');
    }

    const templateDefinition = getModeRoleTemplateDefinition(payload.roleTemplate);
    const lines = [
        '---',
        `topLevelTab: ${templateDefinition.topLevelTab}`,
        `modeKey: ${modeKey}`,
        `label: ${stringifyFrontmatterValue(payload.name)}`,
        `authoringRole: ${payload.authoringRole}`,
        `roleTemplate: ${payload.roleTemplate}`,
        ...(payload.description ? [`description: ${stringifyFrontmatterValue(payload.description)}`] : []),
        ...(payload.whenToUse ? [`whenToUse: ${stringifyFrontmatterValue(payload.whenToUse)}`] : []),
        ...(payload.tags ? ['tags:', ...payload.tags.map((tag) => `  - ${stringifyFrontmatterValue(tag)}`)] : []),
        ...(payload.roleDefinition ? [`roleDefinition: ${stringifyFrontmatterValue(payload.roleDefinition)}`] : []),
        ...renderPromptLayerOverridesFrontmatter(payload.promptLayerOverrides),
        '---',
    ];
    const body = payload.customInstructions?.replace(/\r\n?/g, '\n').trim() ?? '';

    return {
        topLevelTab: templateDefinition.topLevelTab,
        modeKey,
        fileContent: body.length > 0 ? `${lines.join('\n')}\n${body}\n` : `${lines.join('\n')}\n`,
    };
}

export async function resolveCustomModeDirectory(input: {
    profileId: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}): Promise<string> {
    const paths = await resolveRegistryPaths({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });

    if (input.scope === 'workspace') {
        if (!paths.modeRoots.workspaceRoot || !input.workspaceFingerprint) {
            throw new Error('Workspace mode import requires a selected workspace.');
        }

        const directory = path.join(paths.modeRoots.workspaceRoot, 'modes');
        await mkdir(directory, { recursive: true });
        return directory;
    }

    const directory = path.join(paths.modeRoots.globalRoot, 'modes');
    await mkdir(directory, { recursive: true });
    return directory;
}

export async function writePortableModeFile(input: { absolutePath: string; fileContent: string }): Promise<void> {
    const directory = path.dirname(input.absolutePath);
    await mkdir(directory, { recursive: true });
    const tempPath = `${input.absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, input.fileContent, 'utf8');
    if (await fileExists(input.absolutePath)) {
        await unlink(input.absolutePath);
    }
    await rename(tempPath, input.absolutePath);
}

export async function deletePortableModeFile(absolutePath: string): Promise<void> {
    await unlink(absolutePath);
}

export async function fileExists(absolutePath: string): Promise<boolean> {
    try {
        await access(absolutePath);
        return true;
    } catch {
        return false;
    }
}
